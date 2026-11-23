// Gera a versão estática de demonstração (GitHub Pages) em _site/.
// Sem servidor e sem motor: o app.js entra em modo demo (public/demo.js).
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, readdirSync } from 'node:fs';

const saida = '_site';
rmSync(saida, { recursive: true, force: true });
mkdirSync(saida);
for (const f of ['app.js', 'demo.js', 'estilo.css']) copyFileSync(`public/${f}`, `${saida}/${f}`);
mkdirSync(`${saida}/fontes`);
for (const f of readdirSync('public/fontes')) copyFileSync(`public/fontes/${f}`, `${saida}/fontes/${f}`);
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'";
let html = readFileSync('public/index.html', 'utf8')
  .replace('<html lang="pt-BR">', '<html lang="pt-BR" data-modo="demo">')
  .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${csp}">\n  <meta name="referrer" content="no-referrer">\n  <meta name="robots" content="noindex">`)
  .replace('<title>Tributo Claro ·', '<title>Tributo Claro (demonstração) ·')
  // na demonstração o cClassTrib é opcional: sem "required", o leitor de tela não anuncia obrigatório
  .replace(/(<input name="cClassTrib"[^>]*?) required>/, '$1>')
  .replace('Cálculo pela <a', 'Na versão completa, o cálculo é feito pela <a');
if (!html.includes('data-modo="demo"') || !html.includes('Na versão completa') || /<input name="cClassTrib"[^>]* required>/.test(html)) throw new Error('não marcou o modo demo');
writeFileSync(`${saida}/index.html`, html);
writeFileSync(`${saida}/.nojekyll`, '');
console.log('gerado em _site/');
