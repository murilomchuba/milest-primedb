/* Testa o firestore.rules do MILEST contra o emulador do Firestore.
   Rodar:  cd regras && npm install && npm test
   Nada aqui toca o banco de produção — tudo acontece no emulador local. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, collectionGroup, query, where, getDocs, serverTimestamp } from 'firebase/firestore';

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
const ELI = 'eli@unimed.com.br';       // analista da Unimed, na equipe do p1
const IGOR = 'igor@unimed.com.br';     // analista da Unimed, fora de toda equipe
const FORA = 'estranho@outra.com';
const DORA = 'dora@teste.com.br';       // administradora de duas empresas de teste
const GI = 'gi@unimed.com.br';          // gerente de projetos da Unimed: titular do p1, substituta no p3
const HELO = 'helo@unimed.com.br';      // gerente de projetos da Unimed: titular do p2 e do p3

const DIA = 86400000;

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
  await setDoc(doc(db, 'orgs/unimed/projects', 'p1'), { name: 'Migração OIC', gp: GI, gpExtra: [] });
  await setDoc(doc(db, 'orgs/unimed/projects/p1/tasks', 't1'), { name: 'Levantamento' });
  await setDoc(doc(db, 'orgs/unimed/resources', 'r1'), { name: 'Ana Prado' });

  // dois analistas: um nomeado no p1, outro sem equipe nenhuma
  await setDoc(doc(db, 'users', ELI), { email: ELI, orgId: 'unimed' });
  await setDoc(doc(db, 'users', IGOR), { email: IGOR, orgId: 'unimed' });
  await setDoc(doc(db, 'orgs/unimed/members', ELI), { email: ELI, papel: 'analista', ativo: true });
  await setDoc(doc(db, 'orgs/unimed/members', IGOR), { email: IGOR, papel: 'analista', ativo: true });
  await setDoc(doc(db, 'orgs/unimed/projects/p1/equipe', ELI),
    { email: ELI, papel: 'analista', recursoId: 'r1', ativo: true, nomeProjeto: 'Migração OIC', cliente: 'Unimed Uberaba' });
  await setDoc(doc(db, 'orgs/unimed/projects/p1/horas', 'hE'),
    { pessoaEmail: ELI, criadoPor: ELI, estado: 'pendente', data: '2026-10-01', h: 8 });
  await setDoc(doc(db, 'orgs/unimed/projects/p1/horas', 'hE2'),
    { pessoaEmail: ELI, criadoPor: ELI, estado: 'pendente', data: '2026-10-02', h: 6 });
  await setDoc(doc(db, 'orgs/unimed/projects/p1/horas', 'hEaceita'),
    { pessoaEmail: ELI, criadoPor: ELI, estado: 'aceito', data: '2026-09-30', h: 8 });
  await setDoc(doc(db, 'orgs/unimed/projects/p1/horas', 'hA'),
    { pessoaEmail: ANA, criadoPor: ANA, estado: 'aceito', data: '2026-10-01', h: 4 });
  // um segundo projeto da mesma empresa, em que o analista NÃO está
  await setDoc(doc(db, 'orgs/unimed/projects', 'p2'), { name: 'Projeto alheio', gp: HELO, gpExtra: [] });
  await setDoc(doc(db, 'orgs/unimed/projects/p2/tasks', 't2'), { name: 'Outra coisa' });
  await setDoc(doc(db, 'orgs/unimed/projects/p2/horas', 'hH'),
    { pessoaEmail: HELO, criadoPor: HELO, estado: 'aceito', data: '2026-10-01', h: 3 });
  // um terceiro projeto, do Helo, em que a Gi é SUBSTITUTA — é o caso das férias
  await setDoc(doc(db, 'orgs/unimed/projects', 'p3'), { name: 'Projeto com substituta', gp: HELO, gpExtra: [GI] });
  await setDoc(doc(db, 'orgs/unimed/projects/p3/tasks', 't3'), { name: 'Alguma coisa' });
  // um projeto sem dono nenhum: só quem vê a carteira inteira o alcança
  await setDoc(doc(db, 'orgs/unimed/projects', 'p4'), { name: 'Ainda não distribuído', gp: '', gpExtra: [] });
  await setDoc(doc(db, 'users', GI), { email: GI, orgId: 'unimed' });
  await setDoc(doc(db, 'users', HELO), { email: HELO, orgId: 'unimed' });
  await setDoc(doc(db, 'orgs/unimed/members', GI), { email: GI, papel: 'gp', ativo: true });
  await setDoc(doc(db, 'orgs/unimed/members', HELO), { email: HELO, papel: 'gp', ativo: true });
  // a mesma pessoa como gerente numa empresa de prazo vencido
  await setDoc(doc(db, 'orgs/vencida/members', GI), { email: GI, papel: 'gp', ativo: true });
  // um analista na empresa de prazo vencido
  await setDoc(doc(db, 'orgs/vencida/members', ELI), { email: ELI, papel: 'analista', ativo: true });
  await setDoc(doc(db, 'orgs/vencida/projects/v1/equipe', ELI),
    { email: ELI, papel: 'analista', recursoId: '', ativo: true, nomeProjeto: 'Piloto' });

  await setDoc(doc(db, 'orgs', 'varejo'), { nome: 'Varejo Norte', ativo: true, semDono: false });
  await setDoc(doc(db, 'orgs/varejo/members', BRUNO), { email: BRUNO, papel: 'gerente', ativo: true });
  await setDoc(doc(db, 'orgs/varejo/projects', 'p9'), { name: 'Portal do Cliente' });

  await setDoc(doc(db, 'orgs', 'nova'), { nome: 'Empresa Nova', ativo: true, semDono: true });
  // uma segunda empresa sem dono, só para o teste de exclusão: a 'nova' tem a
  // janela fechada no meio do caminho e não serve mais para isso
  await setDoc(doc(db, 'orgs', 'nasceumorta'), { nome: 'Cadastro Abandonado', ativo: true, semDono: true });
  await setDoc(doc(db, 'orgs', 'suspensa'), { nome: 'Empresa Suspensa', ativo: false, semDono: false });
  await setDoc(doc(db, 'orgs/suspensa/members', BRUNO), { email: BRUNO, papel: 'admin', ativo: true });

  // prazo de acesso: uma vencida ontem, outra com uma semana pela frente
  await setDoc(doc(db, 'users', DORA), { email: DORA, orgId: 'vencida' });
  await setDoc(doc(db, 'orgs', 'vencida'), { nome: 'Teste Vencido', ativo: true, semDono: false, expiraEm: Date.now() - DIA });
  await setDoc(doc(db, 'orgs/vencida/members', DORA), { email: DORA, papel: 'admin', ativo: true });
  await setDoc(doc(db, 'orgs/vencida/projects', 'v1'), { name: 'Piloto', gp: GI, gpExtra: [] });
  await setDoc(doc(db, 'orgs', 'noprazo'), { nome: 'Teste Corrente', ativo: true, semDono: false, expiraEm: Date.now() + 7 * DIA });
  await setDoc(doc(db, 'orgs/noprazo/members', DORA), { email: DORA, papel: 'admin', ativo: true });
  await setDoc(doc(db, 'orgs/noprazo/projects', 'n1'), { name: 'Piloto' });
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
// Suspende a empresa descartável criada na linha de cima, não a Varejo: o
// Bruno é da Varejo e aparece em mais quinze casos adiante. Um teste que
// estraga o cenário dos próximos mente duas vezes — passa aqui e reprova lá.
await caso('plataforma suspende empresa', () =>
  assertSucceeds(updateDoc(doc(conta(PLATAFORMA), 'orgs', 'outra'), { ativo: false })));

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

console.log('\nAPONTAMENTO DE HORAS');
/* Os lançamentos passaram a ser documentos em projects/{pid}/horas. Hoje quem
   grava é quem já gravava o projeto — a regra curinga de projects cobre a
   coleção nova sem nenhuma linha a mais. Estes casos fixam esse contrato:
   quando o papel de analista entrar, é exatamente aqui que a conta muda, e a
   mudança tem de aparecer como teste quebrado, não como surpresa. */
