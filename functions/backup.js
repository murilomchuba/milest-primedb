/* MILEST — backup diário automático.

   O que é: todo fim de dia o servidor lê o banco inteiro e guarda um arquivo
   JSON no Cloud Storage do próprio projeto. O arquivo tem exatamente o mesmo
   formato do botão "⤓ Backup" da tela (coletarBackupTotal), então ele abre no
   modo "🛟 Cópia de segurança" do próprio app, sem Firebase e sem internet, e
   serve de entrada para backup/restaurar.mjs.

   Por que no servidor: o Admin SDK não precisa de chave de conta de serviço —
   a política herdada da organização bloqueia a criação dessas chaves neste
   projeto, e é isso que mantinha a cópia fora do Google como tarefa manual.

   O que este arquivo NÃO faz: tirar a cópia de dentro da conta Google. Isso é
   o braço local (backup/local/), que baixa daqui para o Mac e para o Drive. */

const DIAS_GUARDADOS = 60;
const APP_URL = 'https://app.milest.com.br/';            // quantas cópias diárias ficam no Storage
const TETO_COM_ANEXOS = 60 * 1024 * 1024;   // acima disso, o dia vai sem os anexos

const lista = snap => snap.docs.map(d => Object.assign({}, d.data(), { id: d.id }));
const VAZIO = { docs: [] };
const semErro = p => p.catch(() => VAZIO);

/** Espelho fiel de coletarBackupTotal() do app. Se um dia aquele mudar, este
 *  muda junto — é o mesmo arquivo que os dois lados leem. */
async function coletarTudo(db, opcoes) {
  const o = opcoes || {};
  const saida = {
    milest: 'backup-total',
    versao: o.versao || 'servidor',
    geradoEm: new Date(o.agora || Date.now()).toISOString(),
    por: 'backup automático',
    anexos: o.anexos !== false,
    empresas: [], users: [], raiz: null
  };

  saida.users = lista(await semErro(db.collection('users').get()));

  const orgs = lista(await db.collection('orgs').get());
  for (const org of orgs) {
    const base = 'orgs/' + org.id;
    const emp = { id: org.id, cadastro: org, membros: [], projects: [], resources: [] };
    emp.membros = lista(await semErro(db.collection(base + '/members').get()));

    const ps = await semErro(db.collection(base + '/projects').get());
    for (const d of ps.docs) {
      const bp = base + '/projects/' + d.id;
      const [t, v, vd, dc, dd, di, hh, eq] = await Promise.all([
        semErro(db.collection(bp + '/tasks').get()),
        semErro(db.collection(bp + '/versions').get()),
        semErro(db.collection(bp + '/versionsData').get()),
        semErro(db.collection(bp + '/docs').get()),
        saida.anexos ? semErro(db.collection(bp + '/docsData').get()) : Promise.resolve(VAZIO),
        semErro(db.collection(bp + '/diario').get()),
        semErro(db.collection(bp + '/horas').get()),
        semErro(db.collection(bp + '/equipe').get())
      ]);
      emp.projects.push({
        id: d.id, meta: d.data() || {}, tasks: lista(t), versions: lista(v),
        versionsData: lista(vd), docs: lista(dc), docsData: lista(dd), diario: lista(di),
        horas: lista(hh), equipe: lista(eq)
      });
    }
    emp.resources = lista(await semErro(db.collection(base + '/resources').get()));
    saida.empresas.push(emp);
  }

  // cronogramas soltos na raiz, de antes da separação por empresa
  const ps = await semErro(db.collection('projects').get());
  if (ps.docs.length) {
    const raiz = { projects: [], resources: [] };
    for (const d of ps.docs) {
      const bp = 'projects/' + d.id;
      const [t, v, vd] = await Promise.all([
        semErro(db.collection(bp + '/tasks').get()),
        semErro(db.collection(bp + '/versions').get()),
        semErro(db.collection(bp + '/versionsData').get())
      ]);
      raiz.projects.push({ id: d.id, meta: d.data() || {}, tasks: lista(t), versions: lista(v), versionsData: lista(vd) });
    }
    raiz.resources = lista(await semErro(db.collection('resources').get()));
    saida.raiz = raiz;
  }
  return saida;
}

function contar(d) {
  let projetos = 0, atividades = 0, anexos = 0;
  for (const e of d.empresas) {
    projetos += e.projects.length;
    for (const p of e.projects) {
      atividades += (p.tasks || []).length;
      anexos += (p.docsData || []).length;
    }
  }
  if (d.raiz) projetos += d.raiz.projects.length;
  return { empresas: d.empresas.length, projetos, atividades, anexos };
}

/* O JSON é o dado; quem ABRE o dado é o app. Por isso o dia também sai como
   uma página inteira com os dados embutidos: dois cliques, sem Firebase e sem
   internet. É a mesma montagem do botão "Backup completo" da aba Plataforma —
   se aquele mudar, este muda junto. */
