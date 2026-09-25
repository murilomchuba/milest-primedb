// versão 2026-09-25.1
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
const { decidir, decidirExclusao, decidirBackup, decidirPesquisa, senhaValida, chave } = require('./regras-acesso');

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

exports.backupDiario = onSchedule({
  schedule: '10 21 * * *',
  timeZone: 'America/Sao_Paulo',
  memory: '1GiB',
  timeoutSeconds: 540,
  retryCount: 2
}, async () => {
  const r = await rodarBackup({
    db: admin.firestore(),
    bucket: admin.storage().bucket(),
    versao: 'servidor',
    dias: DIAS_GUARDADOS
  });
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

  const r = await rodarBackup({ db, bucket: admin.storage().bucket(), versao: 'servidor', dias: DIAS_GUARDADOS });
  console.log('backupAgora', { quem, r });
  return r;
});