const hora = (quem, h) => ({ data: '2026-10-01', pessoa: 'Ana Prado', pessoaEmail: quem, recursoId: '', tid: '', h: h, obs: '', estado: 'aceito', criadoEm: Date.now(), criadoPor: quem });
await caso('admin da empresa lança hora no projeto da empresa', () =>
  assertSucceeds(setDoc(doc(conta(ANA), 'orgs/unimed/projects/p1/horas', 'h1'), hora(ANA, 8))));
await caso('gerente lança hora no projeto da empresa', () =>
  assertSucceeds(setDoc(doc(conta(BRUNO), 'orgs/varejo/projects/p9/horas', 'h1'), hora(BRUNO, 4))));
await caso('leitor lê as horas', () =>
  assertSucceeds(getDoc(doc(conta(CAIO), 'orgs/unimed/projects/p1/horas', 'h1'))));
await caso('leitor NÃO lança hora', () =>
  assertFails(setDoc(doc(conta(CAIO), 'orgs/unimed/projects/p1/horas', 'h2'), hora(CAIO, 8))));
await caso('leitor NÃO apaga hora', () =>
  assertFails(deleteDoc(doc(conta(CAIO), 'orgs/unimed/projects/p1/horas', 'h1'))));
await caso('outra empresa NÃO lê as horas', () =>
  assertFails(getDoc(doc(conta(BRUNO), 'orgs/unimed/projects/p1/horas', 'h1'))));
await caso('outra empresa NÃO lança hora', () =>
  assertFails(setDoc(doc(conta(BRUNO), 'orgs/unimed/projects/p1/horas', 'h3'), hora(BRUNO, 8))));
await caso('quem não entrou NÃO lê as horas', () =>
  assertFails(getDoc(doc(anonimo(), 'orgs/unimed/projects/p1/horas', 'h1'))));
await caso('a plataforma NÃO lê as horas do cliente', () =>
  assertFails(getDoc(doc(conta(PLATAFORMA), 'orgs/unimed/projects/p1/horas', 'h1'))));
await caso('prazo vencido: NÃO lança hora', () =>
  assertFails(setDoc(doc(conta(DORA), 'orgs/vencida/projects/v1/horas', 'h1'), hora(DORA, 8))));
await caso('admin apaga a própria hora lançada', () =>
  assertSucceeds(deleteDoc(doc(conta(ANA), 'orgs/unimed/projects/p1/horas', 'h1'))));

console.log('\nO ANALISTA PERTENCE À EMPRESA, MAS NÃO ENXERGA A EMPRESA');
/* É a única mudança do sistema em que um erro não incomoda: vaza. Até aqui
   pertencer e enxergar eram a mesma coisa — todo membro lia tudo. O analista
   separa as duas, e estes casos são o lugar onde essa separação é verificada
   antes de qualquer tela existir. */
const horaDe = (quem, h, estado) => ({ data: '2026-10-05', pessoa: 'Fulano', pessoaEmail: quem, criadoPor: quem, recursoId: '', tid: '', h: h, obs: '', estado: estado || 'pendente', criadoEm: Date.now() });

await caso('analista lê o PRÓPRIO cadastro de membro', () =>
  assertSucceeds(getDoc(doc(conta(ELI), 'orgs/unimed/members', ELI))));
await caso('analista NÃO lê o cadastro de outro membro', () =>
  assertFails(getDoc(doc(conta(ELI), 'orgs/unimed/members', ANA))));
await caso('analista NÃO lista os membros da empresa', () =>
  assertFails(getDocs(collection(conta(ELI), 'orgs/unimed/members'))));
await caso('analista NÃO lê o projeto em que trabalha', () =>
  assertFails(getDoc(doc(conta(ELI), 'orgs/unimed/projects', 'p1'))));
await caso('analista NÃO lista a carteira', () =>
  assertFails(getDocs(collection(conta(ELI), 'orgs/unimed/projects'))));
await caso('analista NÃO lê os recursos (é onde mora o valor/hora)', () =>
  assertFails(getDoc(doc(conta(ELI), 'orgs/unimed/resources', 'r1'))));
await caso('analista NÃO lê o diário do projeto', () =>
  assertFails(getDocs(collection(conta(ELI), 'orgs/unimed/projects/p1/diario'))));

