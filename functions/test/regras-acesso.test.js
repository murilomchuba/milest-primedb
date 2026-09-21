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
