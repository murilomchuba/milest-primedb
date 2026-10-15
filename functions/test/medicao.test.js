const test = require('node:test');
const assert = require('node:assert');
const { mesDe, linhaDeEmpresa, assentosACobrar, excedentes } = require('../medicao');
const { rodarMedicao } = require('../medicao-runner');

const HOJE = '2026-10-14';
const org = (x) => Object.assign({ id: 'o1', nome: 'Cliente Um', plano: 'Padrão', ativo: true }, x || {});
const tres = [{ papel: 'admin', ativo: true }, { papel: 'gerente' }, { papel: 'gp', ativo: true }];

test('mesDe corta o dia e deixa o mês', () => {
  assert.equal(mesDe('2026-10-14'), '2026-10');
  assert.equal(mesDe(''), '');
  assert.equal(mesDe(null), '');
});

test('a linha conta assentos e marca quem passou do contratado', () => {
  const l = linhaDeEmpresa({ org: org({ limiteAssentos: 3 }), membros: tres, hoje: HOJE });
  assert.equal(l.assentos, 3);
  assert.equal(l.pico, 3);
  assert.equal(l.acima, false);
  const e = linhaDeEmpresa({ org: org({ limiteAssentos: 2 }), membros: tres, hoje: HOJE });
  assert.equal(e.acima, true);
});

test('sem limite nunca marca excedente', () => {
  const l = linhaDeEmpresa({ org: org({ limiteAssentos: 0 }), membros: tres, hoje: HOJE });
  assert.equal(l.limite, 0);
  assert.equal(l.acima, false);
});

test('o PICO guarda o mês, não o dia', () => {
  // a empresa subiu para 9 no dia 10 e voltou para 3 no dia 28: o mês teve 9
  const dia10 = linhaDeEmpresa({ org: org({ limiteAssentos: 3 }), hoje: '2026-10-10',
    membros: tres.concat([{ papel: 'gerente' }, { papel: 'gerente' }, { papel: 'gerente' },
      { papel: 'gp' }, { papel: 'gp' }, { papel: 'gp' }]) });
  assert.equal(dia10.assentos, 9);
  const dia28 = linhaDeEmpresa({ org: org({ limiteAssentos: 3 }), membros: tres,
    hoje: '2026-10-28', anterior: dia10 });
  assert.equal(dia28.assentos, 3);
  assert.equal(dia28.pico, 9);
  assert.equal(dia28.acima, true, 'quem estourou no dia 10 não vira limpo no dia 28');
});

test('a promoção que furou a trava aparece na medição', () => {
  // analista (não ocupa assento) promovido a gerente por escrita direta no
  // documento do membro — caminho que as regras do Firestore não sabem contar
  const antes = linhaDeEmpresa({ org: org({ limiteAssentos: 3 }), membros: tres, hoje: '2026-10-01' });
  assert.equal(antes.acima, false);
  const depois = linhaDeEmpresa({ org: org({ limiteAssentos: 3 }), hoje: '2026-10-02',
    membros: tres.concat([{ papel: 'gerente', ativo: true }]), anterior: antes });
  assert.equal(depois.assentos, 4);
  assert.equal(depois.acima, true);
});

test('os contadores do navegador ficam ao lado e fora da conta', () => {
  // `usuarios` é escrito pelo navegador do cliente; mentir nele não muda nada
  const l = linhaDeEmpresa({ org: org({ limiteAssentos: 3, usuarios: 1, projetos: 2 }),
    membros: tres, hoje: HOJE });
  assert.equal(l.assentos, 3, 'a conta é do servidor, não do campo usuarios');
  assert.equal(l.usuarios, 1);
  assert.equal(l.projetos, 2);
  const semCampos = linhaDeEmpresa({ org: org(), membros: tres, hoje: HOJE });
  assert.equal(semCampos.usuarios, null);
});

test('a fatura conta uma pessoa por assento, qualquer que seja o papel', () => {
  const l = linhaDeEmpresa({ org: org({ limiteAssentos: 1 }), hoje: HOJE,
    membros: [{ papel: 'admin' }, { papel: 'leitor' }, { papel: 'analista' },
      { papel: 'analista' }, { papel: 'gerente', ativo: false }] });
  assert.equal(l.assentos, 4, 'quatro ativos; só o gerente desligado fica de fora');
  assert.equal(l.acima, true, 'contratou 1 e tem 4');
});