await caso('analista lê a PRÓPRIA nomeação na equipe', () =>
  assertSucceeds(getDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/equipe', ELI))));
await caso('analista NÃO lê a nomeação de outro', () =>
  assertFails(getDoc(doc(conta(IGOR), 'orgs/unimed/projects/p1/equipe', ELI))));
await caso('analista NÃO se nomeia na equipe', () =>
  assertFails(setDoc(doc(conta(IGOR), 'orgs/unimed/projects/p1/equipe', IGOR), { email: IGOR, papel: 'analista', ativo: true })));
await caso('gerente nomeia analista na equipe', () =>
  assertSucceeds(setDoc(doc(conta(ANA), 'orgs/unimed/projects/p2/equipe', IGOR), { email: IGOR, papel: 'analista', recursoId: '', ativo: true, nomeProjeto: 'Projeto alheio' })));

await caso('analista lê as atividades do projeto em que está na equipe', () =>
  assertSucceeds(getDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/tasks', 't1'))));
await caso('analista NÃO lê as atividades de projeto em que não está', () =>
  assertFails(getDoc(doc(conta(ELI), 'orgs/unimed/projects/p2/tasks', 't2'))));
await caso('analista NÃO grava atividade', () =>
  assertFails(setDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/tasks', 't9'), { name: 'minha' })));

await caso('analista lê a PRÓPRIA hora', () =>
  assertSucceeds(getDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'hE'))));
await caso('analista NÃO lê a hora de outra pessoa', () =>
  assertFails(getDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'hA'))));
await caso('analista NÃO lista as horas do projeto', () =>
  assertFails(getDocs(collection(conta(ELI), 'orgs/unimed/projects/p1/horas'))));
await caso('analista lista as horas filtrando por si', () =>
  assertSucceeds(getDocs(query(collection(conta(ELI), 'orgs/unimed/projects/p1/horas'), where('pessoaEmail', '==', ELI)))));
await caso('analista NÃO lista filtrando pelo nome de outro', () =>
  assertFails(getDocs(query(collection(conta(ELI), 'orgs/unimed/projects/p1/horas'), where('pessoaEmail', '==', ANA)))));
await caso('gerente lista as horas do projeto inteiro', () =>
  assertSucceeds(getDocs(collection(conta(ANA), 'orgs/unimed/projects/p1/horas'))));

await caso('analista lança a própria hora, pendente', () =>
  assertSucceeds(setDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'nova1'), horaDe(ELI, 8))));
await caso('analista NÃO lança a hora já aceita', () =>
  assertFails(setDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'nova2'), horaDe(ELI, 8, 'aceito'))));
await caso('analista NÃO lança em nome de outro', () =>
  assertFails(setDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'nova3'), horaDe(ANA, 8))));
await caso('analista NÃO lança assinando com o e-mail de outro', () =>
  assertFails(setDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'nova4'),
    Object.assign(horaDe(ELI, 8), { criadoPor: ANA }))));
await caso('analista NÃO lança em projeto em que não está na equipe', () =>
  assertFails(setDoc(doc(conta(ELI), 'orgs/unimed/projects/p2/horas', 'nova5'), horaDe(ELI, 8))));
await caso('analista sem equipe nenhuma NÃO lança', () =>
  assertFails(setDoc(doc(conta(IGOR), 'orgs/unimed/projects/p1/horas', 'nova6'), horaDe(IGOR, 8))));
await caso('analista NÃO lança zero hora', () =>
  assertFails(setDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'nova7'), horaDe(ELI, 0))));
await caso('analista NÃO lança mais de 24 h num dia', () =>
  assertFails(setDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'nova8'), horaDe(ELI, 25))));
await caso('analista NÃO lança hora em texto', () =>
  assertFails(setDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'nova9'),
    Object.assign(horaDe(ELI, 8), { h: '8' }))));

await caso('analista corrige a própria hora pendente', () =>
  assertSucceeds(updateDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'hE'), { h: 7, obs: 'corrigi' })));
await caso('analista NÃO aceita a própria hora', () =>
  assertFails(updateDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'hE'), { estado: 'aceito' })));
await caso('analista NÃO mexe na hora já aceita', () =>
  assertFails(updateDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'hEaceita'), { h: 99 })));
await caso('analista NÃO mexe na hora de outro', () =>
  assertFails(updateDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'hA'), { h: 99 })));
await caso('analista apaga a própria hora pendente', () =>
  assertSucceeds(deleteDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'hE2'))));
await caso('analista NÃO apaga a hora já aceita', () =>
  assertFails(deleteDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'hEaceita'))));
await caso('analista NÃO apaga a hora de outro', () =>
  assertFails(deleteDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'hA'))));

await caso('o GP aceita a hora do analista', () =>
  assertSucceeds(updateDoc(doc(conta(ANA), 'orgs/unimed/projects/p1/horas', 'hE'), { estado: 'aceito', decididoPor: ANA, decididoEm: Date.now() })));
await caso('depois de aceita, o analista não a corrige mais', () =>
  assertFails(updateDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'hE'), { h: 1 })));

await caso('analista de uma empresa NÃO alcança outra', () =>
  assertFails(setDoc(doc(conta(ELI), 'orgs/varejo/projects/p9/horas', 'x'), horaDe(ELI, 8))));
await caso('prazo vencido: nem o analista lança', () =>
  assertFails(setDoc(doc(conta(ELI), 'orgs/vencida/projects/v1/horas', 'x'), horaDe(ELI, 8))));

await caso('analista desligado da equipe NÃO lança mais', async () => {
  await env.withSecurityRulesDisabled(async ctx =>
    setDoc(doc(ctx.firestore(), 'orgs/unimed/projects/p1/equipe', ELI), { email: ELI, papel: 'analista', ativo: false }));
  await assertFails(setDoc(doc(conta(ELI), 'orgs/unimed/projects/p1/horas', 'depois'), horaDe(ELI, 8)));
  await env.withSecurityRulesDisabled(async ctx =>
    setDoc(doc(ctx.firestore(), 'orgs/unimed/projects/p1/equipe', ELI),
      { email: ELI, papel: 'analista', recursoId: 'r1', ativo: true, nomeProjeto: 'Migração OIC' }));
});

