'use strict';
const { test } = require('node:test');
const a = require('node:assert');
const { decidirVigia, diasEntre, faixaEscapada, destinatarios, listaDeEmails } = require('../vigia');

const HOJE = '2026-10-08';

/* Um retrato como o navegador grava: duas atividades abertas, uma delas já
   vencida, e o projeto com término previsto no futuro. */
function retrato(ex) {
  return Object.assign({
    v: 1, em: Date.parse('2026-10-05T12:00:00Z'), base: 1000,
    orgId: 'acme', pid: 'p1', nome: 'Modernização', cliente: 'Grupo Meridiano',
    pausado: false, encerrado: false,
    real: 42, planPct: 60, IDP: 0.7, IDC: 0.9,
    horasPrev: 640, horasFeitas: 300,
    inicio: '2026-08-03', fim: '2026-11-20', horasEm: 0,
    abertas: [
      { id: 't3', nome: 'Desenho', fim: '2026-10-02', pct: 40 },
      { id: 't4', nome: 'Implantação', fim: '2026-11-20', pct: 0 }
    ],
    nAbertas: 2, avisoHorasPara: []
  }, ex || {});
}
const ORG = ex => Object.assign({
  avisoPrazo: { ativo: true, dias: 7 },
  avisoHoras: { ativo: false, para: 'gestor@acme.com.br', faixas: [50, 70, 90, 100] },
  avisoAvanco: { ativo: false, faixas: [25, 50, 75, 90, 100] }
}, ex || {});
const decidir = (ex) => decidirVigia(Object.assign({
  retrato: retrato(), marcas: {}, projeto: {}, org: ORG(), hoje: HOJE
}, ex || {}));

test('conta dias entre datas, e recusa o que não é data', () => {
  a.equal(diasEntre('2026-10-01', '2026-10-08'), 7);
  a.equal(diasEntre('2026-10-08', '2026-10-01'), -7);
  a.equal(diasEntre('2026-10-08', '2026-10-08'), 0);
  a.equal(diasEntre('', '2026-10-08'), null);
  a.equal(diasEntre('ontem', '2026-10-08'), null);
  // atravessa o fim do mês e o ano
  a.equal(diasEntre('2026-12-28', '2027-01-04'), 7);
});

test('a atividade vencida vira aviso, com quantos dias faz', () => {
  const r = decidir();
  a.ok(r.enviar);
  a.ok(r.motivos.includes('atrasadas'));
  a.equal(r.nAtrasadas, 1);
  a.equal(r.atrasadas[0].nome, 'Desenho');
  a.equal(r.atrasadas[0].dias, 6);
  // a que vence no futuro não entra
  a.equal(r.atrasadas.length, 1);
});

test('a marca guarda os ids, e no dia seguinte não repete', () => {
  const r1 = decidir();
  const r2 = decidir({ marcas: { atrasadas: r1.marcas.atrasadas }, hoje: '2026-10-09' });
  a.equal(r2.motivos.length, 0);
  a.ok(!r2.enviar);
});

test('uma atividade que vence depois fura o intervalo: é notícia', () => {
  const r1 = decidir();
  const ret = retrato({
    abertas: [
      { id: 't3', nome: 'Desenho', fim: '2026-10-02', pct: 40 },
      { id: 't4', nome: 'Implantação', fim: '2026-10-09', pct: 0 }
    ]
  });
  const r2 = decidirVigia({ retrato: ret, marcas: { atrasadas: r1.marcas.atrasadas }, projeto: {}, org: ORG(), hoje: '2026-10-10' });
  a.ok(r2.enviar);
  a.equal(r2.nNovas, 1);
  a.equal(r2.nAtrasadas, 2);
  // a mais antiga vem primeiro: é a que dói
  a.equal(r2.atrasadas[0].nome, 'Desenho');
});

test('sem nada novo, só repete depois do intervalo da empresa', () => {
  const r1 = decidir();
  const comMarca = (hoje, dias) => decidirVigia({
    retrato: retrato(), marcas: { atrasadas: r1.marcas.atrasadas }, projeto: {},
    org: ORG({ avisoPrazo: { ativo: true, dias: dias } }), hoje
  });
  a.ok(!comMarca('2026-10-14', 7).enviar);   // 6 dias
  a.ok(comMarca('2026-10-15', 7).enviar);    // 7 dias
  a.ok(comMarca('2026-10-11', 3).enviar);    // empresa mais ansiosa
});

test('resolvida a última atividade atrasada, a marca é apagada', () => {
  const r1 = decidir();
  const r2 = decidirVigia({
    retrato: retrato({ abertas: [{ id: 't4', nome: 'Implantação', fim: '2026-11-20', pct: 0 }] }),
    marcas: { atrasadas: r1.marcas.atrasadas }, projeto: {}, org: ORG(), hoje: '2026-10-09'
  });
  a.equal(r2.motivos.length, 0);
  a.equal(r2.marcas.atrasadas, null);        // volta a valer do zero se atrasar de novo
});

