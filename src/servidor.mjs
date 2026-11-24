// Servidor HTTP do simulador (node:http, sem framework).
// Sem login nesta versão: por isso só aceita Host/Origin da lista permitida
// (protege contra DNS rebinding e requisições de outros sites) e deve rodar
// em 127.0.0.1 ou atrás de uma camada com autenticação.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validarEntrada, REGIMES } from './validacao.mjs';
import { ErroMotor } from './motor.mjs';

const LIMITE_CORPO = 64 * 1024;
const PASTA_PUBLICA = fileURLToPath(new URL('../public/', import.meta.url));

const ARQUIVOS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/estilo.css': ['estilo.css', 'text/css; charset=utf-8'],
  ...Object.fromEntries([400, 600, 700].map((p) => [`/fontes/manrope-latin-${p}-normal.woff2`, [`fontes/manrope-latin-${p}-normal.woff2`, 'font/woff2']])),
};

const CABECALHOS_SEGURANCA = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

function enviar(res, status, corpo, tipo = 'application/json; charset=utf-8') {
  const dados = typeof corpo === 'string' || Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo);
  const extra = status === 413 ? { connection: 'close' } : {};
  res.writeHead(status, { ...CABECALHOS_SEGURANCA, ...extra, 'content-type': tipo, 'cache-control': 'no-store' });
  res.end(dados);
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes = [];
    const aoReceber = (c) => {
      tamanho += c.length;
      if (tamanho > LIMITE_CORPO) {
        // para de guardar; a resposta 413 sai com "connection: close"
        req.off('data', aoReceber);
        req.resume();
        reject(Object.assign(new Error('grande'), { status: 413 }));
        return;
      }
      partes.push(c);
    };
    req.on('data', aoReceber);
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', reject);
  });
}

export function criarServidor({ motor, historico, hostsPermitidos, catalogo = null }) {
  const hosts = new Set(hostsPermitidos.map((h) => h.toLowerCase()));
  const estaticos = Object.fromEntries(Object.entries(ARQUIVOS).map(([rota, [arq, tipo]]) =>
    [rota, { conteudo: readFileSync(join(PASTA_PUBLICA, arq)), tipo }]));

  function origemPermitida(req) {
    const host = (req.headers.host || '').toLowerCase();
    if (!hosts.has(host)) return false;
    const origem = req.headers.origin;
    if (origem === undefined) return true;
    try { return hosts.has(new URL(origem).host.toLowerCase()); } catch { return false; }
  }

  async function tratar(req, res) {
    const url = new URL(req.url, 'http://local');
    const rota = url.pathname;

    if (!origemPermitida(req)) return enviar(res, 403, { erro: 'Origem não permitida.' });

    if (req.method === 'GET' && estaticos[rota]) {
      const { conteudo, tipo } = estaticos[rota];
      return enviar(res, 200, conteudo, tipo);
    }

    if (req.method === 'GET' && rota === '/api/saude') return enviar(res, 200, { ok: true });

    if (req.method === 'GET' && rota === '/api/classificacoes') {
      const data = url.searchParams.get('data') || '';
      const tpDoc = url.searchParams.get('tpDoc') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || (tpDoc && !/^(55|65)$/.test(tpDoc))) {
        return enviar(res, 400, { erro: 'Parâmetros inválidos.' });
      }
      if (!catalogo || !catalogo.disponivel) return enviar(res, 200, { disponivel: false, itens: [] });
      return enviar(res, 200, { disponivel: true, geradoEm: catalogo.geradoEm, itens: catalogo.listar({ data, tpDoc }) });
    }

    if (req.method === 'GET' && rota === '/api/regimes') {
      return enviar(res, 200, Object.entries(REGIMES).map(([id, r]) => ({ id, rotulo: r.rotulo })));
    }

    if (req.method === 'GET' && rota === '/api/atividades') {
      const data = url.searchParams.get('data') || '';
      const tpDoc = url.searchParams.get('tpDoc') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || (tpDoc && !/^(55|65)$/.test(tpDoc))) {
        return enviar(res, 400, { erro: 'Parâmetros inválidos.' });
      }
      try {
        return enviar(res, 200, await motor.atividades({ data, tpDoc }));
      } catch (e) {
        return enviar(res, 502, { erro: e instanceof ErroMotor ? e.message : 'Motor indisponível.' });
      }
    }

    if (req.method === 'POST' && rota === '/api/simulacoes') {
      const tipoMidia = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (tipoMidia !== 'application/json') {
        return enviar(res, 415, { erro: 'Envie application/json.' });
      }
      let corpo;
      try {
        corpo = JSON.parse(await lerCorpo(req));
      } catch (e) {
        if (e.status === 413) {
          // depois de responder, encerra a conexão para não continuar recebendo o corpo
          res.on('finish', () => req.destroy());
          return enviar(res, 413, { erro: 'Entrada grande demais.' });
        }
        return enviar(res, 400, { erro: 'JSON inválido.' });
      }
      const v = validarEntrada(corpo);
      if (!v.ok) return enviar(res, 422, { erro: 'Entrada inválida.', erros: v.erros });

      try {
        const r = await motor.simular(v.valor);
        const salvo = historico.salvar({
          situacao: r.resultado.situacao, httpStatus: 200, versao: r.versao,
          entrada: v.valor, payload: r.payload, resposta: r.resposta, resultado: r.resultado,
        });
        return enviar(res, 200, { ...salvo, natureza: 'simulacao', versaoMotor: r.versao, entrada: v.valor, resultado: r.resultado });
      } catch (e) {
        if (e instanceof ErroMotor && e.tipo === 'rejeitado') {
          const salvo = historico.salvar({ situacao: 'rejeitada', httpStatus: e.status, entrada: v.valor, resultado: { erros: e.erros } });
          return enviar(res, 422, { ...salvo, erro: 'O motor rejeitou a operação.', errosMotor: e.erros });
        }
        const mensagem = e instanceof ErroMotor ? e.message : 'Erro interno.';
        if (!(e instanceof ErroMotor)) console.error('erro inesperado na simulação:', e?.name);
        return enviar(res, 502, { erro: mensagem });
      }
    }

    if (req.method === 'GET' && rota === '/api/simulacoes') return enviar(res, 200, historico.listar(50));

    const m = rota.match(/^\/api\/simulacoes\/([0-9a-f-]{36})$/);
    if (req.method === 'GET' && m) {
      const s = historico.buscar(m[1]);
      return s ? enviar(res, 200, s) : enviar(res, 404, { erro: 'Simulação não encontrada.' });
    }

    return enviar(res, 404, { erro: 'Não encontrado.' });
  }

  return createServer((req, res) => {
    tratar(req, res).catch((e) => {
      console.error('erro inesperado:', e?.name);
      if (!res.headersSent) enviar(res, 500, { erro: 'Erro interno.' });
    });
  });
}