console.log('\nEM QUE PROJETOS EU ESTOU (consulta de grupo)');
await caso('analista encontra as próprias nomeações', () =>
  assertSucceeds(getDocs(query(collectionGroup(conta(ELI), 'equipe'), where('email', '==', ELI)))));
await caso('analista NÃO varre as equipes sem se filtrar', () =>
  assertFails(getDocs(collectionGroup(conta(ELI), 'equipe'))));
await caso('ninguém encontra as nomeações de outro', () =>
  assertFails(getDocs(query(collectionGroup(conta(IGOR), 'equipe'), where('email', '==', ELI)))));

console.log('\nO QUE NÃO PODE TER MUDADO COM O PAPEL NOVO');
await caso('leitor continua lendo o projeto', () =>
  assertSucceeds(getDoc(doc(conta(CAIO), 'orgs/unimed/projects', 'p1'))));
await caso('leitor continua lendo os recursos', () =>
  assertSucceeds(getDoc(doc(conta(CAIO), 'orgs/unimed/resources', 'r1'))));
await caso('leitor continua listando a carteira', () =>
  assertSucceeds(getDocs(collection(conta(CAIO), 'orgs/unimed/projects'))));
await caso('gerente continua gravando hora direto como aceita', () =>
  assertSucceeds(setDoc(doc(conta(ANA), 'orgs/unimed/projects/p1/horas', 'doGP'), horaDe(ANA, 8, 'aceito'))));

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

console.log('\nPRAZO DE ACESSO');
await caso('prazo vencido: continua LENDO o próprio projeto', () =>
  assertSucceeds(getDoc(doc(conta(DORA), 'orgs/vencida/projects', 'v1'))));
await caso('prazo vencido: NÃO grava projeto', () =>
  assertFails(setDoc(doc(conta(DORA), 'orgs/vencida/projects', 'v2'), { name: 'depois do prazo' })));
await caso('prazo vencido: NÃO grava atividade', () =>
  assertFails(setDoc(doc(conta(DORA), 'orgs/vencida/projects/v1/tasks', 'x'), { name: 'x' })));
await caso('prazo vencido: NÃO cadastra usuário', () =>
  assertFails(setDoc(doc(conta(DORA), 'orgs/vencida/members', FORA), { email: FORA, papel: 'leitor', ativo: true })));
await caso('prazo vencido: a empresa NÃO estica o próprio prazo', () =>
  assertFails(updateDoc(doc(conta(DORA), 'orgs', 'vencida'), { expiraEm: Date.now() + 30 * DIA })));
await caso('dentro do prazo: grava normalmente', () =>
  assertSucceeds(setDoc(doc(conta(DORA), 'orgs/noprazo/projects', 'n2'), { name: 'dentro do prazo' })));
/* Grava num projeto NOVO, nao no p3. `setDoc` sem merge troca o documento
   inteiro: escrevendo aqui no p3 ele perdia `gp` e `gpExtra`, e os casos do
   gerente de projetos, 200 linhas abaixo, liam um projeto sem dono e eram
   recusados. A regra estava certa o tempo todo — quem apagava o cenario era
   este caso. E a mesma armadilha que o comentario logo abaixo descreve para
   o prazo da empresa 'vencida'. */
await caso('sem campo de prazo: grava normalmente', () =>
  assertSucceeds(setDoc(doc(conta(ANA), 'orgs/unimed/projects', 'pPrazo'), { name: 'sem prazo' })));
// Mexe no prazo da 'noprazo', não da 'vencida': a 'vencida' é o único cenário
// de prazo estourado da suíte, e prorrogá-la aqui apaga o cenário de todos os
// casos seguintes que dependem dele.
await caso('a plataforma define o prazo de uma empresa', () =>
  assertSucceeds(updateDoc(doc(conta(PLATAFORMA), 'orgs', 'noprazo'), { expiraEm: Date.now() + 15 * DIA })));

console.log('\nSENHA PROVISÓRIA');
await caso('a pessoa desliga a própria marca de senha provisória', () =>
  assertSucceeds(setDoc(doc(conta(CAIO), 'orgs/unimed/members', CAIO), { senhaProvisoria: false }, { merge: true })));
await caso('a pessoa NÃO se marca como provisória', () =>
  assertFails(setDoc(doc(conta(CAIO), 'orgs/unimed/members', CAIO), { senhaProvisoria: true }, { merge: true })));
await caso('ninguém mexe na marca de outra pessoa', () =>
  assertFails(setDoc(doc(conta(CAIO), 'orgs/unimed/members', ANA), { senhaProvisoria: false }, { merge: true })));

console.log('\nESCALADA DE PRIVILÉGIO DENTRO DA EMPRESA');
// O leitor é o perfil mais perigoso: tem sessão válida e motivo para tentar.
await caso('leitor NÃO se promove a admin', () =>
  assertFails(updateDoc(doc(conta(CAIO), 'orgs/unimed/members', CAIO), { papel: 'admin' })));
await caso('leitor NÃO se promove a gerente', () =>
  assertFails(updateDoc(doc(conta(CAIO), 'orgs/unimed/members', CAIO), { papel: 'gerente' })));
await caso('leitor NÃO rebaixa a administradora', () =>
  assertFails(updateDoc(doc(conta(CAIO), 'orgs/unimed/members', ANA), { papel: 'leitor' })));
await caso('leitor NÃO apaga o próprio cadastro de membro', () =>
  assertFails(deleteDoc(doc(conta(CAIO), 'orgs/unimed/members', CAIO))));
await caso('leitor NÃO se cadastra em empresa alheia', () =>
  assertFails(setDoc(doc(conta(CAIO), 'orgs/varejo/members', CAIO), { email: CAIO, papel: 'admin', ativo: true })));
await caso('membro desativado NÃO se reativa', async () => {
  await env.withSecurityRulesDisabled(async ctx =>
    setDoc(doc(ctx.firestore(), 'orgs/unimed/members', CAIO), { email: CAIO, papel: 'leitor', ativo: false }));
  await assertFails(updateDoc(doc(conta(CAIO), 'orgs/unimed/members', CAIO), { ativo: true }));
  await env.withSecurityRulesDisabled(async ctx =>
    setDoc(doc(ctx.firestore(), 'orgs/unimed/members', CAIO), { email: CAIO, papel: 'leitor', ativo: true }));
});

