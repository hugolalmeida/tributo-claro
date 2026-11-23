// Banco FICTÍCIO com o mesmo esquema (subconjunto) das tabelas oficiais do motor.
// Códigos e descrições abaixo são inventados para o teste e não valem como dado real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { carregarCatalogo } from '../src/catalogo.mjs';

function bancoFicticio(arquivo) {
  const db = new DatabaseSync(arquivo);
  db.exec(`
    CREATE TABLE CLASSIFICACAO_TRIBUTARIA (CLTR_ID INTEGER, CLTR_CD TEXT, CLTR_DESCRICAO TEXT, CLTR_SITR_ID INTEGER,
      CLTR_TPRBSN INTEGER, CLTR_INICIO_VIGENCIA TEXT, CLTR_FIM_VIGENCIA TEXT);
    CREATE TABLE TRIBUTO_SITUACAO_TRIBUTARIA (TRST_ID INTEGER, TRST_SITR_ID INTEGER, TRST_TBTO_ID INTEGER);
    CREATE TABLE TIPO_DFE (TPDF_ID INTEGER, TPDF_TIPO INTEGER, TPDF_INICIO_VIGENCIA TEXT, TPDF_FIM_VIGENCIA TEXT);
    CREATE TABLE TIPO_DFE_CLASSIFICACAO (TDCL_ID INTEGER, TDCL_CLTR_ID INTEGER, TDCL_TPDF_ID INTEGER, TDCL_INICIO_VIGENCIA TEXT, TDCL_FIM_VIGENCIA TEXT);
    CREATE TABLE TIPO_RECEITA_BRUTA_SIMPLES_NACIONAL (TRBS_ID INTEGER, TRBS_CD INTEGER, TRBS_DESCRICAO TEXT, TRBS_FATOR_RECEITA REAL,
      TRBS_INICIO_VIGENCIA TEXT, TRBS_FIM_VIGENCIA TEXT);
    CREATE TABLE TRATAMENTO_TRIBUTARIO (TRTR_ID INTEGER, TRTR_IN_POSSUI_AJUSTE INTEGER, TRTR_INICIO_VIGENCIA TEXT, TRTR_FIM_VIGENCIA TEXT);
    CREATE TABLE TRATAMENTO_CLASSIFICACAO (TRCL_ID INTEGER, TRCL_CLTR_ID INTEGER, TRCL_TRTR_ID INTEGER, TRCL_INICIO_VIGENCIA TEXT, TRCL_FIM_VIGENCIA TEXT);
    INSERT INTO TRATAMENTO_TRIBUTARIO VALUES (1, 1, '2026-01-01', NULL), (2, 0, '2026-01-01', NULL);
    INSERT INTO TRIBUTO_SITUACAO_TRIBUTARIA VALUES (1, 10, 2), (2, 20, 1);
    INSERT INTO TIPO_DFE VALUES (1, 55, '2026-01-01', NULL), (2, 65, '2026-01-01', NULL);
    INSERT INTO CLASSIFICACAO_TRIBUTARIA VALUES
      (1, '111111', 'Ficticio A   com  espacos', 10, 1, '2026-01-01', NULL),
      (2, '222222', 'Ficticio B so NFC-e', 10, 5, '2026-01-01', NULL),
      (3, '333333', 'Ficticio C de outro tributo', 20, 1, '2026-01-01', NULL),
      (4, '444444', 'Ficticio D encerrado', 10, 1, '2026-01-01', '2026-12-31'),
      (5, '111111', 'Ficticio A versao nova', 10, 1, '2027-06-01', NULL),
      (6, '555555', 'Ficticio E sem calculo no motor', 10, 1, '2026-01-01', NULL);
    INSERT INTO TRATAMENTO_CLASSIFICACAO VALUES (1, 6, 1, '2027-01-01', NULL), (2, 1, 2, '2026-01-01', NULL);
    INSERT INTO TIPO_DFE_CLASSIFICACAO VALUES
      (1, 1, 1, '2026-01-01', NULL), (2, 2, 2, '2026-01-01', NULL), (3, 3, 1, '2026-01-01', NULL),
      (4, 4, 1, '2026-01-01', NULL), (6, 6, 1, '2026-01-01', NULL);
    INSERT INTO TIPO_RECEITA_BRUTA_SIMPLES_NACIONAL VALUES
      (1, 1, 'Receita ficticia integral', 1.0, '2026-01-01', NULL), (2, 5, 'Receita ficticia metade', 0.5, '2026-01-01', NULL);
  `);
  db.close();
}

