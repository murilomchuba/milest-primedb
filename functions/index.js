// versão 2026-09-28.1
/* MILEST — funções do servidor.

   acesso: cria a conta de uma pessoa (ou refaz a senha dela) já com o e-mail
   marcado como confirmado, SEM mandar e-mail nenhum. O administrador passa a
   senha temporária por conta própria e, no primeiro acesso, o sistema obriga a
   pessoa a trocá-la (marca `senhaProvisoria` no cadastro).

   Por que no servidor: as regras do Firestore só aceitam e-mail confirmado —
   é o que impede alguém de criar uma conta com o e-mail de outra pessoa e
   entrar no lugar dela. Pelo navegador, a única forma de confirmar é o clique
   no e-mail. Aqui, com o Admin SDK, quem confirma é o administrador que
   cadastrou, e isso vale como prova de que o e-mail é daquela pessoa.

   Publicar: firebase deploy --only functions                                 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const crypto = require('crypto');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { decidir, decidirExclusao, decidirBackup, decidirPesquisa, decidirStatus, senhaValida, chave } = require('./regras-acesso');

admin.initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 5 });

const ORIGENS = [
  'https://app.milest.com.br',
  'https://milest-app.web.app',
  'https://milest-app.firebaseapp.com'
];

async function ler(ref) {
  const s = await ref.get();
  return s.exists ? s.data() : null;
}

exports.acesso = onCall({ cors: ORIGENS }, async (req) => {
  const tok = req.auth && req.auth.token;
  if (!tok || !tok.email || tok.email_verified !== true)
    throw new HttpsError('unauthenticated', 'entre com uma conta confirmada.');

  const d = req.data || {};
  const quem = chave(tok.email), alvo = chave(d.email), modo = d.modo;
  if (!senhaValida(d.senha))
    throw new HttpsError('invalid-argument', 'a senha precisa ter pelo menos 6 caracteres.');

  const db = admin.firestore();
  const [idxQuem, idxAlvo] = await Promise.all([ler(db.doc('users/' + quem)), ler(db.doc('users/' + alvo))]);
  const orgId = idxAlvo && idxAlvo.orgId;
  let org = null, membroQuem = null, membroAlvo = null;
  if (orgId) {
    [org, membroQuem, membroAlvo] = await Promise.all([
      ler(db.doc('orgs/' + orgId)),
      ler(db.doc('orgs/' + orgId + '/members/' + quem)),
      ler(db.doc('orgs/' + orgId + '/members/' + alvo))
    ]);
  }
  const v = decidir({ quem, alvo, modo, agora: Date.now(), idxQuem, idxAlvo, org, membroQuem, membroAlvo });
  if (!v.ok) throw new HttpsError('permission-denied', v.motivo);

  const auth = admin.auth();
  let usuario = null;
  try { usuario = await auth.getUserByEmail(alvo); }
  catch (e) { if (e.code !== 'auth/user-not-found') throw new HttpsError('internal', 'não consegui consultar a conta.'); }

  let resultado;
  if (!usuario) {
    await auth.createUser({ email: alvo, password: d.senha, emailVerified: true });
    resultado = 'criada';
  } else if (modo === 'criar' && usuario.emailVerified) {
    // conta que já existia e já era usada: a senha dela não muda por este caminho
    return { criada: false };
  } else {
    // 'redefinir', ou uma conta que existia mas nunca foi confirmada — esta
    // última pode ter sido criada por qualquer um, então quem cadastra assume
    await auth.updateUser(usuario.uid, { password: d.senha, emailVerified: true });
    await auth.revokeRefreshTokens(usuario.uid);   // derruba sessões abertas com a senha velha
    resultado = modo === 'redefinir' ? 'redefinida' : 'assumida';
  }

  await db.doc('orgs/' + orgId + '/members/' + alvo).set({
    senhaProvisoria: true,
    acessoPor: quem, acessoEm: Date.now(), acessoComo: v.como
  }, { merge: true });

  console.log('acesso', { quem, alvo, modo, como: v.como, resultado });
  return { criada: true, resultado };
});

/* excluirEmpresa: apaga a empresa INTEIRA — cadastro, projetos com todas as
   subcoleções, recursos, membros, liberações de suporte — e solta o índice de
   quem apontava para ela. Existe porque apagar só o cadastro (o que o
   navegador consegue) deixava os projetos órfãos no banco (achado 3 da
   auditoria). As regras agora só deixam o navegador apagar empresa que nunca
   teve dono; cliente de verdade sai por aqui.
   As contas de login (Authentication) ficam: a mesma pessoa pode estar em
   outra empresa, e sem índice ela não enxerga nada. */
