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
