'use strict';
const assert = require('node:assert');
const { test } = require('node:test');
const { decidirResumo, configResumo, linhasDoResumo, diaDaSemana, diaDoRetrato, corpoResumo, assuntoResumo } = require('../resumo');
const { rodarResumo } = require('../resumo-runner');

const SEG = '2026-10-19';   // segunda
const QUA = '2026-10-21';   // quarta
const SEX = '2026-10-23';   // sexta

const emDia = iso => Date.parse(iso + 'T12:00:00Z');

const ret = (o) => Object.assign({
  nome: 'Projeto', cliente: 'Cliente', real: 50, planPct: 60,
  horasPrev: 100, horasFeitas: 40, em: emDia('2026-10-18')
}, o);

const orgLigada = (o) => ({ nome: 'Unimed', resumoSemanal: Object.assign({ ativo: true, para: 'gestor@x.com' }, o) });

test('segunda e sexta mandam; quarta não', () => {
  const r = { org: orgLigada(), retratos: [ret({})] };
  assert.equal(decidirResumo(Object.assign({ hoje: SEG }, r)).manda, true);
  assert.equal(decidirResumo(Object.assign({ hoje: SEX }, r)).manda, true);
  const q = decidirResumo(Object.assign({ hoje: QUA }, r));
  assert.equal(q.manda, false);
  assert.equal(q.porque, 'hoje não é dia');
});

test('desligado não manda, e sem destinatário também não', () => {
  assert.equal(decidirResumo({ org: { resumoSemanal: { ativo: false, para: 'a@b.com' } }, retratos: [ret({})], hoje: SEG }).porque, 'desligado');
  assert.equal(decidirResumo({ org: orgLigada({ para: '' }), retratos: [ret({})], hoje: SEG }).porque, 'sem destinatário');
});

test('encerrado nunca entra; pausado só quando pedido', () => {
  const retratos = [ret({ nome: 'Vivo' }), ret({ nome: 'Fechado', encerrado: true }), ret({ nome: 'Parado', pausado: true })];
  const semPausados = decidirResumo({ org: orgLigada(), retratos, hoje: SEG });
  assert.deepEqual(semPausados.linhas.map(l => l.nome), ['Vivo']);
  const comPausados = decidirResumo({ org: orgLigada({ incluirPausados: true }), retratos, hoje: SEG });
  assert.deepEqual(comPausados.linhas.map(l => l.nome).sort(), ['Parado', 'Vivo']);
});

test('nenhum projeto em andamento não gera e-mail vazio', () => {
  const d = decidirResumo({ org: orgLigada(), retratos: [ret({ encerrado: true })], hoje: SEG });
  assert.equal(d.manda, false);
  assert.equal(d.porque, 'nenhum projeto em andamento');
});

test('o pior fica em cima: ordena pelo quanto está atrás do plano', () => {
  const retratos = [
    ret({ nome: 'Em dia', real: 80, planPct: 78 }),
    ret({ nome: 'Muito atrás', real: 20, planPct: 70 }),
    ret({ nome: 'Pouco atrás', real: 60, planPct: 65 }),
    ret({ nome: 'Sem plano', planPct: null })
  ];
  const d = decidirResumo({ org: orgLigada(), retratos, hoje: SEG });
  assert.deepEqual(d.linhas.map(l => l.nome), ['Muito atrás', 'Pouco atrás', 'Em dia', 'Sem plano']);
});

test('a idade da medição é contada, e a data sai na linha', () => {
  const d = decidirResumo({ org: orgLigada(), retratos: [ret({ em: emDia('2026-10-05') })], hoje: SEG });
  assert.equal(d.linhas[0].medidoEm, '2026-10-05');
  assert.equal(d.linhas[0].idade, 14);
});

test('retrato sem data não quebra a conta', () => {
  const d = decidirResumo({ org: orgLigada(), retratos: [ret({ em: 0 })], hoje: SEG });
  assert.equal(d.linhas[0].medidoEm, '');
  assert.equal(d.linhas[0].idade, null);
});

test('diaDaSemana: segunda é 1 e sexta é 5', () => {
  assert.equal(diaDaSemana(SEG), 1);
  assert.equal(diaDaSemana(SEX), 5);
  assert.equal(diaDaSemana('nada'), null);
});

test('o corpo traz os cinco números e a data da medição', () => {
  const d = decidirResumo({ org: orgLigada(), retratos: [ret({ cliente: 'Grupo Meridiano', nome: 'Parque de TI' })], hoje: SEG });
  const html = corpoResumo(d, 'Unimed');
  for (const p of ['Grupo Meridiano', 'Parque de TI', '60,0%', '50,0%', '100 h', '40 h', '18/10/26', 'Medido em']) {
    assert.ok(html.includes(p), 'faltou no corpo: ' + p);
  }
  assert.ok(assuntoResumo(d, 'Unimed').includes('1 projeto'));
});

test('o corpo escapa o que vem do cadastro', () => {
  const d = decidirResumo({ org: orgLigada(), retratos: [ret({ nome: '<script>x</script>' })], hoje: SEG });
  const html = corpoResumo(d, 'Unimed');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

/* ---- o executor ---- */

const bancoFalso = (orgs, retratosPorOrg) => ({
  collectionGroup: () => ({
    get: async () => ({
      docs: Object.keys(retratosPorOrg).flatMap(orgId =>
        retratosPorOrg[orgId].map((data, i) => ({
          id: 'retrato',
          data: () => data,
          ref: { parent: { parent: { id: 'p' + i, parent: { parent: { id: orgId } } } } }
        })))
    })
  }),
  doc: (caminho) => ({ caminho })
});

test('uma empresa, um e-mail — e não um por projeto', async () => {
  const enviados = [];
  const r = await rodarResumo({
    db: bancoFalso({}, { unimed: [ret({ nome: 'A' }), ret({ nome: 'B' }), ret({ nome: 'C' })] }),
    hoje: SEG,
    ler: async () => orgLigada(),
    mandar: async (m) => { enviados.push(m); }
  });
  assert.equal(enviados.length, 1);
  assert.equal(r.enviados, 1);
  assert.ok(enviados[0].corpo.includes('3 projetos'));
});

test('empresa desligada não custa leitura de projeto nenhuma', async () => {
  const enviados = [];
  const r = await rodarResumo({
    db: bancoFalso({}, { unimed: [ret({})] }),
    hoje: SEG,
    ler: async () => ({ nome: 'X', resumoSemanal: { ativo: false } }),
    mandar: async (m) => { enviados.push(m); }
  });
  assert.equal(enviados.length, 0);
  assert.equal(r.desligadas, 1);
});

test('falha de envio não derruba as outras empresas', async () => {
  const enviados = [];
  const r = await rodarResumo({
    db: bancoFalso({}, { a: [ret({})], b: [ret({})] }),
    hoje: SEG,
    ler: async () => orgLigada(),
    mandar: async (m) => { if (enviados.length === 0) { enviados.push(m); throw new Error('resend caiu'); } enviados.push(m); }
  });
  assert.equal(r.falhas, 1);
  assert.equal(r.enviados, 1);
});
