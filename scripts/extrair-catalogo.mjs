// Extrai do banco oficial do motor (calculadora-pro.db, somente leitura) o catálogo
// de cClassTrib usado pelo Simples Nacional, com o MESMO filtro do motor
// (ClassificacaoTributariaSimplesRepository, commit c5b0f01):
//   - só situações tributárias do tributo 2 (IBS/CBS) em TRIBUTO_SITUACAO_TRIBUTARIA;
//   - vigência de CLASSIFICACAO_TRIBUTARIA e do vínculo TIPO_DFE_CLASSIFICACAO;
//   - tipo de receita bruta (CLTR_TPRBSN) e a tabela TIPO_RECEITA_BRUTA_SIMPLES_NACIONAL.
// Nada é inventado: o arquivo gerado só contém o que está no banco.
//
// Uso: node scripts/extrair-catalogo.mjs <calculadora-pro.db> <saida.json>

import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';

const [, , arquivoDb, saida] = process.argv;
if (!arquivoDb || !saida) {
  console.error('uso: extrair-catalogo.mjs <banco.db> <saida.json>');
  process.exit(2);
}

const db = new DatabaseSync(arquivoDb, { readOnly: true });

const classificacoes = db.prepare(`
  SELECT ct.CLTR_ID AS id, ct.CLTR_CD AS codigo, ct.CLTR_DESCRICAO AS descricao,
         ct.CLTR_TPRBSN AS tpRBSN, ct.CLTR_INICIO_VIGENCIA AS inicio, ct.CLTR_FIM_VIGENCIA AS fim
  FROM CLASSIFICACAO_TRIBUTARIA ct
  WHERE ct.CLTR_SITR_ID IN (SELECT tst.TRST_SITR_ID FROM TRIBUTO_SITUACAO_TRIBUTARIA tst WHERE tst.TRST_TBTO_ID = 2)
  ORDER BY ct.CLTR_CD, ct.CLTR_INICIO_VIGENCIA
`).all();

// Vínculo com o tipo de documento: o motor (contarVinculosComTpDoc) conta por CÓDIGO, em qualquer
// versão do código com situação do tributo 2. Aqui também: o vínculo vale para o código, não para a versão.
const vinculos = db.prepare(`
  SELECT ct.CLTR_CD AS codigo, td.TPDF_TIPO AS tipo,
         MAX(tdcl.TDCL_INICIO_VIGENCIA, td.TPDF_INICIO_VIGENCIA) AS inicio,
         CASE WHEN tdcl.TDCL_FIM_VIGENCIA IS NULL THEN td.TPDF_FIM_VIGENCIA
              WHEN td.TPDF_FIM_VIGENCIA IS NULL THEN tdcl.TDCL_FIM_VIGENCIA
              ELSE MIN(tdcl.TDCL_FIM_VIGENCIA, td.TPDF_FIM_VIGENCIA) END AS fim
  FROM TIPO_DFE_CLASSIFICACAO tdcl
  JOIN TIPO_DFE td ON td.TPDF_ID = tdcl.TDCL_TPDF_ID
  JOIN CLASSIFICACAO_TRIBUTARIA ct ON ct.CLTR_ID = tdcl.TDCL_CLTR_ID
  WHERE td.TPDF_TIPO IS NOT NULL
    AND ct.CLTR_SITR_ID IN (SELECT tst.TRST_SITR_ID FROM TRIBUTO_SITUACAO_TRIBUTARIA tst WHERE tst.TRST_TBTO_ID = 2)
`).all();

