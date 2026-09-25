const { test } = require('node:test');
const assert = require('node:assert');
const { coletarTudo, rodarBackup, expurgar, contar } = require('../backup');

/* ---- um Firestore de mentira, com a mesma cara do de verdade ---- */
function fakeDb(dados) {
  return {
    collection(caminho) {
      return {
        get: async () => {
          const d = dados[caminho];
          if (!d) return { docs: [] };
          return { docs: Object.entries(d).map(([id, v]) => ({ id, data: () => v })) };
        }
      };
    }
  };
}
function fakeBucket(arquivos) {
  return {
    file(nome) {
      return { save: async (texto) => { arquivos[nome] = texto; },
               delete: async () => { delete arquivos[nome]; } };
    },
    getFiles: async ({ prefix }) => [Object.keys(arquivos).filter(n => n.startsWith(prefix)).map(nome => ({
      name: nome, delete: async () => { delete arquivos[nome]; }
    }))]
  };
}

const BANCO = {
  'users': { 'a@x.com': { org: 'o1' } },
  'orgs': { o1: { nome: 'Prime DB' }, o2: { nome: 'GOB' } },
  'orgs/o1/members': { 'a@x.com': { papel: 'admin' } },
  'orgs/o1/projects': { p1: { name: 'Migração OCI', client: 'Unimed', updatedAt: 9 } },
  'orgs/o1/projects/p1/tasks': { t1: { name: 'A' }, t2: { name: 'B' } },
  'orgs/o1/projects/p1/diario': { d1: { texto: 'oi' } },
  'orgs/o1/projects/p1/docsData': { x1: { base64: 'AAAA' } },
  'orgs/o1/resources': { r1: { name: 'Fulano' } },
  'orgs/o2/projects': { p2: { name: 'Datalake', client: 'Madero' } },
  'orgs/o2/projects/p2/tasks': { t3: { name: 'C' } }
};

test('o arquivo sai na mesma forma que o app espera no modo cópia de segurança', async () => {
  const d = await coletarTudo(fakeDb(BANCO), { versao: 'teste', agora: Date.UTC(2026, 8, 25) });
  assert.equal(d.milest, 'backup-total');
  assert.equal(d.empresas.length, 2);
  const o1 = d.empresas.find(e => e.id === 'o1');
  assert.equal(o1.cadastro.nome, 'Prime DB');
  assert.equal(o1.membros.length, 1);
  assert.equal(o1.resources[0].name, 'Fulano');
  const p1 = o1.projects[0];
  // o app lê exatamente estes campos em arqBanco()/aplicarBackup()
  for (const campo of ['id', 'meta', 'tasks', 'versions', 'versionsData', 'docs', 'docsData', 'diario']) {
    assert.ok(campo in p1, 'falta ' + campo);
  }
  assert.equal(p1.meta.name, 'Migração OCI');
  assert.equal(p1.tasks.length, 2);
  assert.equal(p1.tasks[0].id, 't1');          // o id vem do doc, não do campo
  assert.equal(p1.diario.length, 1);
  assert.equal(d.raiz, null);                  // não há projetos soltos na raiz
});

test('nenhuma empresa fica de fora', async () => {
  const d = await coletarTudo(fakeDb(BANCO), {});
  const c = contar(d);
  assert.deepEqual(c, { empresas: 2, projetos: 2, atividades: 3, anexos: 1 });
});

test('sem anexos quando pedido, e o arquivo declara isso', async () => {
  const d = await coletarTudo(fakeDb(BANCO), { anexos: false });
  assert.equal(d.anexos, false);
  assert.equal(d.empresas.find(e => e.id === 'o1').projects[0].docsData.length, 0);
});

test('projetos soltos na raiz antiga entram no backup', async () => {
  const banco = Object.assign({}, BANCO, {
    'projects': { velho: { name: 'De antes' } },
    'projects/velho/tasks': { t: { name: 'X' } }
  });
  const d = await coletarTudo(fakeDb(banco), {});
  assert.equal(d.raiz.projects.length, 1);
  assert.equal(d.raiz.projects[0].tasks.length, 1);
});

test('uma coleção que o banco recusa não derruba o backup inteiro', async () => {
  const db = fakeDb(BANCO);
  const original = db.collection.bind(db);
  db.collection = c => c.endsWith('/diario')
    ? { get: async () => { throw new Error('permissão'); } }
    : original(c);
  const d = await coletarTudo(db, {});
  assert.equal(d.empresas.length, 2);
  assert.equal(d.empresas.find(e => e.id === 'o1').projects[0].diario.length, 0);
});

