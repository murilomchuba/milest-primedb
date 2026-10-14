/* Gera os dois destinos a partir de app.src.html.
   Uso:  node build.js

   Faz três coisas, e as duas últimas existem por causa de erros que
   aconteceram de verdade:

   1. monta o documento completo em volta do fonte;

   2. CARIMBA a versão com a data e a hora do build. Antes o `VERSAO` era uma
      constante escrita à mão, e ficou dois meses parada em '2026-09-30.1'
      enquanto meia dúzia de releases subiam. O número no rodapé da aba
      Calendário era, portanto, inútil justamente para a pergunta que ele
      existe para responder: "estou vendo a página nova ou o cache?";

   3. CONFERE A SINTAXE do script gerado. `build.js` montava o arquivo sem
      nunca olhar o JavaScript, então um `const` duplicado passava batido,
      quebrava a página inteira no navegador, e só aparecia quando alguém
      abria o sistema. Agora o build falha na hora, dizendo a linha.          */
const fs = require('fs'), path = require('path');
const dir = __dirname;
const src = fs.readFileSync(path.join(dir, 'app.src.html'), 'utf8');
const cut = src.indexOf('<style>');
if (cut < 0) { console.error('app.src.html sem <style>'); process.exit(1); }

/* ---- a versão, carimbada ---- */
const d = new Date();
const p2 = n => String(n).padStart(2, '0');
const VERSAO = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())
  + '.' + p2(d.getHours()) + p2(d.getMinutes());

const ALVO = /const VERSAO = '[^']*';/;
if (!ALVO.test(src)) { console.error('não achei a linha do VERSAO em app.src.html'); process.exit(1); }
const carimbado = src.replace(ALVO, "const VERSAO = '" + VERSAO + "';");

const head = carimbado.slice(0, cut).trim();
const body = carimbado.slice(cut);
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

const solto = doc('');

/* ---- a conferência de sintaxe ---- */
const inline = solto.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/);
if (!inline) { console.error('não achei o script do app no documento gerado'); process.exit(1); }
const tmp = path.join(require('os').tmpdir(), 'milest-build-check.js');
fs.writeFileSync(tmp, inline[1]);
const r = require('child_process').spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
try { fs.unlinkSync(tmp); } catch (e) { }
if (r.status !== 0) {
  console.error('O JavaScript do app não compila — nada foi gravado:\n');
  console.error(String(r.stderr || '').split('\n').slice(0, 12).join('\n'));
  process.exit(1);
}

fs.writeFileSync(path.join(dir, 'cronograma.html'), solto);
fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
fs.writeFileSync(path.join(dir, 'public', 'index.html'), doc('<script src="firebase-config.js"></script>\n'));
console.log('gerado: cronograma.html e public/index.html · versão ' + VERSAO + ' · sintaxe conferida');