const pasta = mkdtempSync(join(tmpdir(), 'catalogo-'));
const banco = join(pasta, 'motor.db');
const saida = join(pasta, 'catalogo.json');
bancoFicticio(banco);
execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/extrair-catalogo.mjs', banco, saida]);

test('extrator: só IBS/CBS (tributo 2), descrição limpa, vínculos e tipos de receita', () => {
  const c = JSON.parse(readFileSync(saida, 'utf8'));
  const codigos = c.classificacoes.map((x) => x.codigo);
  assert.ok(!codigos.includes('333333'), 'outro tributo fica fora');
  assert.equal(c.classificacoes.find((x) => x.codigo === '111111').descricao, 'Ficticio A com espacos');
  assert.deepEqual(c.classificacoes.find((x) => x.codigo === '222222').documentos.map((d) => d.tipo), ['65']);
  assert.equal(c.tiposReceita.length, 2);
});

test('catálogo: filtra por data e documento e usa a versão vigente do código', () => {
  const cat = carregarCatalogo({ arquivo: saida });
  assert.equal(cat.disponivel, true);
  const nfe2027 = cat.listar({ data: '2027-03-15', tpDoc: '55' });
  assert.deepEqual(nfe2027.map((x) => x.codigo), ['111111', '555555'], '444444 encerrou em 2026; 222222 é só NFC-e; 555555 vai para o fim');
  assert.equal(nfe2027[0].descricao, 'Ficticio A com espacos');
  assert.equal(nfe2027[0].tipoReceita, 'Receita ficticia integral');
  assert.equal(nfe2027[0].fatorReceita, 1);
  // a versão nova de 111111 não tem vínculo próprio: como no motor, o vínculo vale para o CÓDIGO
  assert.equal(cat.listar({ data: '2027-07-01', tpDoc: '55' })[0].descricao, 'Ficticio A versao nova');
  assert.deepEqual(cat.listar({ data: '2026-05-01', tpDoc: '55' }).map((x) => x.codigo), ['111111', '444444', '555555']);
  const nfce = cat.listar({ data: '2027-03-15', tpDoc: '65' });
  assert.deepEqual(nfce.map((x) => [x.codigo, x.fatorReceita]), [['222222', 0.5]]);
});

test('catálogo: marca o que o motor ainda não calcula (ajuste), só na vigência, e põe no fim', () => {
  const cat = carregarCatalogo({ arquivo: saida });
  const em2026 = cat.listar({ data: '2026-05-01', tpDoc: '55' });
  assert.equal(em2026.find((x) => x.codigo === '555555').naoImplementado, false, 'o ajuste só vale a partir de 2027');
  const em2027 = cat.listar({ data: '2027-03-15', tpDoc: '55' });
  assert.equal(em2027.at(-1).codigo, '555555');
  assert.equal(em2027.at(-1).naoImplementado, true);
  assert.equal(em2027[0].naoImplementado, false, 'tratamento sem ajuste não marca');
});

test('catálogo: "mais usados" só aceita códigos do catálogo oficial e vem primeiro', () => {
  const lista = join(pasta, 'mais-usados.json');
  writeFileSync(lista, JSON.stringify(['444444', '999999', 'abc']));
  const cat = carregarCatalogo({ arquivo: saida, arquivoMaisUsados: lista });
  const itens = cat.listar({ data: '2026-05-01', tpDoc: '55' });
  assert.deepEqual(itens.map((x) => [x.codigo, x.maisUsado]), [['444444', true], ['111111', false], ['555555', false]]);
  assert.ok(!itens.some((x) => x.codigo === '999999'), 'código fora do catálogo nunca aparece');
});

test('catálogo ausente: fica indisponível e devolve lista vazia', () => {
  const cat = carregarCatalogo({ arquivo: join(pasta, 'nao-existe.json') });
  assert.equal(cat.disponivel, false);
  assert.deepEqual(cat.listar({ data: '2027-01-01', tpDoc: '55' }), []);
});


test('tela: a regex de código de 6 dígitos tem a barra (\\d), sem "^d{" perdido', () => {
  const app = readFileSync('public/app.js', 'utf8');
  assert.ok(app.includes(String.raw`/^\d{6}$/.test(v)`), 'descreverClassificacao confere 6 dígitos');
  assert.ok(!app.includes('/^d{'), 'nenhuma regex com "^d{" (barra perdida)');
});