test('o projeto que passou do término previsto avisa uma vez por data', () => {
  const ret = retrato({ fim: '2026-10-01' });
  const r1 = decidirVigia({ retrato: ret, marcas: {}, projeto: {}, org: ORG(), hoje: HOJE });
  a.ok(r1.motivos.includes('prazo'));
  a.equal(r1.diasEstouro, 7);
  const r2 = decidirVigia({ retrato: ret, marcas: { prazo: r1.marcas.prazo }, projeto: {}, org: ORG(), hoje: '2026-10-20' });
  a.ok(!r2.motivos.includes('prazo'));
});

test('replanejar para a frente apaga a marca; estourar de novo avisa de novo', () => {
  const r1 = decidirVigia({ retrato: retrato({ fim: '2026-10-01' }), marcas: {}, projeto: {}, org: ORG(), hoje: HOJE });
  const r2 = decidirVigia({ retrato: retrato({ fim: '2026-12-01' }), marcas: { prazo: r1.marcas.prazo }, projeto: {}, org: ORG(), hoje: HOJE });
  a.equal(r2.marcas.prazo, null);
  const r3 = decidirVigia({ retrato: retrato({ fim: '2026-12-01' }), marcas: {}, projeto: {}, org: ORG(), hoje: '2026-12-05' });
  a.ok(r3.motivos.includes('prazo'));
});

test('projeto em 100% que ninguém encerrou não é cobrado de prazo', () => {
  const r = decidirVigia({
    retrato: retrato({ fim: '2026-10-01', real: 100, abertas: [] }),
    marcas: {}, projeto: {}, org: ORG(), hoje: HOJE
  });
  a.ok(!r.motivos.includes('prazo'));
});

test('pausado e encerrado não recebem nada', () => {
  a.ok(!decidir({ retrato: retrato({ pausado: true, fim: '2026-01-01' }) }).enviar);
  a.ok(!decidir({ retrato: retrato({ encerrado: true, fim: '2026-01-01' }) }).enviar);
});

test('com o vigia desligado, nenhum aviso de prazo', () => {
  const r = decidir({ org: ORG({ avisoPrazo: { ativo: false, dias: 7 } }) });
  a.ok(!r.enviar);
  a.equal(r.motivos.length, 0);
});

test('retrato de outra versão é ignorado, em vez de lido errado', () => {
  const r = decidir({ retrato: retrato({ v: 2 }) });
  a.ok(!r.enviar);
  a.equal(r.porque, 'retrato de outra versão');
});

test('sem destinatário não há aviso — e, principalmente, não há marca', () => {
  const r = decidir({ org: ORG({ avisoHoras: { ativo: false, para: '', faixas: [50] } }) });
  a.ok(!r.enviar);
  a.deepEqual(r.marcas, {});   // amanhã, com a lista cadastrada, o aviso sai
  a.equal(r.porque, 'sem destinatário');
});

test('a lista do projeto manda sobre a da empresa', () => {
  a.deepEqual(destinatarios({ avisoHorasPara: ['dono@cliente.com.br'] }, ORG()), ['dono@cliente.com.br']);
  a.deepEqual(destinatarios({ avisoHorasPara: [] }, ORG()), ['gestor@acme.com.br']);
  a.deepEqual(destinatarios({}, {}), []);
});

test('lê a lista do jeito antigo e do novo, e descarta o que não é e-mail', () => {
  a.deepEqual(listaDeEmails('a@x.com, b@y.com'), ['a@x.com', 'b@y.com']);
  a.deepEqual(listaDeEmails('A@X.com; a@x.com'), ['a@x.com']);
  a.deepEqual(listaDeEmails(['a@x.com', 'nada']), ['a@x.com']);
  a.deepEqual(listaDeEmails(null), []);
});

test('a faixa escapada é a mais alta ainda não avisada', () => {
  a.equal(faixaEscapada(81, [50, 70, 90, 100], {}), 70);
  a.equal(faixaEscapada(81, [50, 70, 90, 100], { '70': { em: 1 } }), null);
  a.equal(faixaEscapada(46, [50, 70], {}), null);
  a.equal(faixaEscapada(100, [50, 100], {}), 100);
  a.equal(faixaEscapada(NaN, [50], {}), null);
});

test('a rede de segurança pega a faixa que o navegador não mandou', () => {
  const org = ORG({ avisoHoras: { ativo: true, para: 'g@acme.com.br', faixas: [50, 70, 90, 100] } });
  const r = decidirVigia({ retrato: retrato({ horasFeitas: 520 }), marcas: {}, projeto: {}, org, hoje: HOJE });
  a.ok(r.motivos.includes('horas'));
  a.equal(r.horas.faixa, 70);
  a.equal(r.horas.pct, 81.3);
});

test('mas não corre com o navegador: no mesmo dia do retrato ela se cala', () => {
  const org = ORG({ avisoHoras: { ativo: true, para: 'g@acme.com.br', faixas: [50, 70, 90, 100] } });
  const ret = retrato({ horasFeitas: 520, em: Date.parse('2026-10-08T09:00:00Z') });
  const r = decidirVigia({ retrato: ret, marcas: {}, projeto: {}, org, hoje: HOJE });
  a.ok(!r.motivos.includes('horas'));
});

