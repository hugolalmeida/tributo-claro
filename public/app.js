// Interface do simulador. Todo texto vindo da API entra por textContent
// (nunca innerHTML), para não executar conteúdo de terceiros.

const $ = (s) => document.querySelector(s);
const form = $('#form');
const corpoItens = $('#itens');
const statusEl = $('#status');

const SITUACOES = {
  completo: 'Todos os itens calculados',
  parcial: 'Parcial: há itens não calculados',
  'nenhum-calculado': 'Nenhum item calculado',
  rejeitada: 'Rejeitada pelo motor',
};

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dinheiro = (v) => (v === null || v === undefined || v === '' ? '—' : brl.format(Number(v)));
const pct = (v) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')}%`);

function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else e.setAttribute(k, v);
  }
  for (const f of filhos) if (f !== null && f !== undefined) e.append(f instanceof Node ? f : String(f));
  return e;
}

// Modo demonstração: página estática (GitHub Pages), sem servidor nem motor.
const DEMO = document.documentElement.dataset.modo === 'demo';
const apiDemo = DEMO ? (await import('./demo.js')).apiDemo : null;
if (DEMO) $('#aviso-demo').hidden = false;

async function api(caminho, opcoes) {
  if (DEMO) return apiDemo(caminho, opcoes);
  const resp = await fetch(caminho, opcoes);
  let corpo = null;
  try { corpo = await resp.json(); } catch { /* sem corpo */ }
  return { status: resp.status, corpo };
}

function renumerar() {
  [...corpoItens.rows].forEach((tr, i) => { tr.querySelector('.num').textContent = i + 1; });
}

function adicionarItem() {
  const tr = $('#tpl-item').content.firstElementChild.cloneNode(true);
  tr.querySelector('.remover').addEventListener('click', () => {
    if (corpoItens.rows.length > 1) { tr.remove(); renumerar(); }
  });
  corpoItens.append(tr);
  renumerar();
}

async function carregarRegimes() {
  const { corpo } = await api('/api/regimes');
  const sel = $('#regime');
  for (const r of corpo || []) sel.append(el('option', { value: r.id }, r.rotulo));
}

let ultimaConsulta = '';
async function carregarAtividades() {
  const data = form.data.value;
  const tpDoc = form.tpDoc.value;
  const chave = `${data}|${tpDoc}`;
  if (!data || chave === ultimaConsulta) return;
  ultimaConsulta = chave;
  const dica = $('#dica-atividades');
  const lista = $('#lista-atividades');
  const { status, corpo } = await api(`/api/atividades?data=${encodeURIComponent(data)}&tpDoc=${encodeURIComponent(tpDoc)}`);
  lista.replaceChildren();
  if (status !== 200 || !Array.isArray(corpo)) {
    dica.textContent = 'Não foi possível carregar a lista de atividades do motor. Você ainda pode digitar o código.';
    return;
  }
  for (const a of corpo.filter((x) => x.admissivel)) {
    lista.append(el('option', { value: a.codigo }, `${a.codigo} · ${a.descricao}${a.anexo ? ` (${a.anexo})` : ''}`));
  }
  const n = lista.children.length;
  if (DEMO) {
    dica.textContent = 'Na demonstração, a lista oficial de atividades não está disponível. Digite qualquer código de 2 dígitos (ex.: 01) para simular um item calculado, ou deixe em branco para ver um item "não calculado".';
    return;
  }
  dica.textContent = n === 0
    ? 'Nenhuma atividade vigente nesta data para este documento.'
    : `${n} ${n === 1 ? 'atividade vigente' : 'atividades vigentes'} nesta data para este documento. Comece a digitar no campo Atividade.`;
}

function lerFormulario() {
  return {
    data: form.data.value,
    tpDoc: form.tpDoc.value,
    regime: form.regime.value,
    tpEnteGov: form.tpEnteGov.value,
    itens: [...corpoItens.rows].map((tr) => Object.fromEntries(
      [...tr.querySelectorAll('input')].map((i) => [i.name, i.value.trim()]),
    )),
  };
}

function listaErros(erros) {
  const ul = el('ul', { class: 'erros' });
  for (const e of erros || []) {
    const partes = [e.code, e.title, e.detail || e.mensagem, e.pointer || e.campo].filter(Boolean);
    ul.append(el('li', {}, partes.join(' · ')));
  }
  return ul;
}

