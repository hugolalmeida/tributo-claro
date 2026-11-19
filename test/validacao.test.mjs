import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarEntrada, MAX_ITENS } from '../src/validacao.mjs';
import { montarPayload, interpretar } from '../src/motor.mjs';

const valida = () => ({
  data: '2027-03-15', tpDoc: '55', regime: 'simples',
  itens: [{ cAtivSN: '01', cClassTrib: '000001', baseCalculo: '1000,50', pIBSSN: '1,25', pCBSSN: '2.75' }],
});

test('aceita entrada válida e normaliza vírgula decimal', () => {
  const r = validarEntrada(valida());
  assert.equal(r.ok, true);
  assert.equal(r.valor.itens[0].baseCalculo, '1000.50');
  assert.equal(r.valor.itens[0].pIBSSN, '1.25');
  assert.equal(r.valor.itens[0].valorImpostoSeletivo, '0.00');
});

test('rejeita data impossível, documento, regime e cClassTrib inválidos', () => {
  const r = validarEntrada({ ...valida(), data: '2027-02-30', tpDoc: '57', regime: 'mei', itens: [{ cClassTrib: '12', baseCalculo: '10' }] });
  assert.equal(r.ok, false);
  const campos = r.erros.map((e) => e.campo);
  for (const c of ['data', 'tpDoc', 'regime', 'itens[0].cClassTrib']) assert.ok(campos.includes(c), c);
});

test('rejeita separador de milhar, valor negativo e alíquota absurda', () => {
  const r = validarEntrada({ ...valida(), itens: [{ cClassTrib: '000001', baseCalculo: '1.000,00', pCBSSN: '150' }, { cClassTrib: '000001', baseCalculo: '-5' }] });
  assert.equal(r.ok, false);
  const campos = r.erros.map((e) => e.campo);
  assert.ok(campos.includes('itens[0].baseCalculo'));
  assert.ok(campos.includes('itens[0].pCBSSN'));
  assert.ok(campos.includes('itens[1].baseCalculo'));
});

test('limita a quantidade de itens e rejeita tipos inesperados', () => {
  const muitos = { ...valida(), itens: Array.from({ length: MAX_ITENS + 1 }, () => valida().itens[0]) };
  assert.equal(validarEntrada(muitos).ok, false);
  assert.equal(validarEntrada([]).ok, false);
  assert.equal(validarEntrada({ ...valida(), data: { $gt: '' } }).ok, false);
});

test('monta o payload do motor com CRT/tpRegimeIBSCBS corretos', () => {
  const base = validarEntrada(valida()).valor;
  const p1 = montarPayload(base);
  assert.equal(p1.CRT, '1');
  assert.equal(p1.tpRegimeIBSCBS, undefined);
  assert.equal(p1.versao, '2.0.0');
  assert.match(p1.id, /^[0-9a-f]{24}$/);
  assert.deepEqual(Object.keys(p1.itens[0]).sort(), ['baseCalculo', 'cAtivSN', 'cClassTrib', 'numero', 'pCBSSN', 'pIBSSN', 'valorImpostoSeletivo']);
  const p3 = montarPayload({ ...base, regime: 'simples-por-fora', tpEnteGov: '2' });
  assert.equal(p3.CRT, '3');
  assert.equal(p3.tpRegimeIBSCBS, '2');
  assert.equal(p3.tpEnteGov, '2');
});

test('interpreta HTTP 200 olhando o estado de cada item', () => {
  const r = interpretar({ objetos: [
    { nObj: 1, estadoItem: 'CALCULADO', tribCalc: {} },
    { nObj: 2, estadoItem: 'FALHA_TECNICA' },
    { nObj: 3, estadoItem: 'NOVO_ESTADO_FUTURO' },
  ] });
  assert.equal(r.situacao, 'parcial');
  assert.equal(r.itens[1].calculado, false);
  assert.equal(r.itens[2].calculado, false);
  assert.match(r.itens[2].rotulo, /não reconhecido/);
  assert.equal(interpretar({ objetos: [] }).situacao, 'nenhum-calculado');
  assert.equal(interpretar({ objetos: [{ estadoItem: 'NAO_CALCULADO' }] }).situacao, 'nenhum-calculado');
});

test('histórico respeita o teto e mantém as mais recentes', async () => {
  const { abrirHistorico } = await import('../src/historico.mjs');
  const h = abrirHistorico(':memory:', { maxSimulacoes: 3 });
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push(h.salvar({ situacao: 'completo', entrada: { n: i } }).id);
  const lista = h.listar(10);
  assert.equal(lista.length, 3);
  assert.equal(h.buscar(ids[0]), null);
  assert.ok(h.buscar(ids[4]));
  h.fechar();
});
