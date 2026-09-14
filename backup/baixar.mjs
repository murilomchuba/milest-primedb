#!/usr/bin/env node
/* MILEST — backup completo de todas as empresas.
 *
 * Este script usa o Admin SDK, que IGNORA o firestore.rules por definição.
 * É a única forma de ler os dados dos clientes, e é de propósito que ela viva
 * aqui fora, num script que você roda de propósito, e não dentro do produto.
 *
 * Rodar:  node baixar.mjs
 * Opções: --chave=chave.json   --destino=saidas   --consolidado=nao
 *
 * A chave de serviço deve ter APENAS leitura (roles/datastore.viewer).
 * Se ela vazar, quem a tiver lê tudo — mas não apaga nada. Ver LEIA-ME.md.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const AQUI = dirname(fileURLToPath(import.meta.url));
const opcao = (nome, padrao) => {
  const a = process.argv.find(x => x.startsWith('--' + nome + '='));
  return a ? a.slice(nome.length + 3) : padrao;
};

const CHAVE = resolve(AQUI, opcao('chave', 'chave.json'));
const RAIZ = resolve(AQUI, opcao('destino', 'saidas'));
const CONSOLIDADO = opcao('consolidado', 'sim') !== 'nao';

if (!existsSync(CHAVE)) {
  console.error('\nNão achei a chave de serviço em: ' + CHAVE +
    '\nGere uma no console (Configurações do projeto → Contas de serviço) e salve com esse nome.' +
    '\nO LEIA-ME.md desta pasta tem o passo a passo.\n');
  process.exit(1);
}
const credencial = JSON.parse(readFileSync(CHAVE, 'utf8'));
initializeApp({ credential: cert(credencial), projectId: credencial.project_id });
const db = getFirestore();

/* ---- tipos do Firestore que não sobrevivem a JSON.stringify sozinhos ---- */
function serializar(v) {
  if (v === null || v === undefined || typeof v !== 'object') return v;
  if (v instanceof Timestamp) return { __tipo: 'timestamp', valor: v.toDate().toISOString() };
  if (v instanceof GeoPoint) return { __tipo: 'geo', lat: v.latitude, lon: v.longitude };
  if (Buffer.isBuffer(v)) return { __tipo: 'bytes', valor: v.toString('base64') };
  if (v.constructor && v.constructor.name === 'DocumentReference') return { __tipo: 'ref', valor: v.path };
  if (Array.isArray(v)) return v.map(serializar);
  const o = {};
  for (const [k, x] of Object.entries(v)) o[k] = serializar(x);
  return o;
}

let lidos = 0;

/* Varre a coleção inteira, inclusive documentos "fantasma" — os que não têm
   campos mas têm subcoleções penduradas. Um .get() comum não os enxerga, e
   perder um deles significaria perder tudo o que está abaixo. */
async function baixarColecao(col) {
  const refs = await col.listDocuments();
  const saida = [];
  for (let i = 0; i < refs.length; i += 200) {
    const lote = refs.slice(i, i + 200);
    const snaps = await db.getAll(...lote);
    for (const s of snaps) {
      lidos++;
      const no = { id: s.id, dados: s.exists ? serializar(s.data()) : null, subcolecoes: {} };
      for (const sub of await s.ref.listCollections()) {
        no.subcolecoes[sub.id] = await baixarColecao(sub);
      }
      saida.push(no);
    }
    process.stdout.write('\r  ' + lidos + ' documentos lidos…');
  }
  return saida;
}

const contar = (nos) => nos.reduce((a, n) =>
  a + 1 + Object.values(n.subcolecoes).reduce((b, c) => b + contar(c), 0), 0);

const gravar = (caminho, obj) => {
  const txt = JSON.stringify(obj, null, 1);
  writeFileSync(caminho, txt);
  return { bytes: Buffer.byteLength(txt), sha256: createHash('sha256').update(txt).digest('hex') };
};

/* --------------------------------- corrida --------------------------------- */
const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const PASTA = join(RAIZ, carimbo);
mkdirSync(join(PASTA, 'empresas'), { recursive: true });

console.log('\nMILEST — backup de ' + credencial.project_id);
console.log('Destino: ' + PASTA + '\n');

const manifesto = {
  milest: 'backup-completo', versaoDoScript: 1,
  projeto: credencial.project_id,
  geradoEm: new Date().toISOString(),
  empresas: [], outras: [], totalDeDocumentos: 0
};
const tudo = CONSOLIDADO ? { empresas: {}, outras: {} } : null;

const colecoes = await db.listCollections();
for (const col of colecoes) {
  if (col.id === 'orgs') {
    const orgs = await baixarColecao(col);
    for (const o of orgs) {
      const pacote = {
        milest: 'backup-empresa', versaoDoScript: 1,
        projeto: credencial.project_id, geradoEm: manifesto.geradoEm,
        empresa: o.id, dados: o
      };
      const arq = join(PASTA, 'empresas', o.id + '.json');
      const info = gravar(arq, pacote);
      manifesto.empresas.push({
        id: o.id,
        nome: (o.dados && o.dados.nome) || '(sem nome)',
        documentos: contar([o]),
        arquivo: 'empresas/' + o.id + '.json', ...info
      });
      if (tudo) tudo.empresas[o.id] = o;
    }
  } else {
    const nos = await baixarColecao(col);
    const arq = join(PASTA, col.id + '.json');
    const info = gravar(arq, { milest: 'backup-colecao', colecao: col.id, dados: nos });
    manifesto.outras.push({ colecao: col.id, documentos: contar(nos), arquivo: col.id + '.json', ...info });
    if (tudo) tudo.outras[col.id] = nos;
  }
}

manifesto.totalDeDocumentos = lidos;
if (tudo) {
  const info = gravar(join(PASTA, 'completo.json'),
    { milest: 'backup-completo', projeto: credencial.project_id, geradoEm: manifesto.geradoEm, ...tudo });
  manifesto.consolidado = { arquivo: 'completo.json', ...info };
}
gravar(join(PASTA, '_manifesto.json'), manifesto);

const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
console.log('\r' + ' '.repeat(40));
console.log('Empresas:');
for (const e of manifesto.empresas) console.log('  · ' + e.nome.padEnd(28) + e.documentos + ' doc · ' + mb(e.bytes));
for (const o of manifesto.outras) console.log('  · [' + o.colecao + ']'.padEnd(26) + o.documentos + ' doc · ' + mb(o.bytes));
console.log('\n' + lidos + ' documentos no total. Manifesto com o sha256 de cada arquivo em _manifesto.json.');
console.log('Pronto: ' + PASTA + '\n');
process.exit(0);
