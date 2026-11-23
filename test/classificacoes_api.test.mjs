import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarServidor } from '../src/servidor.mjs';
import { abrirHistorico } from '../src/historico.mjs';

const historico = abrirHistorico(':memory:');
const chamadas = [];
const catalogoFalso = {
  disponivel: true,
  geradoEm: '2026-11-23T00:00:00.000Z',
  listar: (filtro) => { chamadas.push(filtro); return [{ codigo: '111111', descricao: 'Fictício', tpRBSN: 1, tipoReceita: 'x', fatorReceita: 1, maisUsado: false }]; },
};
const servidores = [];
async function subir(catalogo) {
  let s = criarServidor({ motor: {}, historico, hostsPermitidos: ['127.0.0.1:0'], catalogo });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const porta = s.address().port;
  await new Promise((r) => s.close(r));
  s = criarServidor({ motor: {}, historico, hostsPermitidos: [`127.0.0.1:${porta}`], catalogo });
  await new Promise((r) => s.listen(porta, '127.0.0.1', r));
  servidores.push(s);
  return `http://127.0.0.1:${porta}`;
}
after(async () => { for (const s of servidores) await new Promise((r) => { s.closeAllConnections(); s.close(r); }); historico.fechar(); });

test('GET /api/classificacoes repassa data e documento ao catálogo', async () => {
  const base = await subir(catalogoFalso);
  const r = await fetch(`${base}/api/classificacoes?data=2027-03-15&tpDoc=55`);
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.disponivel, true);
  assert.equal(corpo.itens[0].codigo, '111111');
  assert.deepEqual(chamadas.at(-1), { data: '2027-03-15', tpDoc: '55' });
  assert.equal((await fetch(`${base}/api/classificacoes?data=ontem`)).status, 400);
  assert.equal((await fetch(`${base}/api/classificacoes?data=2027-03-15&tpDoc=57`)).status, 400);
});

test('sem catálogo, responde indisponível e lista vazia', async () => {
  const base = await subir(null);
  const corpo = await (await fetch(`${base}/api/classificacoes?data=2027-03-15&tpDoc=55`)).json();
  assert.deepEqual(corpo, { disponivel: false, itens: [] });
});

test('serve as fontes locais com o tipo certo', async () => {
  const base = await subir(null);
  const r = await fetch(`${base}/fontes/poppins-latin-600-normal.woff2`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'font/woff2');
  assert.match(r.headers.get('content-security-policy'), /font-src 'self'/);
});