console.log('\nE-MAIL NÃO VERIFICADO');
// logado() exige email_verified: quem não confirmou o e-mail não existe para as regras.
const naoVerificado = email => env.authenticatedContext(email, { email, email_verified: false }).firestore();
await caso('e-mail não verificado NÃO lê projeto, mesmo sendo membro', () =>
  assertFails(getDoc(doc(naoVerificado(ANA), 'orgs/unimed/projects', 'p1'))));
await caso('e-mail não verificado NÃO grava', () =>
  assertFails(setDoc(doc(naoVerificado(ANA), 'orgs/unimed/projects', 'pX'), { name: 'x' })));
await caso('e-mail não verificado NÃO lê o próprio índice', () =>
  assertFails(getDoc(doc(naoVerificado(ANA), 'users', ANA))));

console.log('\nCADASTRO DA EMPRESA: O QUE O ADMIN NÃO PODE MEXER');
// A fronteira comercial: o cliente administra a própria empresa, não o contrato.
await caso('admin NÃO reativa a própria empresa suspensa', () =>
  assertFails(updateDoc(doc(conta(BRUNO), 'orgs', 'suspensa'), { ativo: true })));
await caso('admin NÃO marca a própria empresa como sem dono', () =>
  assertFails(updateDoc(doc(conta(ANA), 'orgs', 'unimed'), { semDono: true })));
await caso('admin NÃO marca a própria empresa como própria do operador', () =>
  assertFails(updateDoc(doc(conta(ANA), 'orgs', 'unimed'), { propria: true })));
await caso('admin NÃO apaga a própria empresa', () =>
  assertFails(deleteDoc(doc(conta(ANA), 'orgs', 'unimed'))));
/* O arranjo da folha de status é da EMPRESA, e o cadastro da empresa é o
   documento mais protegido do sistema: a regra lista campo a campo o que o
   administrador pode escrever. Sem a linha, a tela de montar a folha salva no
   vazio e o banco recusa sem ninguém entender por quê. */
await caso('admin grava o arranjo da folha de status', () =>
  assertSucceeds(updateDoc(doc(conta(ANA), 'orgs', 'unimed'),
    { folhaLayout: { v: 1, blocos: [{ tipo: 'indicadores', c: 0, r: 0, w: 6, h: 1 }] }, atualizadoEm: Date.now() })));
await caso('gerente de projetos NÃO grava o arranjo da folha', () =>
  assertFails(updateDoc(doc(conta(HELO), 'orgs', 'unimed'),
    { folhaLayout: { v: 1, blocos: [] }, atualizadoEm: Date.now() })));
await caso('admin liga o resumo semanal da carteira', () =>
  assertSucceeds(updateDoc(doc(conta(ANA), 'orgs', 'unimed'),
    { resumoSemanal: { ativo: true, para: ['gestor@unimed.com.br'] }, atualizadoEm: Date.now() })));
await caso('leitor NÃO liga o resumo semanal', () =>
  assertFails(updateDoc(doc(conta(CAIO), 'orgs', 'unimed'),
    { resumoSemanal: { ativo: true, para: ['x@y.com'] }, atualizadoEm: Date.now() })));

console.log('\nÍNDICE DE CONTAS: OCUPAÇÃO DE E-MAIL');
// Falha conhecida, de baixa gravidade: um admin aponta para a própria empresa
// o índice de um e-mail que ainda não entrou no sistema, e o admin legítimo
// daquela pessoa não consegue corrigir depois. Não vaza dado — atrapalha a entrada.
await caso('[FALHA CONHECIDA] admin ocupa o índice de um e-mail de fora', () =>
  assertSucceeds(setDoc(doc(conta(ANA), 'users', 'futuro@varejo.com.br'), { email: 'futuro@varejo.com.br', orgId: 'unimed' })));
await caso('[FALHA CONHECIDA] o admin legítimo NÃO consegue desfazer a ocupação', () =>
  assertFails(setDoc(doc(conta(BRUNO), 'users', 'futuro@varejo.com.br'), { email: 'futuro@varejo.com.br', orgId: 'varejo' })));

console.log('\nAPAGAR E RECRIAR A EMPRESA (achado 3 — fechado)');
/* Apagar um documento no Firestore NÃO apaga as subcoleções. Antes, quem
   operava a plataforma podia apagar orgs/{cliente}, recriar com semDono:true,
   cadastrar um cúmplice como admin e ler os projetos que ficaram. Agora o
   navegador só apaga empresa que nunca teve dono; cliente de verdade sai pela
   função excluirEmpresa, que apaga tudo no servidor. */
await caso('plataforma NÃO apaga o cadastro de um cliente com dono', () =>
  assertFails(deleteDoc(doc(conta(PLATAFORMA), 'orgs', 'unimed'))));
await caso('plataforma NÃO recria por cima de uma empresa existente', () =>
  assertFails(setDoc(doc(conta(PLATAFORMA), 'orgs', 'unimed'), { nome: 'Unimed Uberaba', ativo: true, semDono: true })));
await caso('... nem cadastra um cúmplice como admin', () =>
  assertFails(setDoc(doc(conta(PLATAFORMA), 'orgs/unimed/members', FORA), { email: FORA, papel: 'admin', ativo: true })));
await caso('... e o cúmplice NÃO lê o projeto', () =>
  assertFails(getDoc(doc(conta(FORA), 'orgs/unimed/projects', 'p1'))));
await caso('plataforma apaga empresa que nunca teve dono', () =>
  assertSucceeds(deleteDoc(doc(conta(PLATAFORMA), 'orgs', 'nasceumorta'))));

console.log('\nMODO SUPORTE');
const AGORA = Date.now();
await caso('sem liberação, plataforma NÃO lê projeto do cliente', () =>
  assertFails(getDoc(doc(conta(PLATAFORMA), 'orgs/unimed/projects', 'p1'))));
await caso('plataforma NÃO se libera sozinha', () =>
  assertFails(setDoc(doc(conta(PLATAFORMA), 'orgs/unimed/suporte', 'acesso'), { ate: AGORA + DIA, modo: 'edicao', por: PLATAFORMA })));