exports.excluirEmpresa = onCall({ cors: ORIGENS, timeoutSeconds: 300 }, async (req) => {
  const tok = req.auth && req.auth.token;
  if (!tok || !tok.email || tok.email_verified !== true)
    throw new HttpsError('unauthenticated', 'entre com uma conta confirmada.');
  const d = req.data || {};
  const orgId = String(d.orgId || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(orgId)) throw new HttpsError('invalid-argument', 'empresa inválida.');

  const db = admin.firestore();
  const quem = chave(tok.email);
  const [idxQuem, org] = await Promise.all([ler(db.doc('users/' + quem)), ler(db.doc('orgs/' + orgId))]);
  const v = decidirExclusao({ quem, idxQuem, org, nomeDigitado: d.nome });
  if (!v.ok) throw new HttpsError('permission-denied', v.motivo);

  const indices = await db.collection('users').where('orgId', '==', orgId).get();
  await db.recursiveDelete(db.doc('orgs/' + orgId));
  const lote = db.batch();
  for (const x of indices.docs) lote.set(x.ref, { orgId: null }, { merge: true });
  lote.set(db.collection('auditoria').doc(), {
    tipo: 'exclusao-empresa', orgId, nome: org.nome || '', por: quem, em: Date.now(),
    indicesSoltos: indices.size
  });
  await lote.commit();
  console.log('excluirEmpresa', { quem, orgId, nome: org.nome, indices: indices.size });
  return { ok: true, indices: indices.size };
});

/* enviarPesquisa: cria uma pesquisa de satisfação por destinatário e manda o
   e-mail com o link. Cada link tem um código aleatório (144 bits) que só vale
   para aquela pessoa, só pode ser respondido uma vez e vence em 30 dias —
   quem garante é a regra do Firestore (orgs/{org}/pesquisas/{token}).
   O e-mail sai pelo Resend (chave no segredo RESEND_API_KEY). Se o envio
   falhar, a pesquisa existe do mesmo jeito e a tela devolve o link para você
   mandar por conta própria. */
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const REMETENTE = 'pesquisa@milest.com.br';
const APP_URL = 'https://app.milest.com.br/';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function corpoEmail(o) {
  return `<!doctype html><html><body style="margin:0;background:#F3F7FA;font-family:Arial,Helvetica,sans-serif;color:#0E1E2B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #D8E3EC;border-radius:10px">
<tr><td style="padding:26px 30px 8px;font-size:13px;color:#47596A">${esc(o.empresa)}</td></tr>
<tr><td style="padding:0 30px;font-size:21px;font-weight:bold;line-height:1.3">Como foi o projeto ${esc(o.projeto)}?</td></tr>
<tr><td style="padding:14px 30px 0;font-size:15px;line-height:1.55;color:#243646">
Olá${o.nome ? ', ' + esc(o.nome) : ''}!<br><br>${esc(o.mensagem).replace(/\n/g, '<br>')}</td></tr>
<tr><td style="padding:22px 30px 6px"><a href="${esc(o.link)}" style="display:inline-block;background:#014479;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 24px;border-radius:7px">Responder a pesquisa</a></td></tr>
<tr><td style="padding:8px 30px 24px;font-size:12px;color:#7A8D9C;line-height:1.5">Leva cerca de 2 minutos. O link é pessoal e vale por 30 dias.<br>
Se o botão não abrir, copie este endereço: ${esc(o.link)}</td></tr>
</table>
<div style="font-size:11px;color:#7A8D9C;padding-top:12px">Enviado por ${esc(o.remetente)} pelo MILEST · milest.com.br</div>
</td></tr></table></body></html>`;
}