test('assentosACobrar: o contratado, ou o excedente', () => {
  assert.equal(assentosACobrar({ limite: 5, pico: 3 }), 5, 'quem contratou 5 paga 5');
  assert.equal(assentosACobrar({ limite: 5, pico: 8 }), 8, 'quem usou 8 paga 8');
  assert.equal(assentosACobrar({ limite: 0, pico: 4 }), 4, 'sem limite, paga o que usou');
  assert.equal(assentosACobrar({}), 0);
  assert.equal(assentosACobrar(null), 0);
});

test('excedentes lista o pior primeiro', () => {
  const doc = { orgs: {
    a: { nome: 'A', limite: 3, pico: 4, acima: true },
    b: { nome: 'B', limite: 2, pico: 9, acima: true },
    c: { nome: 'C', limite: 5, pico: 5, acima: false }
  } };
  const l = excedentes(doc);
  assert.equal(l.length, 2);
  assert.equal(l[0].nome, 'B');
  assert.equal(l[0].excedente, 7);
  assert.deepEqual(excedentes(null), []);
  assert.deepEqual(excedentes({}), []);
});

/* ---- o executor, com um banco de mentira ---- */
function bancoFalso(empresas, gravado) {
  const escritas = [];
  const colecao = (caminho) => ({
    get: async () => {
      if (caminho === 'orgs')
        return { docs: Object.keys(empresas).map(id => ({ id, data: () => empresas[id].org })) };
      const m = /^orgs\/([^/]+)\/members$/.exec(caminho);
      if (m) {
        const e = empresas[m[1]];
        if (e.quebra) throw new Error('sem permissão');
        return { docs: (e.membros || []).map(x => ({ data: () => x })) };
      }
      return { docs: [] };
    },
    where: () => colecao(caminho)
  });
  return {
    escritas,
    db: {
      collection: colecao,
      doc: (caminho) => ({ caminho, set: async (d) => { escritas.push({ caminho, d }); } })
    },
    ler: async (ref) => (ref.caminho === 'medicao/2026-10' ? gravado : null)
  };
}

test('o executor grava um documento por mês e soma os assentos', async () => {
  const f = bancoFalso({
    o1: { org: { nome: 'Um', limiteAssentos: 3 }, membros: tres },
    o2: { org: { nome: 'Dois', limiteAssentos: 1 }, membros: tres }
  }, null);
  const r = await rodarMedicao({ db: f.db, ler: f.ler, hoje: HOJE });
  assert.equal(r.mes, '2026-10');
  assert.equal(r.empresas, 2);
  assert.equal(r.assentos, 6);
  assert.equal(r.acima, 1, 'a de 1 assento com 3 ocupados');
  assert.equal(f.escritas.length, 1);
  assert.equal(f.escritas[0].caminho, 'medicao/2026-10');
  assert.equal(f.escritas[0].d.orgs.o2.acima, true);
});

test('empresa que falha na leitura mantém a linha que já tinha', async () => {
  const f = bancoFalso({
    o1: { org: { nome: 'Um', limiteAssentos: 3 }, membros: tres },
    o2: { org: { nome: 'Dois', limiteAssentos: 3 }, quebra: true }
  }, { mes: '2026-10', orgs: { o2: { nome: 'Dois', assentos: 2, pico: 5, acima: true } } });
  const r = await rodarMedicao({ db: f.db, ler: f.ler, hoje: HOJE });
  assert.equal(r.falhas, 1);
  const g = f.escritas[0].d.orgs;
  assert.equal(g.o2.pico, 5, 'não perdeu o pico de quem falhou hoje');
  assert.equal(g.o1.assentos, 3);
});

test('o executor continua o mês em vez de recomeçá-lo', async () => {
  const f = bancoFalso({ o1: { org: { nome: 'Um', limiteAssentos: 3 }, membros: tres } },
    { mes: '2026-10', orgs: { o1: { nome: 'Um', assentos: 7, pico: 7, acima: true } } });
  await rodarMedicao({ db: f.db, ler: f.ler, hoje: HOJE });
  assert.equal(f.escritas[0].d.orgs.o1.pico, 7);
  assert.equal(f.escritas[0].d.orgs.o1.assentos, 3);
});
