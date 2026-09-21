// versão 2026-09-21.2
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
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { decidir, senhaValida, chave } = require('./regras-acesso');

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