async function mandarEmail(chaveApi, o) {
  if (!chaveApi || chaveApi.length < 10 || !chaveApi.startsWith('re_')) return { enviado: false, erro: 'envio de e-mail ainda não configurado' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + chaveApi, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${o.empresa.replace(/[<>"]/g, '')} via MILEST <${REMETENTE}>`,
        to: [o.email], reply_to: o.remetente,
        subject: `Pesquisa de satisfação — ${o.projeto}`,
        html: corpoEmail(o)
      })
    });
    if (r.ok) return { enviado: true };
    const j = await r.json().catch(() => ({}));
    return { enviado: false, erro: (j && j.message) || ('erro ' + r.status + ' no envio') };
  } catch (e) { return { enviado: false, erro: 'falha de rede no envio' }; }
}

exports.enviarPesquisa = onCall({ cors: ORIGENS, secrets: [RESEND_API_KEY], timeoutSeconds: 120 }, async (req) => {
  const tok = req.auth && req.auth.token;
  if (!tok || !tok.email || tok.email_verified !== true)
    throw new HttpsError('unauthenticated', 'entre com uma conta confirmada.');
  const d = req.data || {};
  const db = admin.firestore();
  const quem = chave(tok.email);
  const idxQuem = await ler(db.doc('users/' + quem));
  const orgId = idxQuem && idxQuem.orgId;
  const pid = String(d.projetoId || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(pid)) throw new HttpsError('invalid-argument', 'projeto inválido.');
  const [membroQuem, org, projeto, cfg] = orgId ? await Promise.all([
    ler(db.doc(`orgs/${orgId}/members/${quem}`)), ler(db.doc('orgs/' + orgId)),
    ler(db.doc(`orgs/${orgId}/projects/${pid}`)), ler(db.doc(`orgs/${orgId}/projects/${pid}/config/pesquisa`))
  ]) : [null, null, null, null];
  const perguntas = (cfg && cfg.perguntas) || [];
  const v = decidirPesquisa({ idxQuem, membroQuem, org, projeto, destinatarios: d.destinatarios, perguntas, agora: Date.now() });
  if (!v.ok) throw new HttpsError('permission-denied', v.motivo);

  const mensagem = String(d.mensagem || '').slice(0, 1500) ||
    'Queremos saber como foi a sua experiência neste projeto. A sua opinião nos ajuda a melhorar as próximas entregas.';
  const agora = Date.now(), expira = agora + 30 * 86400000;
  const chaveApi = (RESEND_API_KEY.value() || '').trim();
  const saida = [];
  for (const dest of d.destinatarios) {
    const email = chave(dest.email), nome = String(dest.nome || '').slice(0, 120);
    const token = crypto.randomBytes(18).toString('base64url');
    const link = APP_URL + '?pesquisa=' + encodeURIComponent(orgId) + '.' + token;
    await db.doc(`orgs/${orgId}/pesquisas/${token}`).set({
      projetoId: pid, projetoNome: projeto.name || 'Projeto', cliente: projeto.client || '',
      empresaNome: org.nome || '', perguntas: perguntas.map(q => ({ id: String(q.id || ''), tipo: q.tipo, texto: String(q.texto).trim() })),
      destinatario: { nome, email }, enviadaPor: quem, enviadaEm: agora, expiraEm: expira,
      respondidaEm: null, respostas: null
    });
    const r = await mandarEmail(chaveApi, { email, nome, link, empresa: org.nome || 'MILEST', projeto: projeto.name || 'Projeto', mensagem, remetente: quem });
    await db.doc(`orgs/${orgId}/pesquisas/${token}`).set({ email: r }, { merge: true });
    saida.push({ email, nome, link, enviado: r.enviado, erro: r.erro || '' });
  }
  console.log('enviarPesquisa', { quem, orgId, pid, n: saida.length, enviados: saida.filter(x => x.enviado).length });
  return { itens: saida };
});


/* ---- status report por e-mail ----
   O servidor não monta o relatório: ele entrega. Os números do status report
   só existem no navegador (computeSchedule, indicadoresDe), e recalculá-los
   aqui seria manter duas contas para a mesma pergunta. Então a tela manda o
   corpo pronto e o PDF já desenhado — o mesmo que o botão "Baixar PDF" gera —
   e esta função confere a permissão, monta a mensagem e envia.

   Publicar: firebase deploy --only functions:enviarStatus                   */
const REMETENTE_STATUS = 'relatorios@milest.com.br';

