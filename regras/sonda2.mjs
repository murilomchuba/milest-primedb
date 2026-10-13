/* Sonda 2 — bissecção do caso da substituta, contra o fixture REAL.
   Três ambientes, mesma massa de dados, regras cada vez menores:
     A) o firestore.rules de verdade        → reproduz a falha?
     B) só a expressão, sem nada em volta   → o dado é o que pensamos?
     C) a cadeia daOrg + papel + meuProjeto → a composição é o problema?
   Descartável: apagar quando o caso fechar. */
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const GI = 'gi@unimed.com.br', HELO = 'helo@unimed.com.br';

const SO_A_EXPRESSAO = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function eu() { return request.auth.token.email.lower(); }
    match /orgs/{org}/projects/{projeto} {
      allow get: if eu() in resource.data.get('gpExtra', []);
    }
    match /{tudo=**} { allow read, write: if false; }
  }
}`;

const A_CADEIA = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function logado() { return request.auth != null && request.auth.token.email_verified == true; }
    function eu() { return request.auth.token.email.lower(); }
    function docMembro(org) { return /databases/$(database)/documents/orgs/$(org)/members/$(eu()); }
    function docOrg(org)    { return /databases/$(database)/documents/orgs/$(org); }
    function orgViva(org)   { return exists(docOrg(org)) && get(docOrg(org)).data.ativo != false; }
    function daOrg(org) {
      return logado() && exists(docMembro(org))
          && get(docMembro(org)).data.ativo != false
          && orgViva(org);
    }
    function papelNa(org) { return get(docMembro(org)).data.get('papel', 'leitor'); }
    function meuProjeto(d) { return d.get('gp', '') == eu() || eu() in d.get('gpExtra', []); }
    match /orgs/{org}/projects/{projeto} {
      allow get: if daOrg(org) && papelNa(org) == 'gp' && meuProjeto(resource.data);
    }
    match /{tudo=**} { allow read, write: if false; }
  }
}`;

const semear = async (env) => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'orgs', 'unimed'), { nome: 'Unimed', ativo: true });
    await setDoc(doc(db, 'users', GI), { email: GI, orgId: 'unimed' });
    await setDoc(doc(db, 'users', HELO), { email: HELO, orgId: 'unimed' });
    await setDoc(doc(db, 'orgs/unimed/members', GI), { email: GI, papel: 'gp', ativo: true });
    await setDoc(doc(db, 'orgs/unimed/members', HELO), { email: HELO, papel: 'gp', ativo: true });
    await setDoc(doc(db, 'orgs/unimed/projects', 'p1'), { name: 'Titular', gp: GI, gpExtra: [] });
    await setDoc(doc(db, 'orgs/unimed/projects', 'p3'), { name: 'Substituta', gp: HELO, gpExtra: [GI] });
    await setDoc(doc(db, 'orgs/unimed/projects/p3/tasks', 't3'), { name: 'Alguma coisa' });
  });
};

const provar = async (rotulo, regras, projectId) => {
  const env = await initializeTestEnvironment({
    projectId, firestore: { rules: regras, host: '127.0.0.1', port: 8080 }
  });
  await semear(env);
  const gi = env.authenticatedContext(GI, { email: GI, email_verified: true }).firestore();
  const ler = async (caminho, id) => {
    try { await assertSucceeds(getDoc(doc(gi, caminho, id))); return 'LÊ'; }
    catch (e) { return 'recusou'; }
  };
  const p1 = await ler('orgs/unimed/projects', 'p1');
  const p3 = await ler('orgs/unimed/projects', 'p3');
  console.log('  ' + rotulo.padEnd(34) + ' p1(titular): ' + p1.padEnd(8) + ' p3(substituta): ' + p3);
  await env.cleanup();
};

/* O que a massa de dados realmente guarda, lido sem passar pelas regras. */
const espiar = async () => {
  const env = await initializeTestEnvironment({
    projectId: 'milest-s2x', firestore: { rules: SO_A_EXPRESSAO, host: '127.0.0.1', port: 8080 }
  });
  await semear(env);
  await env.withSecurityRulesDisabled(async ctx => {
    const d = await getDoc(doc(ctx.firestore(), 'orgs/unimed/projects', 'p3'));
    const v = d.data();
    console.log('\n  p3 no banco: gp=' + JSON.stringify(v.gp)
      + '  gpExtra=' + JSON.stringify(v.gpExtra)
      + '  (tipo: ' + (Array.isArray(v.gpExtra) ? 'array de ' + typeof v.gpExtra[0] : typeof v.gpExtra) + ')');
  });
  await env.cleanup();
};

console.log('');
await provar('A) firestore.rules de verdade', readFileSync('../firestore.rules', 'utf8'), 'milest-s2a');
await provar('B) só a expressão', SO_A_EXPRESSAO, 'milest-s2b');
await provar('C) cadeia daOrg + papel + projeto', A_CADEIA, 'milest-s2c');
await espiar();
console.log('');