await caso('leitor NÃO libera o suporte', () =>
  assertFails(setDoc(doc(conta(CAIO), 'orgs/unimed/suporte', 'acesso'), { ate: AGORA + DIA, modo: 'leitura', por: CAIO })));
await caso('admin NÃO libera por mais de 7 dias', () =>
  assertFails(setDoc(doc(conta(ANA), 'orgs/unimed/suporte', 'acesso'), { ate: AGORA + 8 * DIA, modo: 'leitura', por: ANA })));
await caso('admin NÃO libera em nome de outra pessoa', () =>
  assertFails(setDoc(doc(conta(ANA), 'orgs/unimed/suporte', 'acesso'), { ate: AGORA + DIA, modo: 'leitura', por: CAIO })));
await caso('admin de OUTRA empresa NÃO libera a Unimed', () =>
  assertFails(setDoc(doc(conta(BRUNO), 'orgs/unimed/suporte', 'acesso'), { ate: AGORA + DIA, modo: 'leitura', por: BRUNO })));
await caso('admin libera leitura por 1 dia', () =>
  assertSucceeds(setDoc(doc(conta(ANA), 'orgs/unimed/suporte', 'acesso'), { ate: AGORA + DIA, modo: 'leitura', por: ANA })));
await caso('com leitura liberada, plataforma lê projeto, tarefa e recurso', async () => {
  await assertSucceeds(getDoc(doc(conta(PLATAFORMA), 'orgs/unimed/projects', 'p1')));
  await assertSucceeds(getDoc(doc(conta(PLATAFORMA), 'orgs/unimed/projects/p1/tasks', 't1')));
  await assertSucceeds(getDocs(collection(conta(PLATAFORMA), 'orgs/unimed/projects')));
  await assertSucceeds(getDoc(doc(conta(PLATAFORMA), 'orgs/unimed/resources', 'r1')));
});
await caso('com leitura liberada, plataforma NÃO grava', () =>
  assertFails(setDoc(doc(conta(PLATAFORMA), 'orgs/unimed/projects', 'p1'), { name: 'mexido' })));
await caso('liberação da Unimed NÃO abre o Varejo', () =>
  assertFails(getDoc(doc(conta(PLATAFORMA), 'orgs/varejo/projects', 'p9'))));
await caso('liberação NÃO vale para quem não é plataforma', () =>
  assertFails(getDoc(doc(conta(FORA), 'orgs/unimed/projects', 'p1'))));
await caso('plataforma registra a entrada no histórico', () =>
  assertSucceeds(setDoc(doc(conta(PLATAFORMA), 'orgs/unimed/suporteLog', 'l1'), { tipo: 'entrada', por: PLATAFORMA, em: AGORA })));
await caso('ninguém apaga o histórico, nem o admin', async () => {
  await assertFails(deleteDoc(doc(conta(PLATAFORMA), 'orgs/unimed/suporteLog', 'l1')));
  await assertFails(deleteDoc(doc(conta(ANA), 'orgs/unimed/suporteLog', 'l1')));
});
await caso('cliente lê o histórico', () =>
  assertSucceeds(getDocs(collection(conta(CAIO), 'orgs/unimed/suporteLog'))));
await caso('admin troca para edição e a plataforma grava', async () => {
  await assertSucceeds(setDoc(doc(conta(ANA), 'orgs/unimed/suporte', 'acesso'), { ate: AGORA + DIA, modo: 'edicao', por: ANA }));
  await assertSucceeds(setDoc(doc(conta(PLATAFORMA), 'orgs/unimed/projects/p1/tasks', 't1'), { name: 'Levantamento (ajustado)' }));
});
await caso('prazo vencido: plataforma volta a NÃO ler', async () => {
  await env.withSecurityRulesDisabled(async ctx =>
    setDoc(doc(ctx.firestore(), 'orgs/unimed/suporte', 'acesso'), { ate: AGORA - 1000, modo: 'edicao', por: ANA }));
  await assertFails(getDoc(doc(conta(PLATAFORMA), 'orgs/unimed/projects', 'p1')));
  await assertFails(setDoc(doc(conta(PLATAFORMA), 'orgs/unimed/suporteLog', 'l2'), { tipo: 'entrada', por: PLATAFORMA, em: AGORA }));
});
await caso('admin encerra a liberação', () =>
  assertSucceeds(deleteDoc(doc(conta(ANA), 'orgs/unimed/suporte', 'acesso'))));

console.log('\nPESQUISA DE SATISFAÇÃO');
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'orgs/varejo/pesquisas', 'codigoSecreto1'), { projetoId: 'p9', perguntas: [], respondidaEm: null, respostas: null, expiraEm: Date.now() + DIA });
  await setDoc(doc(db, 'orgs/varejo/pesquisas', 'codigoVencido'), { projetoId: 'p9', perguntas: [], respondidaEm: null, respostas: null, expiraEm: Date.now() - 1000 });
});
await caso('quem tem o link lê a pesquisa sem login', () =>
  assertSucceeds(getDoc(doc(anonimo(), 'orgs/varejo/pesquisas', 'codigoSecreto1'))));
await caso('sem login NÃO lista as pesquisas da empresa', () =>
  assertFails(getDocs(collection(anonimo(), 'orgs/varejo/pesquisas'))));
await caso('membro de outra empresa NÃO lista', () =>
  assertFails(getDocs(collection(conta(ANA), 'orgs/varejo/pesquisas'))));
await caso('membro da empresa lista as respostas', () =>
  assertSucceeds(getDocs(collection(conta(BRUNO), 'orgs/varejo/pesquisas'))));
await caso('ninguém cria pesquisa pelo navegador', () =>
  assertFails(setDoc(doc(conta(BRUNO), 'orgs/varejo/pesquisas', 'nova'), { respondidaEm: null, expiraEm: Date.now() + DIA })));
await caso('resposta NÃO mexe em outro campo', () =>
  assertFails(updateDoc(doc(anonimo(), 'orgs/varejo/pesquisas', 'codigoSecreto1'), { respostas: { q1: 9 }, respondidaEm: serverTimestamp(), projetoId: 'outro' })));
await caso('quem tem o link responde sem login', () =>
  assertSucceeds(updateDoc(doc(anonimo(), 'orgs/varejo/pesquisas', 'codigoSecreto1'), { respostas: { q1: 9, q2: 'Ótimo' }, respondidaEm: serverTimestamp() })));