/* O corpo vem da tela, que é conteúdo do próprio usuário indo para os próprios
   clientes. Ainda assim some o que nunca deveria viajar num e-mail: script,
   iframe, manipulador de evento e javascript: em link. Cliente de e-mail
   sério já ignora tudo isso; tirar aqui é para o caso de um dia o corpo vir
   de outro lugar que não esta tela. */
function limparHTML(s) {
  return String(s || '')
    .replace(/<\s*(script|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

const TARJA_TESTE = `<div style="background:#FBE6E4;border:1px solid #F0C4C0;color:#B3322B;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;padding:10px 14px;border-radius:8px;margin:0 0 16px">
ENVIO DE TESTE — esta mensagem foi só para você. Nenhum cliente recebeu.</div>`;

async function mandarStatus(chaveApi, o) {
  if (!chaveApi || chaveApi.length < 10 || !chaveApi.startsWith('re_'))
    return { enviado: false, erro: 'envio de e-mail ainda não configurado' };
  const corpo = `<!doctype html><html><body style="margin:0;background:#F3F7FA;padding:24px 12px">
<div style="max-width:720px;margin:0 auto">${o.teste ? TARJA_TESTE : ''}${o.corpo}</div></body></html>`;
  const msg = {
    from: `${String(o.empresa || 'MILEST').replace(/[<>"]/g, '')} <${REMETENTE_STATUS}>`,
    to: o.para, reply_to: o.remetente, subject: o.assunto, html: corpo
  };
  if (o.cc && o.cc.length) msg.cc = o.cc;
  if (o.pdf) msg.attachments = [{ filename: o.nomeArquivo || 'status-report.pdf', content: o.pdf }];
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + chaveApi, 'Content-Type': 'application/json' },
      body: JSON.stringify(msg)
    });
    if (r.ok) { const j = await r.json().catch(() => ({})); return { enviado: true, id: (j && j.id) || '' }; }
    const j = await r.json().catch(() => ({}));
    return { enviado: false, erro: (j && j.message) || ('erro ' + r.status + ' no envio') };
  } catch (e) { return { enviado: false, erro: 'falha de rede no envio' }; }
}

exports.enviarStatus = onCall({ cors: ORIGENS, secrets: [RESEND_API_KEY], timeoutSeconds: 120, memory: '512MiB' }, async (req) => {
  const tok = req.auth && req.auth.token;
  if (!tok || !tok.email || tok.email_verified !== true)
    throw new HttpsError('unauthenticated', 'entre com uma conta confirmada.');
  const d = req.data || {};
  const db = admin.firestore();
  const quem = chave(tok.email);
  const idxQuem = await ler(db.doc('users/' + quem));
  const orgId = idxQuem && idxQuem.orgId;
  const pid = String(d.projetoId || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(pid)) throw new HttpsError('invalid-argument', 'projeto inválido.');
  const [membroQuem, org, projeto] = orgId ? await Promise.all([
    ler(db.doc(`orgs/${orgId}/members/${quem}`)), ler(db.doc('orgs/' + orgId)),
    ler(db.doc(`orgs/${orgId}/projects/${pid}`))
  ]) : [null, null, null];

  const teste = d.teste === true;
  const v = decidirStatus({
    quem, idxQuem, membroQuem, org, projeto, teste,
    destinatarios: d.destinatarios, copia: d.copia,
    corpo: d.corpo, pdf: d.pdf, agora: Date.now()
  });
  if (!v.ok) throw new HttpsError('permission-denied', v.motivo);

  /* Em teste, quem recebe é quem pediu — a lista do cliente é ignorada aqui,
     no servidor, não na tela. Uma tela pode ter um botão errado; o servidor
     não tem como mandar um teste ao cliente nem se a tela mandar. */
  const para = teste ? [quem] : d.destinatarios.map(x => chave(x.email));
  const cc = teste ? [] : (d.copia || []).map(x => chave(x.email)).filter(x => x);
  const assunto = (teste ? '[TESTE] ' : '')
    + (String(d.assunto || '').slice(0, 200)
       || ('Status report — ' + (projeto.name || 'Projeto') + (projeto.client ? ' · ' + projeto.client : '')));

  const r = await mandarStatus((RESEND_API_KEY.value() || '').trim(), {
    para, cc, teste, assunto, remetente: quem,
    empresa: org.nome || 'MILEST',
    corpo: limparHTML(d.corpo),
    pdf: d.pdf || '', nomeArquivo: String(d.nomeArquivo || '').slice(0, 120)
  });

  /* O registro guarda o que aconteceu, inclusive o que deu errado. Um envio
     que falhou e não deixa rastro é um envio que ninguém refaz. */
  if (!teste) {
    await db.collection(`orgs/${orgId}/projects/${pid}/envios`).add({
      criadoEm: Date.now(), por: quem, destinatarios: para, copia: cc, assunto,
      estado: r.enviado ? 'enviado' : 'falhou', erro: r.erro || '', idExterno: r.id || ''
    });
  }
  console.log('enviarStatus', { quem, orgId, pid, teste, n: para.length, enviado: r.enviado, erro: r.erro || '' });
  if (!r.enviado) throw new HttpsError('internal', r.erro || 'não consegui enviar.');
  return { ok: true, para: para, teste: teste };
});

