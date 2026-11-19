// Validação de formato da entrada do simulador.
// O motor da Receita faz a validação tributária (códigos VSN-); aqui só
// barramos entradas malformadas antes de chamá-lo.

export const MAX_ITENS = 50;

// Combinações de regime que o motor calcula (NT 2026.005, regras C21a).
export const REGIMES = {
  'simples': { CRT: '1', tpRegimeIBSCBS: null, rotulo: 'Simples Nacional' },
  'simples-excesso': { CRT: '2', tpRegimeIBSCBS: null, rotulo: 'Simples Nacional, excesso de sublimite' },
  'simples-por-fora': { CRT: '3', tpRegimeIBSCBS: '2', rotulo: 'Optante com IBS/CBS apurados por fora' },
};

const TIPOS_DOC = new Set(['55', '65']);
const ENTES_GOV = new Set(['1', '2', '3', '4']);
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_VALOR = /^\d{1,13}(\.\d{1,2})?$/;
const RE_ALIQUOTA = /^\d{1,2}(\.\d{1,4})?$/;

function texto(v) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  return String(v).trim();
}

// Aceita "1234,56" como "1234.56". Não aceita separador de milhar.
function decimal(v) {
  const t = texto(v);
  if (t === null) return null;
  return t.includes('.') ? t : t.replace(',', '.');
}

function dataValida(s) {
  if (!RE_DATA.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Valida e normaliza a entrada do formulário.
 * @returns {{ ok: true, valor: object } | { ok: false, erros: {campo: string, mensagem: string}[] }}
 */
export function validarEntrada(corpo) {
  const erros = [];
  const erro = (campo, mensagem) => erros.push({ campo, mensagem });

  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    return { ok: false, erros: [{ campo: '', mensagem: 'Envie um objeto JSON.' }] };
  }

  const data = texto(corpo.data);
  if (!data || !dataValida(data)) erro('data', 'Informe a data da operação no formato AAAA-MM-DD.');

  const tpDoc = texto(corpo.tpDoc);
  if (!TIPOS_DOC.has(tpDoc)) erro('tpDoc', 'Tipo de documento deve ser 55 (NF-e) ou 65 (NFC-e).');

  const regime = REGIMES[texto(corpo.regime)];
  if (!regime) erro('regime', 'Escolha um dos regimes do Simples Nacional aceitos pelo simulador.');

  const tpEnteGov = texto(corpo.tpEnteGov);
  if (tpEnteGov && !ENTES_GOV.has(tpEnteGov)) erro('tpEnteGov', 'Ente governamental deve ser 1, 2, 3 ou 4.');

  const itensBrutos = corpo.itens;
  const itens = [];
  if (!Array.isArray(itensBrutos) || itensBrutos.length === 0) {
    erro('itens', 'Informe ao menos um item.');
  } else if (itensBrutos.length > MAX_ITENS) {
    erro('itens', `No máximo ${MAX_ITENS} itens por simulação.`);
  } else {
    itensBrutos.forEach((it, i) => {
      const p = `itens[${i}]`;
      if (!it || typeof it !== 'object') { erro(p, 'Item inválido.'); return; }
      const cClassTrib = texto(it.cClassTrib);
      const cAtivSN = texto(it.cAtivSN);
      const baseCalculo = decimal(it.baseCalculo);
      const valorIS = decimal(it.valorImpostoSeletivo) || '0.00';
      const pIBSSN = decimal(it.pIBSSN);
      const pCBSSN = decimal(it.pCBSSN);
      if (!/^\d{6}$/.test(cClassTrib || '')) erro(`${p}.cClassTrib`, 'cClassTrib deve ter 6 dígitos.');
      if (cAtivSN && !/^\d{2}$/.test(cAtivSN)) erro(`${p}.cAtivSN`, 'Atividade deve ter 2 dígitos (ex.: 01).');
      if (!RE_VALOR.test(baseCalculo || '')) erro(`${p}.baseCalculo`, 'Valor do item inválido (use até 2 casas decimais).');
      if (!RE_VALOR.test(valorIS || '')) erro(`${p}.valorImpostoSeletivo`, 'Imposto Seletivo inválido.');
      if (pIBSSN && !RE_ALIQUOTA.test(pIBSSN)) erro(`${p}.pIBSSN`, 'Alíquota de IBS inválida (em %, até 4 casas).');
      if (pCBSSN && !RE_ALIQUOTA.test(pCBSSN)) erro(`${p}.pCBSSN`, 'Alíquota de CBS inválida (em %, até 4 casas).');
      itens.push({
        numero: i + 1,
        cAtivSN: cAtivSN || null,
        cClassTrib,
        baseCalculo,
        valorImpostoSeletivo: valorIS,
        pIBSSN: pIBSSN || null,
        pCBSSN: pCBSSN || null,
      });
    });
  }

  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    valor: { data, tpDoc, regime: texto(corpo.regime), tpEnteGov: tpEnteGov || null, itens },
  };
}
