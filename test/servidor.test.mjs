import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { criarServidor } from '../src/servidor.mjs';
import { criarClienteMotor } from '../src/motor.mjs';
import { abrirHistorico } from '../src/historico.mjs';
import { iniciarMotorFalso } from './motor_falso.mjs';

let motor, servidor, historico, porta;

// Usa node:http (e não fetch) para poder controlar o cabeçalho Host.
function chamar(caminho, { method = 'GET', corpo, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const dados = corpo === undefined ? null : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
    const req = request({
      host: '127.0.0.1', port: porta, path: caminho, method,
      headers: { host: `localhost:${porta}`, ...(dados ? { 'content-type': 'application/json' } : {}), ...headers },
    }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(txt); } catch { /* não é JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, json, txt });
      });
    });
    req.on('error', reject);
    if (dados) req.write(dados);
    req.end();
  });
}

const entrada = (itens) => ({ data: '2027-03-15', tpDoc: '55', regime: 'simples', itens });

before(async () => {
  motor = await iniciarMotorFalso();
  historico = abrirHistorico(':memory:');
  servidor = criarServidor({
    motor: criarClienteMotor({ url: motor.url, timeoutMs: 500 }),
    historico,
    hostsPermitidos: ['localhost:0'],
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  porta = servidor.address().port;
  // recria com a porta real na lista de hosts permitidos
  await new Promise((r) => servidor.close(r));
  servidor = criarServidor({
    motor: criarClienteMotor({ url: motor.url, timeoutMs: 500 }),
    historico,
    hostsPermitidos: [`localhost:${porta}`, `127.0.0.1:${porta}`],
  });
  await new Promise((r) => servidor.listen(porta, '127.0.0.1', r));
});

after(async () => {
  await new Promise((r) => { servidor.closeAllConnections(); servidor.close(r); });
  await motor.fechar();
  historico.fechar();
});

beforeEach(() => motor.definirModo('normal'));

test('serve a página com cabeçalhos de segurança e aviso de simulação', async () => {
  const r = await chamar('/');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-security-policy'], /default-src 'self'/);
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.match(r.txt, /não uma apuração oficial/);
  assert.match(r.txt, /não é um produto oficial/);
});

test('bloqueia Host e Origin de fora da lista (DNS rebinding e outros sites)', async () => {
  assert.equal((await chamar('/', { headers: { host: 'atacante.exemplo' } })).status, 403);
  const r = await chamar('/api/simulacoes', { method: 'POST', corpo: entrada([]), headers: { origin: 'https://atacante.exemplo' } });
  assert.equal(r.status, 403);
});

test('exige JSON e limita o tamanho do corpo', async () => {
  const r1 = await chamar('/api/simulacoes', { method: 'POST', corpo: 'x=1', headers: { 'content-type': 'text/plain' } });
  assert.equal(r1.status, 415);
  const r2 = await chamar('/api/simulacoes', { method: 'POST', corpo: '{"a":"' + 'x'.repeat(70 * 1024) + '"}' });
  assert.equal(r2.status, 413);
  const r3 = await chamar('/api/simulacoes', { method: 'POST', corpo: '{quebrado' });
  assert.equal(r3.status, 400);
});

test('não chama o motor quando a entrada é inválida', async () => {
  const antes = motor.recebidos.length;
  const r = await chamar('/api/simulacoes', { method: 'POST', corpo: entrada([{ cClassTrib: 'abc', baseCalculo: '10' }]) });
  assert.equal(r.status, 422);
  assert.ok(r.json.erros.length > 0);
  assert.equal(motor.recebidos.length, antes);
});

test('simula, mostra estado por item, versão do motor e grava no histórico', async () => {
  const r = await chamar('/api/simulacoes', { method: 'POST', corpo: entrada([
    { cAtivSN: '01', cClassTrib: '000001', baseCalculo: '1000', pIBSSN: '1', pCBSSN: '2' },
    { cClassTrib: '000001', baseCalculo: '500' },
    { cAtivSN: '01', cClassTrib: '999999', baseCalculo: '10' },
  ]) });
  assert.equal(r.status, 200);
  assert.equal(r.json.natureza, 'simulacao');
  assert.equal(r.json.resultado.situacao, 'parcial');
  assert.deepEqual(r.json.resultado.itens.map((i) => i.estado), ['CALCULADO', 'NAO_CALCULADO', 'INCONSISTENCIA_ENTRADA']);
  assert.equal(r.json.resultado.itens[2].erros[0].code, 'VSN-020');
  assert.deepEqual(r.json.versaoMotor, { app: '9.9.9-teste', banco: '123' });

  const enviado = motor.recebidos.at(-1);
  assert.equal(enviado.contentType, 'application/json');
  assert.equal(enviado.op.CRT, '1');
  assert.equal(enviado.op.itens[1].cAtivSN, undefined);

  const det = await chamar(`/api/simulacoes/${r.json.id}`);
  assert.equal(det.status, 200);
  assert.equal(det.json.versaoMotor.app, '9.9.9-teste');
  assert.equal(det.json.payloadMotor.id, enviado.op.id);
  assert.equal(det.json.respostaMotor.objetos.length, 3);

  const lista = await chamar('/api/simulacoes');
  assert.ok(lista.json.some((s) => s.id === r.json.id && s.situacao === 'parcial'));
});

test('repassa a rejeição do motor (422) só com os campos conhecidos', async () => {
  motor.definirModo('rejeitar');
  const r = await chamar('/api/simulacoes', { method: 'POST', corpo: entrada([{ cAtivSN: '01', cClassTrib: '000001', baseCalculo: '10' }]) });
  assert.equal(r.status, 422);
  assert.equal(r.json.errosMotor[0].code, 'VSN-003');
  assert.equal(r.json.errosMotor[0].extra, undefined);
  const det = await chamar(`/api/simulacoes/${r.json.id}`);
  assert.equal(det.json.situacao, 'rejeitada');
});

test('trata motor fora do ar, lento ou com resposta inválida como 502', async () => {
  const item = [{ cAtivSN: '01', cClassTrib: '000001', baseCalculo: '10' }];
  for (const modo of ['erro500', 'lento', 'lixo']) {
    motor.definirModo(modo);
    const r = await chamar('/api/simulacoes', { method: 'POST', corpo: entrada(item) });
    assert.equal(r.status, 502, modo);
    assert.match(r.json.erro, /[Mm]otor/);
  }
});

test('lista atividades do motor e valida os parâmetros', async () => {
  const r = await chamar('/api/atividades?data=2027-03-15&tpDoc=55');
  assert.equal(r.status, 200);
  assert.equal(r.json[0].codigo, '01');
  assert.equal(r.json[1].admissivel, false);
  assert.equal((await chamar('/api/atividades?data=ontem')).status, 400);
});

test('404 para rotas e ids desconhecidos, sem acesso a arquivos fora da lista', async () => {
  assert.equal((await chamar('/api/simulacoes/00000000-0000-0000-0000-000000000000')).status, 404);
  assert.equal((await chamar('/../package.json')).status, 404);
  assert.equal((await chamar('/%2e%2e/src/app.mjs')).status, 404);
});

test('aceita só o tipo application/json exato (com charset opcional)', async () => {
  const corpo = JSON.stringify(entrada([{ cClassTrib: 'x', baseCalculo: '1' }]));
  const r1 = await chamar('/api/simulacoes', { method: 'POST', corpo, headers: { 'content-type': 'application/jsonx' } });
  assert.equal(r1.status, 415);
  const r2 = await chamar('/api/simulacoes', { method: 'POST', corpo, headers: { 'content-type': 'application/json; charset=utf-8' } });
  assert.equal(r2.status, 422);
});