function mostrarResultado(r) {
  const alvo = $('#resultado-conteudo');
  alvo.replaceChildren();
  const res = r.resultado || {};
  const situacao = r.situacao || res.situacao;

  alvo.append(el('p', { class: `selo selo-${situacao}` }, `${DEMO ? "Simulação ilustrativa (demonstração)" : "Simulação"} · ${SITUACOES[situacao] || situacao}`));

  if (situacao === 'rejeitada') {
    alvo.append(el('p', {}, 'O motor recusou a operação inteira. Corrija os pontos abaixo e simule de novo.'));
    alvo.append(listaErros(r.errosMotor || res.erros));
  } else {
    const tabela = el('table', { class: 'resultado' });
    tabela.append(el('thead', {}, el('tr', {},
      ...['#', 'Situação do item', 'Receita bruta', 'Base IBS/CBS', 'Alíq. IBS', 'IBS', 'Alíq. CBS', 'CBS', 'Total do item'].map((t) => el('th', {}, t)))));
    const tb = el('tbody');
    for (const it of res.itens || []) {
      const t = it.tributos || {};
      tb.append(el('tr', { class: it.calculado ? '' : 'nao-calculado' },
        el('td', {}, it.numero), el('td', {}, it.rotulo),
        el('td', {}, dinheiro(t.vRBSNitem)), el('td', {}, dinheiro(t.vBC)),
        el('td', {}, pct(t.pIBSSN)), el('td', {}, dinheiro(t.vIBSSN)),
        el('td', {}, pct(t.pCBSSN)), el('td', {}, dinheiro(t.vCBSSN)),
        el('td', {}, dinheiro(t.totalItem))));
      if (it.erros?.length) {
        const td = el('td', { colspan: '9' }, listaErros(it.erros));
        tb.append(el('tr', { class: 'linha-erros' }, td));
      }
    }
    tabela.append(tb);
    alvo.append(tabela);

    const tot = res.total || {};
    alvo.append(el('dl', { class: 'totais' },
      el('dt', {}, 'Receita bruta (itens considerados)'), el('dd', {}, dinheiro(tot.vRBSNtot)),
      el('dt', {}, 'IBS simulado'), el('dd', {}, dinheiro(tot.vIBSSNtot)),
      el('dt', {}, 'CBS simulada'), el('dd', {}, dinheiro(tot.vCBSSNtot)),
      el('dt', {}, 'Imposto Seletivo (repassado)'), el('dd', {}, dinheiro(tot.totalIs)),
      el('dt', {}, DEMO ? 'Total simulado (ilustrativo)' : 'Total simulado'), el('dd', { class: 'destaque' }, dinheiro(tot.totalTributos))));
    if (situacao !== 'completo') {
      alvo.append(el('p', { class: 'alerta' }, 'Os totais somam só os itens calculados. Itens com outra situação ficaram de fora.'));
    }
  }

  const v = r.versaoMotor || {};
  alvo.append(el('p', { class: 'meta' },
    `Motor: versão ${v.app || 'não informada'} · base de dados ${v.banco || 'não informada'}`
    + (r.criadoEm ? ` · registrado em ${new Date(r.criadoEm).toLocaleString('pt-BR')}` : '')));
  alvo.append(el('p', { class: 'meta' }, 'Estimativa a partir dos dados informados. Não é apuração oficial nem valor a pagar.'));
  $('#resultado').hidden = false;
}

async function carregarHistorico() {
  const { corpo } = await api('/api/simulacoes');
  const tb = $('#historico');
  tb.replaceChildren();
  for (const s of corpo || []) {
    const ver = el('button', { type: 'button', class: 'secundario' }, 'Ver');
    ver.addEventListener('click', async () => {
      const { status, corpo: det } = await api(`/api/simulacoes/${s.id}`);
      if (status !== 200) return;
      mostrarResultado({ ...det, errosMotor: det.resultado?.erros });
      $('#resultado').scrollIntoView({ behavior: 'smooth' });
    });
    tb.append(el('tr', {},
      el('td', {}, new Date(s.criadoEm).toLocaleString('pt-BR')),
      el('td', {}, s.data ? s.data.split('-').reverse().join('/') : '—'),
      el('td', {}, s.itens),
      el('td', {}, SITUACOES[s.situacao] || s.situacao),
      el('td', {}, dinheiro(s.totalTributos)),
      el('td', {}, ver)));
  }
  if (!tb.children.length) tb.append(el('tr', {}, el('td', { colspan: '6' }, 'Nenhuma simulação ainda.')));
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const botao = $('#simular');
  botao.disabled = true;
  statusEl.textContent = 'Simulando…';
  try {
    const { status, corpo } = await api('/api/simulacoes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(lerFormulario()),
    });
    if (status === 200) {
      statusEl.textContent = '';
      mostrarResultado({ ...corpo, situacao: corpo.resultado.situacao });
    } else if (status === 422 && corpo?.errosMotor) {
      statusEl.textContent = '';
      mostrarResultado({ ...corpo, situacao: 'rejeitada' });
    } else if (status === 422) {
      statusEl.replaceChildren('Confira os campos: ', listaErros(corpo.erros));
    } else {
      statusEl.textContent = corpo?.erro || 'Não foi possível simular agora.';
    }
    await carregarHistorico();
  } catch {
    statusEl.textContent = 'Sem conexão com o simulador.';
  } finally {
    botao.disabled = false;
  }
});

$('#adicionar').addEventListener('click', adicionarItem);
form.data.addEventListener('change', carregarAtividades);
form.tpDoc.addEventListener('change', carregarAtividades);

form.data.value = new Date().toISOString().slice(0, 10);
adicionarItem();
carregarRegimes();
carregarAtividades();
carregarHistorico();