await caso('NÃO responde duas vezes', () =>
  assertFails(updateDoc(doc(anonimo(), 'orgs/varejo/pesquisas', 'codigoSecreto1'), { respostas: { q1: 0 }, respondidaEm: serverTimestamp() })));
await caso('NÃO responde pesquisa vencida', () =>
  assertFails(updateDoc(doc(anonimo(), 'orgs/varejo/pesquisas', 'codigoVencido'), { respostas: { q1: 9 }, respondidaEm: serverTimestamp() })));

console.log('\nÍNDICE DO ENVIO AGENDADO');
// Esta coleção fica FORA da árvore da empresa para o servidor poder perguntar
// "o que vence nesta hora?" numa busca só. Por isso ela é o ponto onde o
// isolamento depende da regra, e não da estrutura: é aqui que se confere.
const agenda = (org, pid, extra) => Object.assign({ orgId: org, pid: pid, ativo: true, proximo: Date.now() + DIA }, extra || {});
await caso('Ana programa o envio do projeto da própria empresa', () =>
  assertSucceeds(setDoc(doc(conta(ANA), 'agendasStatus', 'unimed__p1'), agenda('unimed', 'p1'))));
await caso('Ana lê a agenda que criou', () =>
  assertSucceeds(getDoc(doc(conta(ANA), 'agendasStatus', 'unimed__p1'))));
await caso('Bruno NÃO lê a agenda da Unimed', () =>
  assertFails(getDoc(doc(conta(BRUNO), 'agendasStatus', 'unimed__p1'))));
await caso('Bruno NÃO grava agenda apontando para a Unimed', () =>
  assertFails(setDoc(doc(conta(BRUNO), 'agendasStatus', 'unimed__p1'), agenda('unimed', 'p1'))));
await caso('o id tem de casar com a empresa do documento', () =>
  assertFails(setDoc(doc(conta(ANA), 'agendasStatus', 'varejo__p9'), agenda('unimed', 'p1'))));
await caso('o id tem de casar com o projeto do documento', () =>
  assertFails(setDoc(doc(conta(ANA), 'agendasStatus', 'unimed__p1'), agenda('unimed', 'p2'))));
await caso('ninguém muda a empresa de uma agenda existente', () =>
  assertFails(updateDoc(doc(conta(ANA), 'agendasStatus', 'unimed__p1'), { orgId: 'varejo' })));
await caso('leitor NÃO programa envio', () =>
  assertFails(setDoc(doc(conta(CAIO), 'agendasStatus', 'unimed__p2'), agenda('unimed', 'p2'))));
await caso('leitor lê a agenda da própria empresa', () =>
  assertSucceeds(getDoc(doc(conta(CAIO), 'agendasStatus', 'unimed__p1'))));
await caso('empresa com prazo vencido NÃO programa envio', () =>
  assertFails(setDoc(doc(conta(DORA), 'agendasStatus', 'vencida__v1'), agenda('vencida', 'v1'))));
await caso('empresa no prazo programa envio', () =>
  assertSucceeds(setDoc(doc(conta(DORA), 'agendasStatus', 'noprazo__n1'), agenda('noprazo', 'n1'))));
await caso('sem login não lê agenda', () =>
  assertFails(getDoc(doc(anonimo(), 'agendasStatus', 'unimed__p1'))));
await caso('plataforma NÃO lê agenda de cliente', () =>
  assertFails(getDoc(doc(conta(PLATAFORMA), 'agendasStatus', 'unimed__p1'))));
await caso('leitor NÃO apaga agenda', () =>
  assertFails(deleteDoc(doc(conta(CAIO), 'agendasStatus', 'unimed__p1'))));
await caso('quem manda na empresa apaga a agenda', () =>
  assertSucceeds(deleteDoc(doc(conta(ANA), 'agendasStatus', 'unimed__p1'))));

console.log('\nGERENTE DE PROJETOS: VÊ O QUE É DELE');
await caso('Gi lê o projeto de que é titular', () =>
  assertSucceeds(getDoc(doc(conta(GI), 'orgs/unimed/projects', 'p1'))));
await caso('Gi NÃO lê o projeto do outro gerente', () =>
  assertFails(getDoc(doc(conta(GI), 'orgs/unimed/projects', 'p2'))));
await caso('Gi lê o projeto em que é substituta — é o caso das férias', () =>
  assertSucceeds(getDoc(doc(conta(GI), 'orgs/unimed/projects', 'p3'))));
await caso('Gi NÃO lê o projeto que ninguém distribuiu ainda', () =>
  assertFails(getDoc(doc(conta(GI), 'orgs/unimed/projects', 'p4'))));
await caso('Gi lê as atividades do projeto dela', () =>
  assertSucceeds(getDoc(doc(conta(GI), 'orgs/unimed/projects/p1/tasks', 't1'))));
await caso('Gi NÃO lê as atividades do projeto do outro', () =>
  assertFails(getDoc(doc(conta(GI), 'orgs/unimed/projects/p2/tasks', 't2'))));
/* O p3 tinha cronograma no fixture e nenhum caso o lia. A férias de verdade
   não é abrir a capa do projeto: é mexer no cronograma dele. E era justamente
   este caminho o mais caro de todos — subcoleção de projeto em que o gerente
   é substituto lê o documento do projeto ANTES de decidir. */
await caso('Gi lê as atividades do projeto em que é substituta', () =>
  assertSucceeds(getDoc(doc(conta(GI), 'orgs/unimed/projects/p3/tasks', 't3'))));
await caso('Gi NÃO lê as horas do projeto do outro', () =>
  assertFails(getDoc(doc(conta(GI), 'orgs/unimed/projects/p2/horas', 'hH'))));
await caso('Gi lê as horas do projeto dela', () =>
  assertSucceeds(getDoc(doc(conta(GI), 'orgs/unimed/projects/p1/horas', 'hA'))));
await caso('Gi NÃO alcança a outra empresa', () =>
  assertFails(getDoc(doc(conta(GI), 'orgs/varejo/projects', 'p9'))));

