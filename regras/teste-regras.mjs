/* Testa o firestore.rules do MILEST contra o emulador do Firestore.
   Rodar:  cd regras && npm install && npm test
   Nada aqui toca o banco de produção — tudo acontece no emulador local. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'milest-teste',
  firestore: { rules: readFileSync('../firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
});

const conta = email => env.authenticatedContext(email, { email, email_verified: true }).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

const PLATAFORMA = 'gestor@milest.com.br';   // gestor pela marca no índice
const DONA = 'mmc.chuba@gmail.com';          // conta dona: gestora por definição
const ANA = 'ana@unimed.com.br';        // administradora da Unimed
const CAIO = 'caio@unimed.com.br';      // leitor da Unimed
const BRUNO = 'bruno@varejo.com.br';    // gerente do Varejo Norte
const FORA = 'estranho@outra.com';

// ---- estado inicial, gravado sem passar pelas regras ----
await env.clearFirestore();
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', PLATAFORMA), { email: PLATAFORMA, plataforma: true });
  // a conta dona com um cadastro ANTIGO, sem a marca — foi o que quebrou em produção
  await setDoc(doc(db, 'users', DONA), { email: DONA, papel: 'admin', ativo: true });
  await setDoc(doc(db, 'users', ANA), { email: ANA, orgId: 'unimed' });
  await setDoc(doc(db, 'users', CAIO), { email: CAIO, orgId: 'unimed' });
  await setDoc(doc(db, 'users', BRUNO), { email: BRUNO, orgId: 'varejo' });

  await setDoc(doc(db, 'orgs', 'unimed'), { nome: 'Unimed Uberaba', ativo: true, semDono: false });
  await setDoc(doc(db, 'orgs/unimed/members', ANA), { email: ANA, papel: 'admin', ativo: true });
  await setDoc(doc(db, 'orgs/unimed/members', CAIO), { email: CAIO, papel: 'leitor', ativo: true });
  await setDoc(doc(db, 'orgs/unimed/projects', 'p1'), { name: 'Migração OIC' });
  await setDoc(doc(db, 'orgs/unimed/projects/p1/tasks', 't1'), { name: 'Levantamento' });
  await setDoc(doc(db, 'orgs/unimed/resources', 'r1'), { name: 'Ana Prado' });

  await setDoc(doc(db, 'orgs', 'varejo'), { nome: 'Varejo Norte', ativo: true, semDono: false });
  await setDoc(doc(db, 'orgs/varejo/members', BRUNO), { email: BRUNO, papel: 'gerente', ativo: true });
  await setDoc(doc(db, 'orgs/varejo/projects', 'p9'), { name: 'Portal do Cliente' });

  await setDoc(doc(db, 'orgs', 'nova'), { nome: 'Empresa Nova', ativo: true, semDono: true });
  await setDoc(doc(db, 'orgs', 'suspensa'), { nome: 'Empresa Suspensa', ativo: false, semDono: false });
  await setDoc(doc(db, 'orgs/suspensa/members', BRUNO), { email: BRUNO, papel: 'admin', ativo: true });
});

let ok = 0, falhou = 0;
const caso = async (titulo, fn) => {
  try { await fn(); console.log('  ✓ ' + titulo); ok++; }
  catch (e) { console.log('  ✗ ' + titulo + '\n      ' + String(e.message || e).split('\n')[0]); falhou++; }
};

console.log('\nISOLAMENTO ENTRE EMPRESAS');
await caso('Ana lê o projeto da própria empresa', () =>
  assertSucceeds(getDoc(doc(conta(ANA), 'orgs/unimed/projects', 'p1'))));
await caso('Bruno NÃO lê o projeto da Unimed', () =>
  assertFails(getDoc(doc(conta(BRUNO), 'orgs/unimed/projects', 'p1'))));
await caso('Bruno NÃO lista os projetos da Unimed', () =>
  assertFails(getDocs(collection(conta(BRUNO), 'orgs/unimed/projects'))));
await caso('Bruno NÃO lê as atividades da Unimed', () =>
  assertFails(getDoc(doc(conta(BRUNO), 'orgs/unimed/projects/p1/tasks', 't1'))));
await caso('Bruno NÃO lê a equipe da Unimed', () =>
  assertFails(getDoc(doc(conta(BRUNO), 'orgs/unimed/resources', 'r1'))));
await caso('Bruno NÃO grava na Unimed', () =>
  assertFails(setDoc(doc(conta(BRUNO), 'orgs/unimed/projects', 'p2'), { name: 'invasão' })));
await caso('quem não está em empresa nenhuma não lê nada', () =>
  assertFails(getDoc(doc(conta(FORA), 'orgs/unimed/projects', 'p1'))));
await caso('sem login não lê nada', () =>
  assertFails(getDoc(doc(anonimo(), 'orgs/unimed/projects', 'p1'))));

console.log('\nO GESTOR DA PLATAFORMA NÃO VÊ PROJETO');
await caso('plataforma NÃO lê projeto de cliente', () =>
  assertFails(getDoc(doc(conta(PLATAFORMA), 'orgs/unimed/projects', 'p1'))));
await caso('plataforma NÃO lista projetos de cliente', () =>
  assertFails(getDocs(collection(conta(PLATAFORMA), 'orgs/unimed/projects'))));
await caso('plataforma NÃO lê atividades', () =>
  assertFails(getDoc(doc(conta(PLATAFORMA), 'orgs/unimed/projects/p1/tasks', 't1'))));
await caso('plataforma NÃO lê a equipe do cliente', () =>
  assertFails(getDoc(doc(conta(PLATAFORMA), 'orgs/unimed/resources', 'r1'))));
await caso('plataforma NÃO grava projeto', () =>
  assertFails(setDoc(doc(conta(PLATAFORMA), 'orgs/unimed/projects', 'px'), { name: 'x' })));
await caso('plataforma lê o cadastro das empresas (é o painel)', () =>
  assertSucceeds(getDocs(collection(conta(PLATAFORMA), 'orgs'))));
await caso('plataforma cria empresa', () =>
  assertSucceeds(setDoc(doc(conta(PLATAFORMA), 'orgs', 'outra'), { nome: 'Outra', ativo: true, semDono: true })));
await caso('plataforma suspende empresa', () =>
  assertSucceeds(updateDoc(doc(conta(PLATAFORMA), 'orgs', 'varejo'), { ativo: false })));

console.log('\nPROVISIONAMENTO: SEMEIA UMA VEZ E FECHA');
await caso('plataforma cadastra o 1º admin de empresa sem dono', () =>
  assertSucceeds(setDoc(doc(conta(PLATAFORMA), 'orgs/nova/members', 'dono@nova.com'), { email: 'dono@nova.com', papel: 'admin', ativo: true })));
await caso('plataforma NÃO se cadastra na empresa do cliente', () =>
  assertFails(setDoc(doc(conta(PLATAFORMA), 'orgs/nova/members', PLATAFORMA), { email: PLATAFORMA, papel: 'admin', ativo: true })));
await caso('plataforma NÃO cadastra membro em empresa que já tem dono', () =>
  assertFails(setDoc(doc(conta(PLATAFORMA), 'orgs/unimed/members', 'x@unimed.com.br'), { email: 'x@unimed.com.br', papel: 'admin', ativo: true })));
await caso('plataforma fecha a janela (semDono: false)', () =>
  assertSucceeds(updateDoc(doc(conta(PLATAFORMA), 'orgs', 'nova'), { semDono: false })));
await caso('plataforma NÃO consegue REABRIR a janela', () =>
  assertFails(updateDoc(doc(conta(PLATAFORMA), 'orgs', 'nova'), { semDono: true })));

console.log('\nPAPÉIS DENTRO DA EMPRESA');
await caso('gerente grava projeto da própria empresa', () =>
  assertSucceeds(setDoc(doc(conta(BRUNO), 'orgs/varejo/projects', 'p10'), { name: 'novo' })));
await caso('leitor lê', () =>
  assertSucceeds(getDoc(doc(conta(CAIO), 'orgs/unimed/projects', 'p1'))));
await caso('leitor NÃO grava', () =>
  assertFails(setDoc(doc(conta(CAIO), 'orgs/unimed/projects', 'p3'), { name: 'x' })));
await caso('leitor NÃO grava atividade', () =>
  assertFails(setDoc(doc(conta(CAIO), 'orgs/unimed/projects/p1/tasks', 't9'), { name: 'x' })));
await caso('leitor NÃO cadastra usuário', () =>
  assertFails(setDoc(doc(conta(CAIO), 'orgs/unimed/members', 'novo@unimed.com.br'), { papel: 'admin' })));
await caso('gerente NÃO cadastra usuário', () =>
  assertFails(setDoc(doc(conta(BRUNO), 'orgs/varejo/members', 'novo@varejo.com.br'), { papel: 'gerente' })));
await caso('admin da empresa cadastra usuário', () =>
  assertSucceeds(setDoc(doc(conta(ANA), 'orgs/unimed/members', 'novo@unimed.com.br'), { email: 'novo@unimed.com.br', papel: 'gerente', ativo: true })));
await caso('admin da empresa NÃO mexe em outra empresa', () =>
  assertFails(setDoc(doc(conta(ANA), 'orgs/varejo/members', 'x@varejo.com.br'), { papel: 'admin' })));
await caso('admin da empresa NÃO se torna plataforma', () =>
  assertFails(setDoc(doc(conta(ANA), 'users', 'novo@unimed.com.br'), { email: 'novo@unimed.com.br', orgId: 'unimed', plataforma: true })));
await caso('admin da empresa aponta o índice para a própria empresa', () =>
  assertSucceeds(setDoc(doc(conta(ANA), 'users', 'novo@unimed.com.br'), { email: 'novo@unimed.com.br', orgId: 'unimed' })));
await caso('admin da empresa NÃO rouba conta de outra empresa', () =>
  assertFails(setDoc(doc(conta(ANA), 'users', BRUNO), { email: BRUNO, orgId: 'unimed' })));

console.log('\nEMPRESA SUSPENSA');
await caso('membro de empresa suspensa NÃO lê projeto', () =>
  assertFails(getDoc(doc(conta(BRUNO), 'orgs/suspensa/projects', 'qualquer'))));

console.log('\nCONTA DONA SEM A MARCA NO ÍNDICE');
await caso('a conta dona lista empresas mesmo sem plataforma:true gravado', () =>
  assertSucceeds(getDocs(collection(conta(DONA), 'orgs'))));
await caso('a conta dona grava a própria marca (sai do impasse)', () =>
  assertSucceeds(setDoc(doc(conta(DONA), 'users', DONA), { email: DONA, plataforma: true }, { merge: true })));
await caso('a conta dona NÃO lê projeto de cliente', () =>
  assertFails(getDoc(doc(conta(DONA), 'orgs/unimed/projects', 'p1'))));

console.log('\nÍNDICE DE CONTAS');
await caso('cada um lê o próprio índice', () =>
  assertSucceeds(getDoc(doc(conta(ANA), 'users', ANA))));
await caso('ninguém lê o índice alheio', () =>
  assertFails(getDoc(doc(conta(CAIO), 'users', ANA))));
await caso('ninguém lista todas as contas', () =>
  assertFails(getDocs(collection(conta(ANA), 'users'))));

console.log('\n' + ok + ' passaram, ' + falhou + ' falharam.');
await env.cleanup();
process.exit(falhou ? 1 : 0);
