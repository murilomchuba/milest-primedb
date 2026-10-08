'use strict';
const { test } = require('node:test');
const a = require('node:assert');
const { rodarVigia } = require('../vigia-runner');

const HOJE = '2026-10-08';
const APAGAR = { __apagar: true };

/* Um banco de mentira com a forma que o executor usa: um grupo de coleções
   `vigia`, e de cada retrato o caminho de volta ao projeto e à empresa. */
function banco(projetos, orgs) {
  const escritas = [];
  const docs = [];
  for (const p of projetos) {
    const projRef = {
      id: p.pid,
      parent: { parent: { id: p.orgId } },
      get: async () => ({ exists: p.projeto !== null, data: () => p.projeto || {} }),
      update: async (...args) => { escritas.push({ onde: 'projeto/' + p.pid, args }); },
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: !!p.marcas, data: () => p.marcas || {} }),
          set: async (d, op) => { escritas.push({ onde: 'marcas/' + p.pid, dados: d, op }); }
        })
      })
    };
    docs.push({ id: p.id || 'retrato', data: () => p.retrato, ref: { parent: { parent: projRef } } });
  }
  return {
    escritas,
    db: {
      collectionGroup: () => ({ get: async () => ({ docs }) }),
      doc: caminho => ({ caminho })
    },
    pecas: extra => Object.assign({
      hoje: HOJE, agora: Date.parse('2026-10-08T11:00:00Z'),
      apagar: () => APAGAR,
      caminho: (x, y) => x + '.' + y,
      ler: async ref => orgs[String(ref.caminho).replace('orgs/', '')] || null,
      corpo: () => '<p>corpo</p>', assunto: () => 'assunto',
      mandar: async () => ({ enviado: true }),
      erro: () => { }
    }, extra || {})
  };
}

const RET = ex => Object.assign({
  v: 1, em: Date.parse('2026-10-05T12:00:00Z'), orgId: 'acme', pid: 'p1',
  nome: 'Projeto', cliente: 'Cliente', pausado: false, encerrado: false,
  real: 42, horasPrev: 640, horasFeitas: 300, fim: '2026-11-20',
  abertas: [{ id: 't3', nome: 'Desenho', fim: '2026-10-02', pct: 40 }],
  avisoHorasPara: []
}, ex || {});

const ORGS = {
  acme: {
    nome: 'ACME', avisoPrazo: { ativo: true, dias: 7 },
    avisoHoras: { ativo: false, para: 'gestor@acme.com.br', faixas: [50, 70, 90, 100] },
    avisoAvanco: { ativo: false, faixas: [25, 50, 75, 90, 100] }
  }
};

test('acha o retrato, manda o e-mail e conta o que fez', async () => {
  const b = banco([{ pid: 'p1', orgId: 'acme', retrato: RET(), projeto: {}, marcas: null }], ORGS);
  const mandados = [];
  const r = await rodarVigia(Object.assign({ db: b.db }, b.pecas({
    mandar: async m => { mandados.push(m); return { enviado: true }; }
  })));
  a.equal(r.retratos, 1);
  a.equal(r.olhados, 1);
  a.equal(r.enviados, 1);
  a.equal(r.falhas, 0);
  a.equal(mandados.length, 1);
  a.deepEqual(mandados[0].para, ['gestor@acme.com.br']);
  a.equal(mandados[0].empresa, 'ACME');
});

test('a marca entra depois do envio, e só depois', async () => {
  const b = banco([{ pid: 'p1', orgId: 'acme', retrato: RET(), projeto: {}, marcas: null }], ORGS);
  const ordem = [];
  await rodarVigia(Object.assign({ db: b.db }, b.pecas({
    mandar: async () => { ordem.push('enviou'); return { enviado: true }; }
  })));
  for (const e of b.escritas) if (/^marcas/.test(e.onde) && e.dados.atrasadas) ordem.push('marcou');
  a.deepEqual(ordem, ['enviou', 'marcou']);
});

test('envio que falha NÃO marca — senão o aviso nunca mais sai', async () => {
  const b = banco([{ pid: 'p1', orgId: 'acme', retrato: RET(), projeto: {}, marcas: null }], ORGS);
  const r = await rodarVigia(Object.assign({ db: b.db }, b.pecas({
    mandar: async () => ({ enviado: false, erro: 'resend fora do ar' })
  })));
  a.equal(r.enviados, 0);
  a.equal(r.falhas, 1);
  a.ok(!b.escritas.some(e => e.dados && e.dados.atrasadas));
});

