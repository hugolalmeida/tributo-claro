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

const vinculos = db.prepare(`
  SELECT tdcl.TDCL_CLTR_ID AS id, td.TPDF_TIPO AS tipo,
         MAX(tdcl.TDCL_INICIO_VIGENCIA, td.TPDF_INICIO_VIGENCIA) AS inicio,
         CASE WHEN tdcl.TDCL_FIM_VIGENCIA IS NULL THEN td.TPDF_FIM_VIGENCIA
              WHEN td.TPDF_FIM_VIGENCIA IS NULL THEN tdcl.TDCL_FIM_VIGENCIA
              ELSE MIN(tdcl.TDCL_FIM_VIGENCIA, td.TPDF_FIM_VIGENCIA) END AS fim
  FROM TIPO_DFE_CLASSIFICACAO tdcl
  JOIN TIPO_DFE td ON td.TPDF_ID = tdcl.TDCL_TPDF_ID
  WHERE td.TPDF_TIPO IS NOT NULL
`).all();

const tiposReceita = db.prepare(`
  SELECT TRBS_CD AS codigo, TRBS_DESCRICAO AS descricao, TRBS_FATOR_RECEITA AS fator,
         TRBS_INICIO_VIGENCIA AS inicio, TRBS_FIM_VIGENCIA AS fim
  FROM TIPO_RECEITA_BRUTA_SIMPLES_NACIONAL
  ORDER BY TRBS_CD, TRBS_INICIO_VIGENCIA
`).all();

const docsPorId = new Map();
for (const v of vinculos) {
  if (!docsPorId.has(v.id)) docsPorId.set(v.id, []);
  docsPorId.get(v.id).push({ tipo: String(v.tipo), inicio: v.inicio, fim: v.fim ?? null });
}

const catalogo = {
  fonte: 'calculadora-rtc-simples-nacional: CLASSIFICACAO_TRIBUTARIA (tributo 2), TIPO_DFE_CLASSIFICACAO, TIPO_RECEITA_BRUTA_SIMPLES_NACIONAL',
  geradoEm: new Date().toISOString(),
  classificacoes: classificacoes.map((c) => ({
    codigo: String(c.codigo),
    descricao: String(c.descricao ?? '').replace(/\s+/g, ' ').trim(),
    tpRBSN: c.tpRBSN === null || c.tpRBSN === undefined ? null : Number(c.tpRBSN),
    inicio: c.inicio,
    fim: c.fim ?? null,
    documentos: docsPorId.get(c.id) ?? [],
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
console.log(`catálogo: ${catalogo.classificacoes.length} classificações, ${vinculos.length} vínculos com documento, ${catalogo.tiposReceita.length} tipos de receita bruta`);
