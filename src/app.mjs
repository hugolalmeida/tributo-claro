// Ponto de entrada. Configuração só por variáveis de ambiente (sem segredos).
import { criarServidor } from './servidor.mjs';
import { criarClienteMotor } from './motor.mjs';
import { abrirHistorico } from './historico.mjs';
import { carregarCatalogo } from './catalogo.mjs';

const HOST = process.env.HOST || '127.0.0.1';
const PORTA = Number(process.env.PORTA || 3000);
const MOTOR_URL = process.env.MOTOR_URL || 'http://127.0.0.1:8082/api';
const HISTORICO = process.env.HISTORICO_ARQUIVO || './dados/historico.db';
const HOSTS = (process.env.HOSTS_PERMITIDOS || `localhost:${PORTA},127.0.0.1:${PORTA}`)
  .split(',').map((h) => h.trim()).filter(Boolean);

const historico = abrirHistorico(HISTORICO);
const catalogo = carregarCatalogo({
  arquivo: process.env.CATALOGO_ARQUIVO || './dados-motor/catalogo.json',
  arquivoMaisUsados: process.env.MAIS_USADOS_ARQUIVO || './config/mais-usados.json',
});
console.log(catalogo.disponivel ? `catálogo de cClassTrib carregado (gerado em ${catalogo.geradoEm})` : 'catálogo de cClassTrib ausente: o campo fica livre');

const servidor = criarServidor({
  catalogo,
  motor: criarClienteMotor({ url: MOTOR_URL }),
  historico,
  hostsPermitidos: HOSTS,
});

servidor.listen(PORTA, HOST, () => {
  console.log(`Tributo Claro em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORTA}`);
});

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => { servidor.close(() => { historico.fechar(); process.exit(0); }); });
}
