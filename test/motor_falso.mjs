// Motor FALSO para testes. Segue a forma do contrato real
// (ObservabilidadeSimplesDomain), mas os valores são FICTÍCIOS.
import { createServer } from 'node:http';

export function iniciarMotorFalso() {
  const recebidos = [];
  let modo = 'normal'; // normal | rejeitar | erro500 | lento | lixo

  const servidor = createServer((req, res) => {
    const url = new URL(req.url, 'http://motor');
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      const cab = { 'content-type': 'application/json', 'X-CALC-APP-VERSION': '9.9.9-teste', 'X-CALC-DB-VERSION': '123' };
      if (req.method === 'GET' && url.pathname === '/api/calculadora/simples-nacional/atividades') {
        res.writeHead(200, cab);
        return res.end(JSON.stringify([
          { codigo: '01', descricao: 'Atividade fictícia A', rotuloCurtoAnexo: 'Anexo I', admissivelNoDocumento: true },
          { codigo: '02', descricao: 'Atividade fictícia B', rotuloCurtoAnexo: 'Anexo III', admissivelNoDocumento: false },
        ]));
      }
      if (req.method === 'POST' && url.pathname === '/api/calculadora/observabilidade/simples-nacional') {
        const op = JSON.parse(corpo);
        recebidos.push({ op, contentType: req.headers['content-type'] });
        if (modo === 'erro500') { res.writeHead(500, cab); return res.end('{}'); }
        if (modo === 'lixo') { res.writeHead(200, cab); return res.end('<html>'); }
        if (modo === 'lento') { setTimeout(() => { res.writeHead(200, cab); res.end('{}'); }, 2000); return; }
        if (modo === 'rejeitar') {
          res.writeHead(422, { ...cab, 'content-type': 'application/problem+json' });
          return res.end(JSON.stringify({
            title: 'Operação inválida', status: 422,
            errors: [{ code: 'VSN-003', title: 'Fora do escopo', pointer: '#/CRT', detail: 'Detalhe fictício', extra: 'descartar' }],
          }));
        }
        const objetos = op.itens.map((it) => {
          if (it.cClassTrib === '999999') {
            return { nObj: it.numero, estadoItem: 'INCONSISTENCIA_ENTRADA', erros: [{ code: 'VSN-020', title: 'cClassTrib inválido', pointer: `#/itens/${it.numero - 1}/cClassTrib`, detail: 'Fictício' }] };
          }
          if (!it.cAtivSN) {
            return { nObj: it.numero, estadoItem: 'NAO_CALCULADO', tribCalc: { vRBSNitem: it.baseCalculo, tpRBSN: 1 } };
          }
          return { nObj: it.numero, estadoItem: 'CALCULADO', tribCalc: { vRBSNitem: it.baseCalculo, tpRBSN: 1, vBC: it.baseCalculo, pIBSSN: '1.00', vIBSSN: '10.00', pCBSSN: '2.00', vCBSSN: '20.00', totalItem: '30.00' } };
        });
        const calc = objetos.filter((o) => o.estadoItem === 'CALCULADO').length;
        res.writeHead(200, cab);
        return res.end(JSON.stringify({
          oper: { data: op.data, tpDoc: op.tpDoc, CRT: op.CRT },
          objetos,
          total: calc ? { vIBSSNtot: (10 * calc).toFixed(2), vCBSSNtot: (20 * calc).toFixed(2), totalTributos: (30 * calc).toFixed(2) } : {},
        }));
      }
      res.writeHead(404, cab); res.end('{}');
    });
  });

  return new Promise((resolve) => {
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      resolve({
        url: `http://127.0.0.1:${port}/api`,
        recebidos,
        definirModo(m) { modo = m; },
        fechar: () => new Promise((r) => { servidor.closeAllConnections(); servidor.close(r); }),
      });
    });
  });
}