test('grava a cópia do dia e a ultimo.json', async () => {
  const arq = {};
  const r = await rodarBackup({ db: fakeDb(BANCO), bucket: fakeBucket(arq), agora: Date.UTC(2026, 8, 25), dias: 60 });
  assert.equal(r.arquivo, 'backups/milest-2026-09-25.json');
  assert.ok(arq['backups/milest-2026-09-25.json']);
  assert.equal(arq['backups/ultimo.json'], arq['backups/milest-2026-09-25.json']);
  assert.equal(JSON.parse(arq['backups/ultimo.json']).milest, 'backup-total');
  assert.equal(r.empresas, 2);
});

test('o expurgo apaga o que passou do prazo e poupa o resto', async () => {
  const arq = {
    'backups/milest-2026-01-01.json': 'velho',
    'backups/milest-2026-09-20.json': 'novo',
    'backups/ultimo.json': 'ponteiro',
    'backups/anotacao-do-murilo.txt': 'não é minha'
  };
  const apagados = await expurgar(fakeBucket(arq), Date.UTC(2026, 8, 25), 60);
  assert.deepEqual(apagados, ['backups/milest-2026-01-01.json']);
  assert.ok(!('backups/milest-2026-01-01.json' in arq));
  assert.ok('backups/milest-2026-09-20.json' in arq);
  assert.ok('backups/ultimo.json' in arq, 'o ponteiro nunca pode ser apagado');
  assert.ok('backups/anotacao-do-murilo.txt' in arq, 'arquivo de fora do padrão fica');
});

/* ---- a página que abre sozinha ---- */
const { montarHTML, baixarApp } = require('../backup');
const APP_FALSO = '<html><head><title>MILEST</title></head><body>app</body></html>' + 'x'.repeat(60000);
const buscarFalso = (ok, corpo) => async () => ({ ok, status: ok ? 200 : 503, text: async () => corpo });

test('os dados entram antes do </head> e não fecham o script no meio', async () => {
  const dados = { milest: 'backup-total', nota: 'olha um </script> e um <div> aqui' };
  const html = montarHTML(APP_FALSO, dados);
  assert.ok(html.indexOf('window.__MILEST_BACKUP=') < html.indexOf('</head>'), 'tem que entrar antes do </head>');
  // o que importa é o MIOLO: nenhum "<" cru nos dados, senão o </script> que
  // veio de dentro do texto encerra o bloco e a página abre em branco
  const bloco = html.slice(html.indexOf('window.__MILEST_BACKUP='), html.indexOf('</head>'));
  const json = bloco.slice(bloco.indexOf('=') + 1, bloco.indexOf(';<' + '/script>'));
  assert.ok(!json.includes('<'), 'nenhum "<" cru pode sobrar nos dados');
  assert.ok(json.includes('\\u003c'));
  // e o navegador ainda lê o valor de volta igual ao original
  assert.deepEqual(JSON.parse(json), dados);
});

test('página truncada ou fora do ar não passa por backup', async () => {
  await assert.rejects(() => baixarApp('x', buscarFalso(false, '')), /respondeu 503/);
  await assert.rejects(() => baixarApp('x', buscarFalso(true, '<html>oi</html>')), /incompleta/);
});

test('se o app não responde, o JSON do dia continua gravado', async () => {
  const arq = {};
  const r = await rodarBackup({
    db: fakeDb(BANCO), bucket: fakeBucket(arq), agora: Date.UTC(2026, 8, 25),
    buscar: buscarFalso(false, '')
  });
  assert.ok(arq['backups/milest-2026-09-25.json'], 'o dado não pode se perder por causa da página');
  assert.ok(!arq['backups/milest-2026-09-25.html']);
  assert.match(r.pagina, /^FALHOU/);
});

test('no dia bom, saem o JSON e a página', async () => {
  const arq = {};
  const r = await rodarBackup({
    db: fakeDb(BANCO), bucket: fakeBucket(arq), agora: Date.UTC(2026, 8, 25),
    buscar: buscarFalso(true, APP_FALSO)
  });
  assert.equal(r.pagina, 'backups/milest-2026-09-25.html');
  assert.ok(arq['backups/ultimo.html'].includes('window.__MILEST_BACKUP='));
  assert.equal(arq['backups/ultimo.html'], arq['backups/milest-2026-09-25.html']);
});

test('o expurgo cuida das páginas também, e continua poupando os ponteiros', async () => {
  const arq = {
    'backups/milest-2026-01-01.json': 'v', 'backups/milest-2026-01-01.html': 'v',
    'backups/milest-2026-09-20.json': 'n', 'backups/milest-2026-09-20.html': 'n',
    'backups/ultimo.json': 'p', 'backups/ultimo.html': 'p'
  };
  const apagados = await expurgar(fakeBucket(arq), Date.UTC(2026, 8, 25), 60);
  assert.equal(apagados.length, 2);
  assert.ok('backups/ultimo.html' in arq && 'backups/ultimo.json' in arq);
  assert.ok('backups/milest-2026-09-20.html' in arq);
});
