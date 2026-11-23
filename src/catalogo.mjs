// Catálogo de cClassTrib gerado do banco oficial do motor (scripts/extrair-catalogo.mjs).
// Filtra pela data da operação e pelo tipo de documento, como o motor faz.
// "Mais usados pela C&S" vem de um arquivo opcional (lista de códigos) que começa vazio:
// só entra código que o Desir indicar, e só se existir no catálogo oficial.

import { readFileSync, existsSync } from 'node:fs';

const vigente = (item, data) => item.inicio <= data && (item.fim === null || item.fim === undefined || data <= item.fim);

export function carregarCatalogo({ arquivo, arquivoMaisUsados } = {}) {
  let dados = null;
  if (arquivo && existsSync(arquivo)) {
    try { dados = JSON.parse(readFileSync(arquivo, 'utf8')); } catch { dados = null; }
  }
  let maisUsados = [];
  if (arquivoMaisUsados && existsSync(arquivoMaisUsados)) {
    try {
      const lista = JSON.parse(readFileSync(arquivoMaisUsados, 'utf8'));
      if (Array.isArray(lista)) maisUsados = lista.filter((c) => typeof c === 'string' && /^\d{6}$/.test(c));
    } catch { maisUsados = []; }
  }
  const destaque = new Set(maisUsados);
  const disponivel = Boolean(dados && Array.isArray(dados.classificacoes) && dados.classificacoes.length);

  return {
    disponivel,
    geradoEm: dados?.geradoEm ?? null,

    listar({ data, tpDoc }) {
      if (!disponivel) return [];
      const tipos = (dados.tiposReceita || []).filter((t) => vigente(t, data));
      const porCodigo = new Map();
      for (const c of dados.classificacoes) {
        if (!vigente(c, data)) continue;
        if (tpDoc && !c.documentos.some((d) => d.tipo === tpDoc && vigente(d, data))) continue;
        const atual = porCodigo.get(c.codigo);
        if (!atual || c.inicio > atual.inicio) porCodigo.set(c.codigo, c);
      }
      return [...porCodigo.values()]
        .map((c) => {
          const tipo = tipos.find((t) => t.codigo === c.tpRBSN);
          return {
            codigo: c.codigo,
            descricao: c.descricao,
            tpRBSN: c.tpRBSN,
            tipoReceita: tipo ? tipo.descricao : null,
            fatorReceita: tipo ? tipo.fator : null,
            maisUsado: destaque.has(c.codigo),
            // o motor responde NAO_IMPLEMENTADO para este código nesta data (tratamento com ajuste)
            naoImplementado: (c.naoImplementado || []).some((p) => vigente(p, data)),
          };
        })
        .sort((a, b) => (Number(a.naoImplementado) - Number(b.naoImplementado))
          || (Number(b.maisUsado) - Number(a.maisUsado)) || a.codigo.localeCompare(b.codigo));
    },
  };
}