/* ---- backup diário automático ----
   Todo fim de dia o servidor guarda o banco inteiro num JSON no Cloud Storage
   do projeto. Mesmo formato do botão "⤓ Backup" da tela, então o arquivo abre
   no modo "Cópia de segurança" do app e serve para backup/restaurar.mjs.

   Esta é a camada que roda sozinha e não depende de nenhuma máquina ligada.
   Tirar a cópia de dentro da conta Google é o braço local (backup/local/).

   Publicar: firebase deploy --only functions:backupDiario
   Rodar na mão uma vez:  firebase functions:shell  →  backupDiario()          */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { rodarBackup, DIAS_GUARDADOS } = require('./backup');

/* O callable devolve "INTERNAL" para qualquer exceção não tratada, e quem está
   na tela fica sem saber o que fazer. Aqui a causa vira texto. */
const comoTexto = e => (e && e.message) || 'erro desconhecido';

exports.backupDiario = onSchedule({
  schedule: '10 21 * * *',
  timeZone: 'America/Sao_Paulo',
  memory: '1GiB',
  timeoutSeconds: 540,
  retryCount: 2
}, async () => {
  let r;
  try {
    r = await rodarBackup({
      db: admin.firestore(),
      bucket: admin.storage().bucket(),
      versao: 'servidor',
      dias: DIAS_GUARDADOS
    });
  } catch (e) {
    // sem isto a noite falha em silêncio e só se descobre quando o backup faz falta
    console.error('backupDiario NÃO rodou:', comoTexto(e));
    throw e;
  }
  // esta linha é o que se procura no console quando a dúvida é "rodou ontem?"
  console.log('backupDiario', JSON.stringify(r));
});

/* O mesmo backup, pedido na hora pela aba Plataforma.

   Existe porque não há jeito bom de disparar uma função agendada de 2ª geração
   pela linha de comando: o `functions:shell` não a enxerga. Em vez de mandar o
   Murilo ao console do Cloud Scheduler toda vez que quiser uma cópia, o botão
   fica onde ele já está. Serve também de conferência: se este responde, o
   agendado também vai rodar — é o mesmo código. */
exports.backupAgora = onCall({ cors: ORIGENS, timeoutSeconds: 540, memory: '1GiB' }, async (req) => {
  const tok = req.auth && req.auth.token;
  if (!tok || !tok.email || tok.email_verified !== true)
    throw new HttpsError('unauthenticated', 'entre com uma conta confirmada.');
  const db = admin.firestore();
  const quem = chave(tok.email);
  const idxQuem = await ler(db.doc('users/' + quem));
  const v = decidirBackup({ quem, idxQuem });
  if (!v.ok) throw new HttpsError('permission-denied', v.motivo);

  let bucket;
  try { bucket = admin.storage().bucket(); }
  catch (e) {
    throw new HttpsError('failed-precondition',
      'o armazenamento do projeto ainda não foi criado. No console do Firebase, abra '
      + 'Criação → Storage → "Vamos começar" e aceite o local sugerido. (' + comoTexto(e) + ')');
  }
  let r;
  try {
    r = await rodarBackup({ db, bucket, versao: 'servidor', dias: DIAS_GUARDADOS });
  } catch (e) {
    console.error('backupAgora falhou', e);
    throw new HttpsError('failed-precondition', comoTexto(e));
  }
  console.log('backupAgora', { quem, r });
  return r;
});

