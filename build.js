/* Gera os dois destinos a partir de app.src.html (a mesma fonte publicada no artifact).
   Uso:  node build.js                                                       */
const fs = require('fs'), path = require('path');
const dir = __dirname;
const src = fs.readFileSync(path.join(dir, 'app.src.html'), 'utf8');
const cut = src.indexOf('<style>');
if (cut < 0) { console.error('app.src.html sem <style>'); process.exit(1); }
const head = src.slice(0, cut).trim();
const body = src.slice(cut);
const doc = (extra) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${head}
<style>html{color-scheme:light dark}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${extra}${body}
</body>
</html>
`;
fs.writeFileSync(path.join(dir, 'cronograma.html'), doc(''));
fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
fs.writeFileSync(path.join(dir, 'public', 'index.html'), doc('<script src="firebase-config.js"></script>\n'));
console.log('gerado: cronograma.html (arquivo solto) e public/index.html (Hosting)');
