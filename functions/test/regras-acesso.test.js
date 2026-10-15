const test = require('node:test');
const assert = require('node:assert');
const { decidir, senhaValida } = require('../regras-acesso');

const AGORA = 1_800_000_000_000;
const base = () => ({
  quem: 'ana@cliente.com', alvo: 'bia@cliente.com', modo: 'criar', agora: AGORA,
  idxQuem: { orgId: 'o1' }, idxAlvo: { orgId: 'o1' },
  org: { ativo: true, expiraEm: 0 },
  membroQuem: { papel: 'admin', ativo: true },
  membroAlvo: { papel: 'leitor', senhaProvisoria: true }
});
const ok = p => decidir(p).ok;

test('admin da mesma empresa cria e redefine', () => {
  assert.equal(ok(base()), true);
  assert.equal(ok({ ...base(), modo: 'redefinir', membroAlvo: { papel: 'gerente', ultimoAcesso: 1 } }), true);
});
test('gerente e leitor não podem', () => {
  assert.equal(ok({ ...base(), membroQuem: { papel: 'gerente' } }), false);
  assert.equal(ok({ ...base(), membroQuem: { papel: 'leitor' } }), false);
});
test('admin suspenso, empresa inativa ou vencida não podem', () => {
  assert.equal(ok({ ...base(), membroQuem: { papel: 'admin', ativo: false } }), false);
  assert.equal(ok({ ...base(), org: { ativo: false } }), false);
  assert.equal(ok({ ...base(), org: { expiraEm: AGORA - 1 } }), false);
  assert.equal(ok({ ...base(), org: { expiraEm: AGORA + 1 } }), true);
});
test('admin de outra empresa não pode', () => {
  assert.equal(ok({ ...base(), idxQuem: { orgId: 'o2' }, membroQuem: null }), false);
  // mesmo que exista um doc de membro com o nome dele na empresa do alvo, o índice dele aponta para outra
  assert.equal(ok({ ...base(), idxQuem: { orgId: 'o2' } }), false);
});
test('alvo sem cadastro na empresa é recusado', () => {
  assert.equal(ok({ ...base(), idxAlvo: null }), false);
  assert.equal(ok({ ...base(), membroAlvo: null }), false);
  assert.equal(ok({ ...base(), org: null }), false);
});
test('contas da plataforma e a própria conta ficam de fora', () => {
  assert.equal(ok({ ...base(), idxAlvo: { orgId: 'o1', plataforma: true } }), false);
  assert.equal(ok({ ...base(), alvo: 'mmc.chuba@gmail.com' }), false);
  assert.equal(ok({ ...base(), alvo: 'ANA@cliente.com ' }), false);
});
test('plataforma provisiona só o administrador', () => {
  const plat = { ...base(), quem: 'mmc.chuba@gmail.com', idxQuem: { plataforma: true }, membroQuem: null };
  assert.equal(ok({ ...plat, membroAlvo: { papel: 'admin', senhaProvisoria: true } }), true);
  assert.equal(ok({ ...plat, membroAlvo: { papel: 'gerente', senhaProvisoria: true } }), false);
  const outra = { ...plat, quem: 'op@milest.com.br', idxQuem: { plataforma: true } };
  assert.equal(ok({ ...outra, membroAlvo: { papel: 'admin' } }), true);
});
test('plataforma não refaz a senha de administrador que já usa o sistema', () => {
  const plat = { ...base(), quem: 'mmc.chuba@gmail.com', idxQuem: { plataforma: true }, membroQuem: null, modo: 'redefinir' };
  assert.equal(ok({ ...plat, membroAlvo: { papel: 'admin', senhaProvisoria: true, ultimoAcesso: 5 } }), true);
  assert.equal(ok({ ...plat, membroAlvo: { papel: 'admin' } }), true);                    // nunca entrou
  assert.equal(ok({ ...plat, membroAlvo: { papel: 'admin', senhaProvisoria: false, ultimoAcesso: 5 } }), false);
});
test('pessoa comum, sem papel nenhum, não pode', () => {
  assert.equal(ok({ ...base(), quem: 'x@y.com', idxQuem: null, membroQuem: null }), false);
});
test('entradas inválidas', () => {
  assert.equal(ok({ ...base(), alvo: 'semarroba' }), false);
  assert.equal(ok({ ...base(), modo: 'apagar' }), false);
  assert.equal(senhaValida('12345'), false);
  assert.equal(senhaValida('123456'), true);
  assert.equal(senhaValida(123456), false);
});

