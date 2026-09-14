#!/usr/bin/env node
/* MILEST — restauração a partir de um arquivo do baixar.mjs.
 *
 * Regrava por cima do que existe. NÃO apaga o que está no banco e não está no
 * arquivo — sobrescrever é menos destrutivo do que limpar, e foi a mesma
 * decisão tomada dentro do sistema.
 *
 * Rodar (sempre veja o ensaio antes):
 *   node restaurar.mjs saidas/2026-.../empresas/unimed.json
 *   node restaurar.mjs saidas/2026-.../empresas/unimed.json --confirmar
 *
 * Opções: --chave=chave-escrita.json  --empresa=<outroId>  --confirmar
 *
 * Sem --confirmar é só ensaio: lista o que faria e não grava nada.
 * A chave aqui precisa de ESCRITA (roles/datastore.user) — por isso é um
 * arquivo separado da chave do backup, que é só de leitura.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const opcao = (n, p) => {
  const a = process.argv.find(x => x.startsWith('--' + n + '='));
  return a ? a.slice(n.length + 3) : p;
};
const CONFIRMAR = process.argv.includes('--confirmar');
const ARQUIVO = process.argv.slice(2).find(a => !a.startsWith('--'));

if (!ARQUIVO) {
  console.error('\nUso: node restaurar.mjs <arquivo.json> [--empresa=<id>] [--confirmar]\n');
  process.exit(1);
}
const caminho = resolve(process.cwd(), ARQUIVO);
if (!existsSync(caminho)) { console.error('\nNão achei o arquivo: ' + caminho + '\n'); process.exit(1); }

let CHAVE = resolve(AQUI, opcao('chave', 'chave-escrita.json'));
if (!existsSync(CHAVE)) CHAVE = resolve(AQUI, 'chave.json');
if (!existsSync(CHAVE)) {
  console.error('\nNão achei a chave de escrita. Ver LEIA-ME.md desta pasta.\n');
  process.exit(1);
}
const credencial = JSON.parse(readFileSync(CHAVE, 'utf8'));
initializeApp({ credential: cert(credencial), projectId: credencial.project_id });
const db = getFirestore();

function desserializar(v) {
  if (v === null || v === undefined || typeof v !== 'object') return v;
  if (v.__tipo === 'timestamp') return Timestamp.fromDate(new Date(v.valor));
  if (v.__tipo === 'geo') return new GeoPoint(v.lat, v.lon);
  if (v.__tipo === 'bytes') return Buffer.from(v.valor, 'base64');
  if (v.__tipo === 'ref') return db.doc(v.valor);
  if (Array.isArray(v)) return v.map(desserializar);
  const o = {};
  for (const [k, x] of Object.entries(v)) o[k] = desserializar(x);
  return o;
}

/* Percorre a árvore e devolve a lista plana de gravações a fazer. */
function achatar(nos, prefixo, saida = []) {
  for (const n of nos) {
    const caminhoDoc = prefixo + '/' + n.id;
    if (n.dados !== null) saida.push({ caminho: caminhoDoc, dados: desserializar(n.dados) });
    for (const [sub, filhos] of Object.entries(n.subcolecoes || {})) achatar(filhos, caminhoDoc + '/' + sub, saida);
  }
  return saida;
}

const pacote = JSON.parse(readFileSync(caminho, 'utf8'));
let gravacoes = [];
let descricao = '';

if (pacote.milest === 'backup-empresa') {
  const alvo = opcao('empresa', pacote.empresa);
  const no = { ...pacote.dados, id: alvo };
  gravacoes = achatar([no], 'orgs');
  descricao = 'empresa "' + pacote.empresa + '"' + (alvo !== pacote.empresa ? ' → gravando em "' + alvo + '"' : '');
} else if (pacote.milest === 'backup-colecao') {
  gravacoes = achatar(pacote.dados, pacote.colecao);
  descricao = 'coleção "' + pacote.colecao + '"';
} else if (pacote.milest === 'backup-completo') {
  for (const [id, no] of Object.entries(pacote.empresas || {})) achatar([{ ...no, id }], 'orgs', gravacoes);
  for (const [col, nos] of Object.entries(pacote.outras || {})) achatar(nos, col, gravacoes);
  descricao = 'backup completo (' + Object.keys(pacote.empresas || {}).length + ' empresa(s))';
} else {
  console.error('\nEste arquivo não veio do baixar.mjs. Para restaurar o backup que o próprio' +
    '\nsistema baixa (aba Calendário), use a tela de restauração dentro do MILEST.\n');
  process.exit(1);
}

console.log('\nMILEST — restauração em ' + credencial.project_id);
console.log('Arquivo:  ' + caminho);
console.log('Origem:   ' + (pacote.geradoEm || '?'));
console.log('Conteúdo: ' + descricao);
console.log('Gravações: ' + gravacoes.length + ' documento(s)\n');

if (!CONFIRMAR) {
  console.log('ENSAIO — nada foi gravado. Amostra do que seria escrito:');
  for (const g of gravacoes.slice(0, 12)) console.log('  ' + g.caminho);
  if (gravacoes.length > 12) console.log('  … e mais ' + (gravacoes.length - 12) + '.');
  console.log('\nPara gravar de verdade, repita o comando com --confirmar\n');
  process.exit(0);
}

let feitas = 0;
for (let i = 0; i < gravacoes.length; i += 400) {
  const lote = db.batch();
  for (const g of gravacoes.slice(i, i + 400)) lote.set(db.doc(g.caminho), g.dados);
  await lote.commit();
  feitas += Math.min(400, gravacoes.length - i);
  process.stdout.write('\r  ' + feitas + '/' + gravacoes.length + ' gravados…');
}
console.log('\n\nRestauração concluída: ' + feitas + ' documento(s).\n');
process.exit(0);
