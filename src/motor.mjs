// Adaptador do motor "calculadora-rtc-simples-nacional" (Receita Federal, MIT).
// Contrato lido do código-fonte no commit fixado em motor/Dockerfile:
//   POST {MOTOR_URL}/calculadora/observabilidade/simples-nacional
//   GET  {MOTOR_URL}/calculadora/simples-nacional/atividades?data=AAAA-MM-DD[&tpDoc=55]
// Cabeçalhos de versão na resposta: X-CALC-APP-VERSION e X-CALC-DB-VERSION.
// HTTP 200 NÃO significa que todos os itens foram calculados: ver estadoItem.

import { randomBytes } from 'node:crypto';
import { REGIMES } from './validacao.mjs';

export const VERSAO_PAYLOAD = '2.0.0';
const LIMITE_RESPOSTA = 2 * 1024 * 1024;

export const ESTADOS = {
  CALCULADO: { rotulo: 'Calculado', ok: true },
  NAO_CALCULADO: { rotulo: 'Não calculado: atividade ausente, fora de vigência ou não admitida no documento', ok: false },
  NAO_IMPLEMENTADO: { rotulo: 'Tratamento ainda não implementado no motor', ok: false },
  INCONSISTENCIA_ENTRADA: { rotulo: 'Dado de entrada inconsistente', ok: false },
  FALHA_TECNICA: { rotulo: 'Falha técnica no motor', ok: false },
};

export class ErroMotor extends Error {
  constructor(tipo, mensagem, { status = null, erros = [] } = {}) {
    super(mensagem);
    this.tipo = tipo; // 'rejeitado' (4xx do motor) | 'indisponivel'
    this.status = status;
    this.erros = erros;
  }
}

/** Monta o corpo esperado pelo motor a partir da entrada já validada. */
export function montarPayload(entrada) {
  const regime = REGIMES[entrada.regime];
  const payload = {
    id: randomBytes(12).toString('hex'),
    versao: VERSAO_PAYLOAD,
    data: entrada.data,
    tpDoc: entrada.tpDoc,
    CRT: regime.CRT,
    itens: entrada.itens.map((it) => {
      const item = {
        numero: it.numero,
        cClassTrib: it.cClassTrib,
        baseCalculo: it.baseCalculo,
        valorImpostoSeletivo: it.valorImpostoSeletivo,
      };
      if (it.cAtivSN) item.cAtivSN = it.cAtivSN;
      if (it.pIBSSN) item.pIBSSN = it.pIBSSN;
      if (it.pCBSSN) item.pCBSSN = it.pCBSSN;
      return item;
    }),
  };
  if (regime.tpRegimeIBSCBS) payload.tpRegimeIBSCBS = regime.tpRegimeIBSCBS;
  if (entrada.tpEnteGov) payload.tpEnteGov = entrada.tpEnteGov;
  return payload;
}

/** Copia só os campos conhecidos de um erro do motor (RFC 9457). */
function limparErro(e) {
  if (!e || typeof e !== 'object') return null;
  const s = (v) => (typeof v === 'string' ? v.slice(0, 500) : undefined);
  return { code: s(e.code), title: s(e.title), pointer: s(e.pointer), detail: s(e.detail) };
}

async function lerJson(resp) {
  const tamanho = Number(resp.headers.get('content-length') || 0);
  if (tamanho > LIMITE_RESPOSTA) throw new ErroMotor('indisponivel', 'Resposta do motor grande demais.');
  const textoResp = await resp.text();
  if (textoResp.length > LIMITE_RESPOSTA) throw new ErroMotor('indisponivel', 'Resposta do motor grande demais.');
  try {
    return JSON.parse(textoResp);
  } catch {
    throw new ErroMotor('indisponivel', 'Resposta do motor não é JSON válido.', { status: resp.status });
  }
}

async function requisitar(url, opcoes, timeoutMs) {
  try {
    return await fetch(url, { ...opcoes, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const motivo = e?.name === 'TimeoutError' ? 'o motor demorou demais para responder' : 'não foi possível conectar ao motor';
    throw new ErroMotor('indisponivel', `Motor indisponível: ${motivo}.`);
  }
}

/** Interpreta a resposta 200 do motor, item a item. */
export function interpretar(resposta) {
  const objetos = Array.isArray(resposta?.objetos) ? resposta.objetos : [];
  const contagem = {};
  const itens = objetos.map((o) => {
    const estado = typeof o?.estadoItem === 'string' ? o.estadoItem : 'DESCONHECIDO';
    const info = ESTADOS[estado] || { rotulo: `Estado não reconhecido (${estado})`, ok: false };
    contagem[estado] = (contagem[estado] || 0) + 1;
    return {
      numero: o?.nObj ?? null,
      estado,
      rotulo: info.rotulo,
      calculado: info.ok,
      tributos: o?.tribCalc && typeof o.tribCalc === 'object' ? o.tribCalc : null,
      erros: Array.isArray(o?.erros) ? o.erros.map(limparErro).filter(Boolean) : [],
    };
  });
  const calculados = itens.filter((i) => i.calculado).length;
  let situacao = 'completo';
  if (itens.length === 0 || calculados === 0) situacao = 'nenhum-calculado';
  else if (calculados < itens.length) situacao = 'parcial';
  return { situacao, contagem, itens, total: resposta?.total ?? null };
}

export function criarClienteMotor({ url, timeoutMs = 15000 }) {
  const base = url.replace(/\/+$/, '');

  return {
    async simular(entrada) {
      const payload = montarPayload(entrada);
      const resp = await requisitar(`${base}/calculadora/observabilidade/simples-nacional`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      }, timeoutMs);
      const versao = {
        app: resp.headers.get('x-calc-app-version'),
        banco: resp.headers.get('x-calc-db-version'),
      };
      if (resp.status === 200) {
        const corpo = await lerJson(resp);
        return { payload, versao, resposta: corpo, resultado: interpretar(corpo) };
      }
      if (resp.status >= 400 && resp.status < 500) {
        let corpo = null;
        try { corpo = await lerJson(resp); } catch { /* corpo ilegível */ }
        const erros = Array.isArray(corpo?.errors) ? corpo.errors.map(limparErro).filter(Boolean) : [];
        throw new ErroMotor('rejeitado', 'O motor rejeitou a operação.', { status: resp.status, erros });
      }
      throw new ErroMotor('indisponivel', `Motor respondeu com erro (HTTP ${resp.status}).`, { status: resp.status });
    },

    async atividades({ data, tpDoc }) {
      const qs = new URLSearchParams({ data });
      if (tpDoc) qs.set('tpDoc', tpDoc);
      const resp = await requisitar(`${base}/calculadora/simples-nacional/atividades?${qs}`, {
        headers: { accept: 'application/json' },
      }, timeoutMs);
      if (resp.status !== 200) throw new ErroMotor('indisponivel', `Motor respondeu com erro (HTTP ${resp.status}).`, { status: resp.status });
      const lista = await lerJson(resp);
      if (!Array.isArray(lista)) return [];
      return lista
        .filter((a) => a && typeof a.codigo === 'string')
        .map((a) => ({
          codigo: a.codigo,
          descricao: typeof a.descricao === 'string' ? a.descricao : '',
          anexo: typeof a.rotuloCurtoAnexo === 'string' ? a.rotuloCurtoAnexo : null,
          admissivel: a.admissivelNoDocumento !== false,
        }));
    },
  };
}