const { decidirExclusao } = require('../regras-acesso');
const org = (o) => ({ nome: 'Indústria Aurora', ativo: false, semDono: false, ...o });
const plat = { quem: 'mmc.chuba@gmail.com', idxQuem: { plataforma: true } };
test('exclusão: plataforma exclui empresa suspensa com o nome certo', () => {
  assert.equal(decidirExclusao({ ...plat, org: org(), nomeDigitado: ' indústria aurora ' }).ok, true);
});
test('exclusão: empresa ativa precisa ser suspensa antes', () => {
  assert.equal(decidirExclusao({ ...plat, org: org({ ativo: true }), nomeDigitado: 'Indústria Aurora' }).ok, false);
  assert.equal(decidirExclusao({ ...plat, org: org({ ativo: true, semDono: true }), nomeDigitado: 'Indústria Aurora' }).ok, true);
});
test('exclusão: nome errado, empresa própria ou quem não é plataforma', () => {
  assert.equal(decidirExclusao({ ...plat, org: org(), nomeDigitado: 'Aurora' }).ok, false);
  assert.equal(decidirExclusao({ ...plat, org: org({ propria: true }), nomeDigitado: 'Indústria Aurora' }).ok, false);
  assert.equal(decidirExclusao({ quem: 'ana@c.com', idxQuem: { orgId: 'o1' }, org: org(), nomeDigitado: 'Indústria Aurora' }).ok, false);
  assert.equal(decidirExclusao({ ...plat, org: null, nomeDigitado: 'x' }).ok, false);
});

const { decidirPesquisa } = require('../regras-acesso');
const basePesq = () => ({
  idxQuem: { orgId: 'o1' }, membroQuem: { papel: 'gerente', ativo: true }, org: { ativo: true },
  projeto: { name: 'P' }, destinatarios: [{ nome: 'Cli', email: 'cli@x.com' }],
  perguntas: [{ tipo: 'nps', texto: 'Recomendaria?' }], agora: 1000
});
test('pesquisa: gerente envia', () => { assert.equal(decidirPesquisa(basePesq()).ok, true); });
test('pesquisa: leitor, empresa suspensa ou vencida não enviam', () => {
  assert.equal(decidirPesquisa({ ...basePesq(), membroQuem: { papel: 'leitor' } }).ok, false);
  assert.equal(decidirPesquisa({ ...basePesq(), org: { ativo: false } }).ok, false);
  assert.equal(decidirPesquisa({ ...basePesq(), org: { expiraEm: 500 } }).ok, false);
});
test('pesquisa: destinatários e perguntas validados', () => {
  assert.equal(decidirPesquisa({ ...basePesq(), destinatarios: [] }).ok, false);
  assert.equal(decidirPesquisa({ ...basePesq(), destinatarios: [{ email: 'x' }] }).ok, false);
  assert.equal(decidirPesquisa({ ...basePesq(), destinatarios: Array(51).fill({ email: 'a@b.co' }) }).ok, false);
  assert.equal(decidirPesquisa({ ...basePesq(), perguntas: [] }).ok, false);
  assert.equal(decidirPesquisa({ ...basePesq(), perguntas: [{ tipo: 'outra', texto: 'x' }] }).ok, false);
  assert.equal(decidirPesquisa({ ...basePesq(), projeto: null }).ok, false);
});

/* ---- enviarStatus ----
   O ponto sensível não é quem pode enviar: é o teste não poder chegar ao
   cliente. Isso é garantido na função (em teste o destinatário é quem pediu),
   e aqui se confere que a regra não exige lista no modo teste — se exigisse,
   a tela teria de mandar a lista do cliente para pedir um teste. */
const { decidirStatus } = require('../regras-acesso');
const baseSt = () => ({
  idxQuem: { orgId: 'o1' },
  membroQuem: { papel: 'gerente', ativo: true },
  org: { ativo: true, expiraEm: 0 },
  projeto: { name: 'Projeto' },
  destinatarios: [{ email: 'cliente@x.com.br' }],
  copia: [], corpo: '<table>oi</table>', pdf: '', teste: false, agora: AGORA
});

