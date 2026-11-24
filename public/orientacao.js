// Orientações em português simples para as recusas mais comuns do motor da Receita.
// Só traduz o que o motor já disse (código VSN-); não cria regra nova.
// Usado pela tela (app.js) e pelos testes (node), por isso não toca no DOM.

export const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

/**
 * @param {{code?: string}[]} erros  erros devolvidos pelo motor (operação ou item)
 * @param {{data?: string, inicioCalculo?: string|null}} contexto
 * @returns {string[]} uma orientação por problema reconhecido, sem repetir
 */
export function orientacoes(erros, { data, inicioCalculo } = {}) {
  const codigos = new Set((erros || []).map((e) => e?.code).filter(Boolean));
  const saida = [];
  if (codigos.has('VSN-015')) {
    if (inicioCalculo && data && data < inicioCalculo) {
      saida.push(`A data da operação (${dataBR(data)}) é anterior ao início do cálculo. Pela tabela oficial do motor, este documento só é calculado a partir de ${dataBR(inicioCalculo)}. Troque a data e simule de novo.`);
    } else {
      saida.push('O motor não calcula este tipo de documento nesta data. Confira a data da operação e o documento.');
    }
  }
  if (codigos.has('VSN-004') || codigos.has('VSN-006')) {
    const faltam = [codigos.has('VSN-006') && 'IBS', codigos.has('VSN-004') && 'CBS'].filter(Boolean).join(' e ');
    saida.push(`Falta a alíquota de ${faltam}. Informe a alíquota efetiva do Simples Nacional, que vem do cálculo do DAS do período.`);
  }
  return saida;
}