console.log('\nGERENTE DE PROJETOS: A CARTEIRA SAI RECORTADA DO BANCO');
await caso('Gi NÃO lista a coleção de projetos sem filtro', () =>
  assertFails(getDocs(collection(conta(GI), 'orgs/unimed/projects'))));
await caso('Gi lista os projetos em que é titular', () =>
  assertSucceeds(getDocs(query(collection(conta(GI), 'orgs/unimed/projects'), where('gp', '==', GI)))));
await caso('Gi lista os projetos em que é substituta', () =>
  assertSucceeds(getDocs(query(collection(conta(GI), 'orgs/unimed/projects'), where('gpExtra', 'array-contains', GI)))));
await caso('Gi NÃO pede a lista do colega pelo filtro dele', () =>
  assertFails(getDocs(query(collection(conta(GI), 'orgs/unimed/projects'), where('gp', '==', HELO)))));
await caso('Helo NÃO pede a lista da Gi pelo filtro dela', () =>
  assertFails(getDocs(query(collection(conta(HELO), 'orgs/unimed/projects'), where('gpExtra', 'array-contains', GI)))));
await caso('quem cuida da carteira inteira lista tudo, como antes', () =>
  assertSucceeds(getDocs(collection(conta(ANA), 'orgs/unimed/projects'))));

console.log('\nGERENTE DE PROJETOS: ESCREVE O DELE, E SÓ');
await caso('Gi grava uma atividade no projeto dela', () =>
  assertSucceeds(setDoc(doc(conta(GI), 'orgs/unimed/projects/p1/tasks', 'tNova'), { name: 'Desenho' })));
await caso('Gi NÃO grava atividade no projeto do outro', () =>
  assertFails(setDoc(doc(conta(GI), 'orgs/unimed/projects/p2/tasks', 'tNova'), { name: 'invasão' })));
await caso('Gi nomeia alguém na equipe do projeto dela', () =>
  assertSucceeds(setDoc(doc(conta(GI), 'orgs/unimed/projects/p1/equipe', IGOR), { email: IGOR, ativo: true })));
await caso('Gi NÃO nomeia ninguém na equipe do projeto do outro', () =>
  assertFails(setDoc(doc(conta(GI), 'orgs/unimed/projects/p2/equipe', IGOR), { email: IGOR, ativo: true })));
await caso('Gi atualiza o cabeçalho do projeto dela', () =>
  assertSucceeds(updateDoc(doc(conta(GI), 'orgs/unimed/projects', 'p1'), { name: 'Migração OIC — fase 2' })));
await caso('Gi NÃO passa o próprio projeto para outro gerente', () =>
  assertFails(updateDoc(doc(conta(GI), 'orgs/unimed/projects', 'p1'), { gp: HELO })));
await caso('Gi NÃO se tira nem se põe como substituta', () =>
  assertFails(updateDoc(doc(conta(GI), 'orgs/unimed/projects', 'p1'), { gpExtra: [HELO] })));
await caso('Gi NÃO cria projeto novo: a carteira é distribuída pelo escritório', () =>
  assertFails(setDoc(doc(conta(GI), 'orgs/unimed/projects', 'pGi'), { name: 'meu projeto', gp: GI, gpExtra: [] })));
await caso('Gi NÃO apaga um projeto, nem o dela', () =>
  assertFails(deleteDoc(doc(conta(GI), 'orgs/unimed/projects', 'p1'))));
/* O curinga das subcoleções já casou o próprio documento do projeto uma vez
   (versão 2 das regras: `{documento=**}` aceita zero segmentos), e foi por ali
   que a troca de responsável passou por baixo da regra que a barrava. Estes
   dois casos ficam para que a subcoleção continue alcançável sem que o
   documento do projeto volte a ser. */
await caso('Gi grava na subcoleção do projeto dela (o retrato do vigia)', () =>
  assertSucceeds(setDoc(doc(conta(GI), 'orgs/unimed/projects/p1/vigia', 'retrato'), { v: 1, real: 40 })));
await caso('Gi NÃO grava na subcoleção do projeto do outro', () =>
  assertFails(setDoc(doc(conta(GI), 'orgs/unimed/projects/p2/vigia', 'retrato'), { v: 1, real: 40 })));

console.log('\nGERENTE DE PROJETOS: O CADASTRO DA EMPRESA NÃO É DELE');
await caso('Gi lê o cadastro de recursos, para alocar quem já existe', () =>
  assertSucceeds(getDoc(doc(conta(GI), 'orgs/unimed/resources', 'r1'))));
await caso('Gi NÃO escreve o cadastro de recursos', () =>
  assertFails(setDoc(doc(conta(GI), 'orgs/unimed/resources', 'r1'), { name: 'outro nome' })));
await caso('Gi lista as contas da empresa, para nomear sem digitar e-mail', () =>
  assertSucceeds(getDocs(collection(conta(GI), 'orgs/unimed/members'))));
await caso('Gi NÃO cadastra conta nova', () =>
  assertFails(setDoc(doc(conta(GI), 'orgs/unimed/members', 'novo@unimed.com.br'), { email: 'novo@unimed.com.br', papel: 'analista', ativo: true })));
await caso('Gi NÃO muda o papel de ninguém, nem o dela', () =>
  assertFails(updateDoc(doc(conta(GI), 'orgs/unimed/members', GI), { papel: 'admin' })));
await caso('Gi lê o cadastro da própria empresa', () =>
  assertSucceeds(getDoc(doc(conta(GI), 'orgs', 'unimed'))));
await caso('Gi NÃO mexe no cadastro da empresa', () =>
  assertFails(updateDoc(doc(conta(GI), 'orgs', 'unimed'), { nome: 'Outro nome' })));

console.log('\nGERENTE DE PROJETOS: PRAZO DA EMPRESA');
await caso('com o prazo vencido, a Gi ainda lê o projeto dela', () =>
  assertSucceeds(getDoc(doc(conta(GI), 'orgs/vencida/projects', 'v1'))));
await caso('mas não escreve nada nele', () =>
  assertFails(setDoc(doc(conta(GI), 'orgs/vencida/projects/v1/tasks', 'tX'), { name: 'não' })));

console.log('\n' + ok + ' passaram, ' + falhou + ' falharam.');
await env.cleanup();
process.exit(falhou ? 1 : 0);