function montarHTML(htmlApp, dados) {
  const json = JSON.stringify(dados)
    .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const bloco = '<' + 'script>window.__MILEST_BACKUP=' + json + ';<' + '/script>\n';
  const corte = htmlApp.indexOf('</head>');
  return corte >= 0 ? htmlApp.slice(0, corte) + bloco + htmlApp.slice(corte) : bloco + htmlApp;
}

async function baixarApp(url, buscar) {
  const f = buscar || fetch;
  const r = await f(url || APP_URL, { headers: { 'cache-control': 'no-store' } });
  if (!r.ok) throw new Error('a página respondeu ' + r.status);
  const html = await r.text();
  if (html.length < 50000 || html.indexOf('</head>') < 0) throw new Error('a página veio incompleta');
  return html;
}

const diaDe = ms => new Date(ms).toISOString().slice(0, 10);
const NOME = /^backups\/milest-(\d{4}-\d{2}-\d{2})\.(json|html)$/;

/** Apaga as cópias que passaram do prazo. Nunca toca em ultimo.json nem em
 *  nada que não siga o padrão de nome — arquivo estranho na pasta fica. */
async function expurgar(bucket, agora, dias) {
  const limite = diaDe(agora - (dias || DIAS_GUARDADOS) * 86400000);
  const [arquivos] = await bucket.getFiles({ prefix: 'backups/milest-' });
  const apagados = [];
  for (const f of arquivos) {
    const m = NOME.exec(f.name);
    if (!m || m[1] >= limite) continue;
    try { await f.delete(); apagados.push(f.name); } catch (e) { }
  }
  return apagados;
}

/* O balde do Storage não existe até alguém ligar o Storage no console do
   Firebase. Sem esta conferência o erro chega como "INTERNAL", que não diz
   nada a quem está olhando a tela — e foi exatamente o que aconteceu. */
async function conferirBalde(bucket) {
  const nome = (bucket && bucket.name) || '(sem nome)';
  let existe = false;
  try {
    const r = await bucket.exists();
    existe = Array.isArray(r) ? r[0] : !!r;
  } catch (e) {
    throw new Error('não consegui falar com o armazenamento (' + nome + '): ' + ((e && e.message) || 'erro'));
  }
  if (!existe) {
    throw new Error('o armazenamento do projeto ainda não foi criado. No console do Firebase, '
      + 'abra Criação → Storage → "Vamos começar" e aceite o local sugerido. '
      + 'O balde esperado é ' + nome + '.');
  }
  return nome;
}

async function gravar(bucket, nome, texto, tipo) {
  await bucket.file(nome).save(texto, {
    contentType: tipo || 'application/json; charset=utf-8',
    resumable: false,
    metadata: { cacheControl: 'no-store' }
  });
}

/** O trabalho do dia. Recebe tudo de fora para poder ser testado sem nuvem. */
async function rodarBackup(dep) {
  const agora = dep.agora || Date.now();
  const dia = diaDe(agora);
  const balde = await conferirBalde(dep.bucket);

  let dados = await coletarTudo(dep.db, { versao: dep.versao, agora: agora });
  let texto = JSON.stringify(dados);

  // anexo é base64 e cresce rápido; passando do teto, o dia vai sem eles e o
  // arquivo diz isso em `anexos`, para ninguém restaurar achando que tem tudo
  if (texto.length > TETO_COM_ANEXOS) {
    dados = await coletarTudo(dep.db, { versao: dep.versao, agora: agora, anexos: false });
    texto = JSON.stringify(dados);
  }

  const nome = 'backups/milest-' + dia + '.json';
  await gravar(dep.bucket, nome, texto);
  await gravar(dep.bucket, 'backups/ultimo.json', texto);

  /* A página que abre sozinha. Se o app não responder, o dia não se perde:
     o JSON já está gravado e o aviso fica no registro. */
  let pagina = '';
  try {
    const html = montarHTML(await baixarApp(dep.appUrl, dep.buscar), dados);
    await gravar(dep.bucket, 'backups/milest-' + dia + '.html', html, 'text/html; charset=utf-8');
    await gravar(dep.bucket, 'backups/ultimo.html', html, 'text/html; charset=utf-8');
    pagina = 'backups/milest-' + dia + '.html';
  } catch (e) {
    pagina = 'FALHOU: ' + ((e && e.message) || 'erro');
  }

  const apagados = await expurgar(dep.bucket, agora, dep.dias);
  return Object.assign({ balde: balde, arquivo: nome, pagina: pagina, bytes: texto.length, anexos: dados.anexos, apagados: apagados.length }, contar(dados));
}

module.exports = { coletarTudo, rodarBackup, expurgar, contar, montarHTML, baixarApp, conferirBalde, DIAS_GUARDADOS, TETO_COM_ANEXOS, APP_URL };