// Códigos que o motor marca NAO_IMPLEMENTADO (contarTratamentosNaoImplementados):
// tratamento tributário com TRTR_IN_POSSUI_AJUSTE = 1. Guardamos o período em que as 3 vigências se cruzam.
const naoImplementados = db.prepare(`
  SELECT ct.CLTR_CD AS codigo,
         ct.CLTR_INICIO_VIGENCIA AS i1, ct.CLTR_FIM_VIGENCIA AS f1,
         tc.TRCL_INICIO_VIGENCIA AS i2, tc.TRCL_FIM_VIGENCIA AS f2,
         tt.TRTR_INICIO_VIGENCIA AS i3, tt.TRTR_FIM_VIGENCIA AS f3
  FROM TRATAMENTO_CLASSIFICACAO tc
  JOIN TRATAMENTO_TRIBUTARIO tt ON tt.TRTR_ID = tc.TRCL_TRTR_ID
  JOIN CLASSIFICACAO_TRIBUTARIA ct ON ct.CLTR_ID = tc.TRCL_CLTR_ID
  WHERE tt.TRTR_IN_POSSUI_AJUSTE = 1
    AND ct.CLTR_SITR_ID IN (SELECT tst.TRST_SITR_ID FROM TRIBUTO_SITUACAO_TRIBUTARIA tst WHERE tst.TRST_TBTO_ID = 2)
`).all()
  .map((r) => {
    const inicio = [r.i1, r.i2, r.i3].sort().at(-1);
    const fins = [r.f1, r.f2, r.f3].filter(Boolean).sort();
    return { codigo: String(r.codigo), inicio, fim: fins[0] ?? null };
  })
  .filter((p) => p.fim === null || p.inicio <= p.fim);

const tiposReceita = db.prepare(`
  SELECT TRBS_CD AS codigo, TRBS_DESCRICAO AS descricao, TRBS_FATOR_RECEITA AS fator,
         TRBS_INICIO_VIGENCIA AS inicio, TRBS_FIM_VIGENCIA AS fim
  FROM TIPO_RECEITA_BRUTA_SIMPLES_NACIONAL
  ORDER BY TRBS_CD, TRBS_INICIO_VIGENCIA
`).all();

// Datas no banco são texto AAAA-MM-DD: a comparação como texto equivale à comparação de datas.
const docsPorCodigo = new Map();
for (const v of vinculos) {
  const k = String(v.codigo);
  if (!docsPorCodigo.has(k)) docsPorCodigo.set(k, []);
  docsPorCodigo.get(k).push({ tipo: String(v.tipo), inicio: v.inicio, fim: v.fim ?? null });
}
const naoImplPorCodigo = new Map();
for (const p of naoImplementados) {
  if (!naoImplPorCodigo.has(p.codigo)) naoImplPorCodigo.set(p.codigo, []);
  naoImplPorCodigo.get(p.codigo).push({ inicio: p.inicio, fim: p.fim });
}

const catalogo = {
  fonte: 'calculadora-rtc-simples-nacional: CLASSIFICACAO_TRIBUTARIA (tributo 2), TIPO_DFE_CLASSIFICACAO, TIPO_RECEITA_BRUTA_SIMPLES_NACIONAL, TRATAMENTO_TRIBUTARIO (ajuste)',
  geradoEm: new Date().toISOString(),
  classificacoes: classificacoes.map((c) => ({
    codigo: String(c.codigo),
    descricao: String(c.descricao ?? '').replace(/\s+/g, ' ').trim(),
    tpRBSN: c.tpRBSN === null || c.tpRBSN === undefined ? null : Number(c.tpRBSN),
    inicio: c.inicio,
    fim: c.fim ?? null,
    documentos: docsPorCodigo.get(String(c.codigo)) ?? [],
    naoImplementado: naoImplPorCodigo.get(String(c.codigo)) ?? [],
  })),
  tiposReceita: tiposReceita.map((t) => ({
    codigo: Number(t.codigo),
    descricao: String(t.descricao ?? ''),
    fator: t.fator === null || t.fator === undefined ? null : Number(t.fator),
    inicio: t.inicio,
    fim: t.fim ?? null,
  })),
};

if (catalogo.classificacoes.length === 0) {
  console.error('nenhuma classificação encontrada: o banco ou o filtro mudou');
  process.exit(1);
}
writeFileSync(saida, JSON.stringify(catalogo));
console.log(`catálogo: ${catalogo.classificacoes.length} classificações, ${vinculos.length} vínculos com documento, ${naoImplementados.length} períodos não implementados, ${catalogo.tiposReceita.length} tipos de receita bruta`);
