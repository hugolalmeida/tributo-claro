// MODO DEMONSTRAÇÃO (GitHub Pages): não há servidor nem o motor da Receita.
// Responde às mesmas rotas da API dentro do navegador, com uma conta ILUSTRATIVA
// (valor do item × alíquota informada). Nada é enviado para fora do navegador
// e nada é gravado: o histórico some ao recarregar a página.

const REGIMES = [
  { id: 'simples', rotulo: 'Simples Nacional' },
  { id: 'simples-excesso', rotulo: 'Simples Nacional, excesso de sublimite' },
  { id: 'simples-por-fora', rotulo: 'Optante com IBS/CBS apurados por fora' },
];

const historico = [];
const num = (v) => {
  const t = String(v ?? '').trim();
  const n = Number(t.includes('.') ? t : t.replace(',', '.'));
  return t === '' || !Number.isFinite(n) ? null : n;
};
const dois = (n) => (Math.round(n * 100) / 100).toFixed(2);
const soma = (lista) => (lista.length ? dois(lista.reduce((a, b) => a + Number(b), 0)) : null);

function simular(e) {
  const erros = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.data || '')) erros.push({ campo: 'data', mensagem: 'Informe a data da operação.' });
  if (!Array.isArray(e.itens) || !e.itens.length) erros.push({ campo: 'itens', mensagem: 'Informe ao menos um item.' });
  (e.itens || []).forEach((it, i) => {
    // Na demonstração os códigos são opcionais (a conta ilustrativa não os usa); se vierem, o formato é conferido.
    if (it.cClassTrib && !/^\d{6}$/.test(it.cClassTrib)) erros.push({ campo: `itens[${i}].cClassTrib`, mensagem: 'cClassTrib deve ter 6 dígitos (ou deixe em branco na demonstração).' });
    if (it.cAtivSN && !/^\d{2}$/.test(it.cAtivSN)) erros.push({ campo: `itens[${i}].cAtivSN`, mensagem: 'Atividade deve ter 2 dígitos (ou deixe em branco na demonstração).' });
    const b = num(it.baseCalculo);
    if (b === null || b < 0) erros.push({ campo: `itens[${i}].baseCalculo`, mensagem: 'Valor do item inválido.' });
  });
  if (erros.length) return { status: 422, corpo: { erro: 'Entrada inválida.', erros } };

  const itens = e.itens.map((it, i) => {
    const base = num(it.baseCalculo);
    const pIBS = num(it.pIBSSN);
    const pCBS = num(it.pCBSSN);
    if (pIBS === null || pCBS === null) {
      return { numero: i + 1, estado: 'INCONSISTENCIA_ENTRADA', calculado: false, rotulo: 'Dado de entrada inconsistente',
        tributos: null, erros: [{ title: 'Alíquotas ausentes', detail: 'Na demonstração, informe as alíquotas de IBS e CBS do item.' }] };
    }
    const vIBS = dois(base * pIBS / 100);
    const vCBS = dois(base * pCBS / 100);
    const is = num(it.valorImpostoSeletivo) || 0;
    // Sem os códigos, a versão completa (motor da Receita) não calcularia o item: isso fica dito no rótulo.
    const semCodigos = !it.cAtivSN || !it.cClassTrib;
    const rotulo = semCodigos
      ? 'Calculado (ilustrativo). Sem atividade/cClassTrib: na versão completa, estes códigos são obrigatórios'
      : 'Calculado (ilustrativo)';
    return { numero: i + 1, estado: 'CALCULADO', calculado: true, rotulo, erros: [],
      tributos: { vRBSNitem: dois(base), vBC: dois(base), pIBSSN: String(pIBS), vIBSSN: vIBS, pCBSSN: String(pCBS), vCBSSN: vCBS,
        IS: is ? { valor: dois(is) } : undefined, totalItem: dois(Number(vIBS) + Number(vCBS) + is) } };
  });
  const calc = itens.filter((i) => i.calculado);
  const situacao = !calc.length ? 'nenhum-calculado' : calc.length < itens.length ? 'parcial' : 'completo';
  const total = {
    vRBSNtot: soma(itens.filter((i) => i.tributos).map((i) => i.tributos.vRBSNitem)),
    vIBSSNtot: soma(calc.map((i) => i.tributos.vIBSSN)),
    vCBSSNtot: soma(calc.map((i) => i.tributos.vCBSSN)),
    totalIs: soma(calc.filter((i) => i.tributos.IS).map((i) => i.tributos.IS.valor)),
    totalTributos: soma(calc.map((i) => i.tributos.totalItem)),
  };
  const registro = {
    id: crypto.randomUUID(), criadoEm: new Date().toISOString(), situacao,
    versaoMotor: { app: 'demonstração, sem o motor da Receita', banco: 'não se aplica' },
    entrada: e, resultado: { situacao, itens, total },
  };
  historico.unshift(registro);
  return { status: 200, corpo: { ...registro, natureza: 'simulacao' } };
}

export async function apiDemo(caminho, opcoes = {}) {
  const url = new URL(caminho, location.href);
  const rota = url.pathname.replace(/^.*\/api\//, '/api/');
  if (rota === '/api/regimes') return { status: 200, corpo: REGIMES };
  if (rota === '/api/atividades') return { status: 200, corpo: [] };
  if (rota === '/api/simulacoes' && opcoes.method === 'POST') return simular(JSON.parse(opcoes.body));
  if (rota === '/api/simulacoes') {
    return { status: 200, corpo: historico.map((s) => ({ id: s.id, criadoEm: s.criadoEm, situacao: s.situacao,
      data: s.entrada.data, itens: s.entrada.itens.length, totalTributos: s.resultado.total.totalTributos })) };
  }
  const m = rota.match(/^\/api\/simulacoes\/(.+)$/);
  if (m) {
    const s = historico.find((h) => h.id === m[1]);
    return s ? { status: 200, corpo: s } : { status: 404, corpo: { erro: 'Simulação não encontrada.' } };
  }
  return { status: 404, corpo: { erro: 'Não encontrado.' } };
}