test('gerente envia status do projeto da própria empresa', () => {
  assert.equal(decidirStatus(baseSt()).ok, true);
});
test('leitor não envia', () => {
  assert.equal(decidirStatus(Object.assign(baseSt(), { membroQuem: { papel: 'leitor', ativo: true } })).ok, false);
});
test('membro desligado não envia', () => {
  assert.equal(decidirStatus(Object.assign(baseSt(), { membroQuem: { papel: 'admin', ativo: false } })).ok, false);
});
test('empresa suspensa não envia', () => {
  assert.equal(decidirStatus(Object.assign(baseSt(), { org: { ativo: false } })).ok, false);
});
test('empresa com prazo vencido não envia', () => {
  assert.equal(decidirStatus(Object.assign(baseSt(), { org: { ativo: true, expiraEm: AGORA - 1 } })).ok, false);
});
test('projeto inexistente não envia', () => {
  assert.equal(decidirStatus(Object.assign(baseSt(), { projeto: null })).ok, false);
});
test('envio real exige destinatário', () => {
  assert.equal(decidirStatus(Object.assign(baseSt(), { destinatarios: [] })).ok, false);
});
test('teste NÃO exige destinatário: quem recebe é quem pediu', () => {
  assert.equal(decidirStatus(Object.assign(baseSt(), { destinatarios: [], teste: true })).ok, true);
});
test('e-mail inválido na lista barra o envio real', () => {
  assert.equal(decidirStatus(Object.assign(baseSt(), { destinatarios: [{ email: 'ruim@' }] })).ok, false);
});
test('e-mail inválido na cópia barra até no teste', () => {
  assert.equal(decidirStatus(Object.assign(baseSt(), { teste: true, copia: [{ email: 'ruim@' }] })).ok, false);
});
test('mais de 50 destinatários é recusado', () => {
  const muitos = Array.from({ length: 51 }, (_, i) => ({ email: 'p' + i + '@x.com.br' }));
  assert.equal(decidirStatus(Object.assign(baseSt(), { destinatarios: muitos })).ok, false);
});
test('corpo vazio é recusado', () => {
  assert.equal(decidirStatus(Object.assign(baseSt(), { corpo: '   ' })).ok, false);
});
test('corpo gigante é recusado', () => {
  assert.equal(decidirStatus(Object.assign(baseSt(), { corpo: 'x'.repeat(200001) })).ok, false);
});
test('PDF acima do limite é recusado com motivo legível', () => {
  const r = decidirStatus(Object.assign(baseSt(), { pdf: 'x'.repeat(11000001) }));
  assert.equal(r.ok, false);
  assert.match(r.motivo, /grande demais/);
});
test('conta fora de empresa não envia', () => {
  assert.equal(decidirStatus(Object.assign(baseSt(), { idxQuem: {} })).ok, false);
});

test('o gerente de projetos manda o status do projeto dele', () => {
  const { decidirStatus } = require('../regras-acesso');
  const pedido = {
    quem: 'gi@unimed.com.br',
    idxQuem: { orgId: 'unimed' },
    membroQuem: { papel: 'gp', ativo: true },
    org: { ativo: true },
    destinatarios: [{ email: 'cliente@x.com.br' }],
    corpo: '<p>oi</p>', agora: Date.now()
  };
  const com = projeto => decidirStatus(Object.assign({}, pedido, { projeto }));
  assert.equal(com({ gp: 'gi@unimed.com.br' }).ok, true);
  assert.equal(com({ gp: 'GI@Unimed.com.BR' }).ok, true);                       // caixa não importa
  assert.equal(com({ gp: 'helo@unimed.com.br', gpExtra: ['gi@unimed.com.br'] }).ok, true);  // substituta
  const alheio = com({ gp: 'helo@unimed.com.br', gpExtra: [] });
  assert.equal(alheio.ok, false);
  assert.match(alheio.motivo, /não é seu/);
  assert.equal(com({ gp: '', gpExtra: [] }).ok, false);                          // sem dono não é dele
  // quem cuida da carteira inteira segue sem esta trava
  assert.equal(decidirStatus(Object.assign({}, pedido, {
    membroQuem: { papel: 'gerente', ativo: true }, projeto: { gp: 'helo@unimed.com.br' }
  })).ok, true);
});

/* ---- assentos -------------------------------------------------------------
   A trava que sustenta a cobrança por assento. O que estes casos protegem não
   é a tela: é o fato de a conta ser feita no servidor e o pedido ser recusado
   quando ela não vem. */