/* ---- o vigia, toda manhã ----
   Os avisos de horas e de avanço saem do navegador, no instante em que o
   número muda. Funciona porque o número só muda com alguém no sistema. Mas há
   aviso que depende do RELÓGIO e não de alguém mexer: a atividade que venceu
   ontem, o projeto que passou do término previsto. Esses nunca sairiam de
   dentro do navegador, porque ninguém abre o sistema para descobri-los — é
   justamente o projeto esquecido.

   O servidor continua sem calcular nada: ele lê o retrato do plano que o
   navegador deixou em `vigia/retrato` e compara com o calendário. A decisão
   inteira mora em `vigia.js`, sem rede nem banco, conferida por `npm test`.

   Publicar: firebase deploy --only functions:vigiaDiaria
   Rodar na mão:  firebase functions:shell  →  vigiaAgora({})                 */
const { corpoVigia, assuntoVigia } = require('./vigia');

/** Hoje em São Paulo, como data ISO — o servidor roda em UTC. */
function hojeSP(quando) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(quando || new Date());
}

const { rodarVigia } = require('./vigia-runner');

/* As peças que o executor precisa do mundo de fora. Ficam aqui porque é aqui
   que moram o Resend, o Admin SDK e o remetente; o executor em si não conhece
   nenhum dos três, e é por isso que ele tem teste. */
function pecasDoVigia(o) {
  return {
    db: o.db, hoje: hojeSP(), agora: Date.now(),
    apagar: () => admin.firestore.FieldValue.delete(),
    caminho: (a, b) => new admin.firestore.FieldPath(a, b),
    ler: ref => ler(ref),
    mandar: (msg) => mandarStatus(String(o.chaveApi || '').trim(), Object.assign({
      cc: [], remetente: REMETENTE_STATUS, pdf: '', nomeArquivo: ''
    }, msg)),
    corpo: corpoVigia, assunto: assuntoVigia,
    erro: (...a) => console.error(...a)
  };
}

exports.vigiaDiaria = onSchedule({
  schedule: '12 8 * * *',
  timeZone: 'America/Sao_Paulo',
  secrets: [RESEND_API_KEY],
  memory: '512MiB',
  timeoutSeconds: 540,
  retryCount: 1
}, async () => {
  let r;
  try {
    r = await rodarVigia(pecasDoVigia({ db: admin.firestore(), chaveApi: RESEND_API_KEY.value() }));
  } catch (e) {
    // sem isto a manhã falha em silêncio e só se descobre quando o aviso faz falta
    console.error('vigiaDiaria NÃO rodou:', comoTexto(e));
    throw e;
  }
  // esta linha é o que se procura no console quando a dúvida é "rodou hoje?"
  console.log('vigiaDiaria', JSON.stringify(r));
});

/* A mesma conferência, pedida na hora. Existe pelo mesmo motivo do
   `backupAgora`: não há jeito bom de disparar uma função agendada de 2ª
   geração pela linha de comando, e sem isto a única forma de testar seria
   esperar as 8h12. Só a plataforma chama. */
exports.vigiaAgora = onCall({ cors: ORIGENS, secrets: [RESEND_API_KEY], timeoutSeconds: 540, memory: '512MiB' }, async (req) => {
  const tok = req.auth && req.auth.token;
  if (!tok || !tok.email || tok.email_verified !== true)
    throw new HttpsError('unauthenticated', 'entre com uma conta confirmada.');
  const db = admin.firestore();
  const quem = chave(tok.email);
  const idxQuem = await ler(db.doc('users/' + quem));
  /* Mesma porta do backup na mão, e de propósito: é a mesma pergunta — quem
     opera a plataforma? Repetir a regra aqui seria criar um segundo lugar
     para ela divergir. */
  const v = decidirBackup({ quem, idxQuem });
  if (!v.ok) throw new HttpsError('permission-denied', 'a conferência na mão é de quem opera a plataforma.');
  const r = await rodarVigia(pecasDoVigia({ db, chaveApi: RESEND_API_KEY.value() }));
  console.log('vigiaAgora', quem, JSON.stringify(r));
  return r;
});