test('o envio que explode conta como falha, não derruba a rodada', async () => {
  const b = banco([
    { pid: 'p1', orgId: 'acme', retrato: RET(), projeto: {}, marcas: null },
    { pid: 'p2', orgId: 'acme', retrato: RET({ pid: 'p2' }), projeto: {}, marcas: null }
  ], ORGS);
  let n = 0;
  const r = await rodarVigia(Object.assign({ db: b.db }, b.pecas({
    mandar: async () => { if (++n === 1) throw new Error('rede caiu'); return { enviado: true }; }
  })));
  a.equal(r.falhas, 1);
  a.equal(r.enviados, 1);   // o segundo projeto foi atendido assim mesmo
});

test('a cobrança que acabou apaga a marca, mesmo sem e-mail nenhum', async () => {
  const b = banco([{
    pid: 'p1', orgId: 'acme',
    retrato: RET({ abertas: [] }),                       // nada mais atrasado
    projeto: {}, marcas: { atrasadas: { em: '2026-10-01', ids: ['t3'] } }
  }], ORGS);
  const r = await rodarVigia(Object.assign({ db: b.db }, b.pecas()));
  a.equal(r.enviados, 0);
  const limpeza = b.escritas.find(e => e.dados && e.dados.atrasadas === APAGAR);
  a.ok(limpeza, 'a marca de atrasadas deveria ter sido apagada');
  a.deepEqual(limpeza.op, { merge: true });
});

test('a faixa que escapou é marcada no projeto, por caminho de campo', async () => {
  const orgs = {
    acme: Object.assign({}, ORGS.acme, {
      avisoHoras: { ativo: true, para: 'gestor@acme.com.br', faixas: [50, 70, 90, 100] }
    })
  };
  const b = banco([{ pid: 'p1', orgId: 'acme', retrato: RET({ horasFeitas: 520 }), projeto: {}, marcas: null }], orgs);
  await rodarVigia(Object.assign({ db: b.db }, b.pecas()));
  const up = b.escritas.find(e => e.onde === 'projeto/p1');
  a.ok(up, 'deveria ter marcado a faixa no projeto');
  a.equal(up.args[0], 'avisosHoras.70');
  a.equal(up.args[1].por, 'vigia');
  a.deepEqual(up.args[1].para, ['gestor@acme.com.br']);
});

test('uma empresa é lida uma vez só, por mais projetos que tenha', async () => {
  const projetos = [];
  for (let i = 0; i < 5; i++) projetos.push({ pid: 'p' + i, orgId: 'acme', retrato: RET({ pid: 'p' + i }), projeto: {}, marcas: null });
  const b = banco(projetos, ORGS);
  let leituras = 0;
  await rodarVigia(Object.assign({ db: b.db }, b.pecas({
    ler: async ref => { leituras++; return ORGS[String(ref.caminho).replace('orgs/', '')] || null; }
  })));
  a.equal(leituras, 1);
});

test('empresa que não existe mais é pulada sem derrubar nada', async () => {
  const b = banco([{ pid: 'p1', orgId: 'sumiu', retrato: RET({ orgId: 'sumiu' }), projeto: {}, marcas: null }], ORGS);
  const r = await rodarVigia(Object.assign({ db: b.db }, b.pecas()));
  a.equal(r.retratos, 1);
  a.equal(r.olhados, 0);
  a.equal(r.enviados, 0);
});

test('projeto apagado com retrato órfão não vira e-mail', async () => {
  const b = banco([{ pid: 'p1', orgId: 'acme', retrato: RET(), projeto: null, marcas: null }], ORGS);
  const r = await rodarVigia(Object.assign({ db: b.db }, b.pecas()));
  a.equal(r.enviados, 0);
});

test('documentos que não são o retrato são ignorados', async () => {
  const b = banco([{ id: 'outra-coisa', pid: 'p1', orgId: 'acme', retrato: RET(), projeto: {}, marcas: null }], ORGS);
  const r = await rodarVigia(Object.assign({ db: b.db }, b.pecas()));
  a.equal(r.retratos, 0);
});

test('o teto corta a rodada e avisa que cortou', async () => {
  const projetos = [];
  for (let i = 0; i < 6; i++) projetos.push({ pid: 'p' + i, orgId: 'acme', retrato: RET({ pid: 'p' + i }), projeto: {}, marcas: null });
  const b = banco(projetos, ORGS);
  const r = await rodarVigia(Object.assign({ db: b.db, teto: 3 }, b.pecas()));
  a.equal(r.enviados, 3);
  a.equal(r.cortado, true);
});

test('sem lista de destinatários, conta separado e não marca nada', async () => {
  const orgs = { acme: Object.assign({}, ORGS.acme, { avisoHoras: { ativo: false, para: '', faixas: [50] } }) };
  const b = banco([{ pid: 'p1', orgId: 'acme', retrato: RET(), projeto: {}, marcas: null }], orgs);
  const r = await rodarVigia(Object.assign({ db: b.db }, b.pecas()));
  a.equal(r.semLista, 1);
  a.equal(r.enviados, 0);
  a.equal(b.escritas.length, 0);
});