const { PAPEIS_ASSENTO, contarAssentos, semAssento, fraseDosAssentos } = require('../regras-acesso');

const comLimite = (limite, assentos, papel) => ({
  ...base(), org: { ativo: true, expiraEm: 0, limiteAssentos: limite },
  membroAlvo: { papel: papel, senhaProvisoria: true }, assentos: assentos
});

test('contarAssentos conta todo papel com acesso e só quem está ativo', () => {
  // a régua de cobrança: um assento por PESSOA, sem distinção de papel
  assert.deepEqual(PAPEIS_ASSENTO, ['admin', 'gerente', 'gp', 'leitor', 'analista']);
  assert.equal(contarAssentos([
    { papel: 'admin', ativo: true }, { papel: 'gerente' }, { papel: 'gp', ativo: true },
    { papel: 'leitor', ativo: true }, { papel: 'analista', ativo: true },
    { papel: 'gerente', ativo: false }
  ]), 5, 'desligado não conta; os outros cinco, sim');
  // membro sem `ativo` conta: a ausência do campo significa ativo no resto do sistema
  assert.equal(contarAssentos([{ papel: 'gerente' }]), 1);
  assert.equal(contarAssentos(null), 0);
  assert.equal(contarAssentos([null, {}, { papel: '' }]), 0);
});

test('limite 0 ou ausente não trava nada', () => {
  assert.equal(ok(comLimite(0, 99, 'gerente')), true);
  assert.equal(ok({ ...base(), membroAlvo: { papel: 'gerente' }, assentos: 99 }), true);
});

test('dentro do limite passa, acima recusa', () => {
  // 3 assentos usados (o alvo já está entre eles) e limite 3: couber é couber
  assert.equal(ok(comLimite(3, 3, 'gerente')), true);
  assert.equal(ok(comLimite(3, 4, 'gerente')), false);
  assert.match(decidir(comLimite(3, 4, 'gp')).motivo, /3 assento/);
});

test('leitor e analista também ocupam assento', () => {
  // foi a mudança de régua: antes entravam de graça
  assert.equal(ok(comLimite(3, 9, 'leitor')), false);
  assert.equal(ok(comLimite(3, 9, 'analista')), false);
  assert.equal(ok(comLimite(9, 9, 'analista')), true);
});

test('a frase da recusa é montada a partir da lista, e não escrita à mão', () => {
  // com todos os papéis pagos não existe "cadastre como leitor": a frase não
  // pode oferecer uma saída que não existe mais
  const m = semAssento(comLimite(3, 4, 'analista'));
  assert.ok(!/não ocupam? assento/.test(m), m);
  assert.match(m, /peça mais assentos/);
  assert.match(fraseDosAssentos(), /Cada pessoa com acesso ocupa um assento/);
});

test('redefinir senha nunca é travado pelo limite', () => {
  // o limite pode ter sido BAIXADO depois que as pessoas já estavam dentro;
  // trancar a recuperação de senha puniria o usuário por decisão comercial
  assert.equal(ok({ ...comLimite(2, 7, 'gerente'), modo: 'redefinir',
    membroAlvo: { papel: 'gerente', ultimoAcesso: 1 } }), true);
});

test('sem a contagem do servidor o pedido FALHA FECHADO', () => {
  // esquecer de passar `assentos` recusa, em vez de liberar: um controle de
  // cobrança que vira permissivo por omissão não é controle
  const sem = { ...comLimite(3, 0, 'gerente') }; delete sem.assentos;
  assert.equal(ok(sem), false);
  assert.equal(ok({ ...comLimite(3, 0, 'gerente'), assentos: '3' }), false);
  assert.equal(ok({ ...comLimite(3, 0, 'gerente'), assentos: NaN }), false);
});

test('a plataforma não é travada pelo limite que ela mesma define', () => {
  // senão a primeira administradora de uma empresa de 1 assento não nasceria
  const plat = { ...comLimite(1, 5, 'admin'), quem: 'mmc.chuba@gmail.com',
    idxQuem: { plataforma: true }, membroQuem: null };
  assert.equal(ok(plat), true);
});

test('semAssento devolve motivo legível, não código', () => {
  const m = semAssento(comLimite(2, 3, 'gerente'));
  assert.ok(m && m.length > 40);
  assert.ok(!/undefined|NaN|\[object/.test(m));
  assert.equal(semAssento(comLimite(2, 2, 'gerente')), null);
});