test('a faixa que o navegador já avisou não sai de novo pelo servidor', () => {
  const org = ORG({ avisoHoras: { ativo: true, para: 'g@acme.com.br', faixas: [50, 70, 90, 100] } });
  const r = decidirVigia({
    retrato: retrato({ horasFeitas: 520 }), marcas: {},
    projeto: { avisosHoras: { '70': { em: 1, para: ['g@acme.com.br'] } } }, org, hoje: HOJE
  });
  a.ok(!r.motivos.includes('horas'));
});

test('a rede vale para o avanço também, e respeita o interruptor dele', () => {
  const ligado = ORG({ avisoAvanco: { ativo: true, faixas: [25, 50, 75, 90, 100] } });
  const r = decidirVigia({ retrato: retrato(), marcas: {}, projeto: {}, org: ligado, hoje: HOJE });
  a.ok(r.motivos.includes('avanco'));
  a.equal(r.avanco.faixa, 25);
  const r2 = decidirVigia({ retrato: retrato(), marcas: {}, projeto: {}, org: ORG(), hoje: HOJE });
  a.ok(!r2.motivos.includes('avanco'));
});

test('motivos diferentes no mesmo projeto viram UM aviso', () => {
  const org = ORG({
    avisoHoras: { ativo: true, para: 'g@acme.com.br', faixas: [50, 70, 90, 100] },
    avisoAvanco: { ativo: true, faixas: [25, 50, 75, 90, 100] }
  });
  const r = decidirVigia({
    retrato: retrato({ fim: '2026-10-01', horasFeitas: 520 }), marcas: {}, projeto: {}, org, hoje: HOJE
  });
  a.deepEqual(r.motivos.sort(), ['atrasadas', 'avanco', 'horas', 'prazo']);
  a.ok(r.enviar);
});

test('o aviso leva de quando é o retrato, para o e-mail poder dizer', () => {
  const r = decidir();
  a.equal(r.retratoDe, '2026-10-05');
  a.equal(r.diasDoRetrato, 3);
});

test('no primeiro aviso ele não fala em "desde o último aviso"', () => {
  const r1 = decidir();
  a.equal(r1.primeiroAviso, true);
  const ret = retrato({
    abertas: [
      { id: 't3', nome: 'Desenho', fim: '2026-10-02', pct: 40 },
      { id: 't4', nome: 'Implantação', fim: '2026-10-09', pct: 0 }
    ]
  });
  const r2 = decidirVigia({ retrato: ret, marcas: { atrasadas: r1.marcas.atrasadas }, projeto: {}, org: ORG(), hoje: '2026-10-10' });
  a.equal(r2.primeiroAviso, false);
  const { corpoVigia } = require('../vigia');
  a.ok(!corpoVigia(r1, retrato()).includes('desde o último aviso'));
  a.ok(corpoVigia(r2, ret).includes('desde o último aviso'));
});

test('o corpo escapa o nome do projeto e o da atividade', () => {
  const { corpoVigia } = require('../vigia');
  const ret = retrato({ nome: 'Fase <b>"2"</b> & cia', abertas: [{ id: 'x', nome: '<script>a</script>', fim: '2026-10-01', pct: 0 }] });
  const d = decidirVigia({ retrato: ret, marcas: {}, projeto: {}, org: ORG(), hoje: HOJE });
  const c = corpoVigia(d, ret);
  a.ok(c.includes('Fase &lt;b&gt;&quot;2&quot;&lt;/b&gt; &amp; cia'));
  a.ok(!c.includes('<script>'));
});

test('o assunto nomeia o motivo mais grave', () => {
  const { assuntoVigia } = require('../vigia');
  const comPrazo = decidirVigia({ retrato: retrato({ fim: '2026-10-01' }), marcas: {}, projeto: {}, org: ORG(), hoje: HOJE });
  a.ok(/^\[Prazo estourado\]/.test(assuntoVigia(comPrazo, retrato())));
  a.ok(/^\[1 atividade vencida\]/.test(assuntoVigia(decidir(), retrato())));
});

test('empresa desligada ou com prazo vencido não recebe cobrança', () => {
  const agora = Date.parse('2026-10-08T10:00:00Z');
  a.ok(!decidir({ org: ORG({ ativo: false }), agora }).enviar);
  a.equal(decidir({ org: ORG({ ativo: false }), agora }).porque, 'empresa desligada');
  a.ok(!decidir({ org: ORG({ expiraEm: Date.parse('2026-09-01T00:00:00Z') }), agora }).enviar);
  // prazo no futuro, ou sem prazo, segue valendo
  a.ok(decidir({ org: ORG({ expiraEm: Date.parse('2027-01-01T00:00:00Z') }), agora }).enviar);
  a.ok(decidir({ org: ORG({ expiraEm: 0 }), agora }).enviar);
});
