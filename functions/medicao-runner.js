'use strict';
/* ============ o executor da medição ============
   A regra mora em `medicao.js`. Aqui é a volta pelo banco: ler o cadastro de
   todas as empresas, contar os assentos de cada uma e gravar UM documento do
   mês em `medicao/{AAAA-MM}`.

   Por que um documento por mês, fora da árvore das empresas:
   — faturar é olhar o mês inteiro de uma vez, e isso tem de ser UMA leitura,
     não uma por cliente;
   — o número que a fatura usa não pode morar onde o cliente escreve. Dentro de
     `orgs/{id}` ele seria legível pela própria empresa, e um dia alguém
     acharia que é campo de tela. Em `medicao/` as regras do Firestore recusam
     tudo pelo bloco final (`match /{documento=**} { allow read, write: if
     false; }`), então só o servidor chega lá — como no backup.

   Nada do mundo entra direto: `db`, `ler`, `hoje` e `erro` chegam pela
   entrada, que é o que permite testar a regra com `npm test`. */

const { mesDe, linhaDeEmpresa } = require('./medicao');
const { PAPEIS_ASSENTO } = require('./regras-acesso');

const TETO_EMPRESAS = 500;

async function rodarMedicao(o) {
  const db = o.db, hoje = o.hoje;
  const erro = o.erro || (() => { });
  const mes = mesDe(hoje);
  const r = { hoje, mes, empresas: 0, assentos: 0, acima: 0, falhas: 0, cortado: false };

  const snap = await db.collection('orgs').get();

  /* O documento do mês já começou a ser escrito nos dias anteriores: é dele
     que sai o `pico`. Sem esta leitura a medição viraria o retrato do dia e
     perderia o mês — justamente o que ela existe para não perder. */
  const antes = (await o.ler(db.doc('medicao/' + mes))) || {};
  const antesOrgs = antes.orgs || {};

  /* Começa do que já estava gravado, e não de um objeto vazio: empresa que o
     teto cortou, que falhou na leitura ou que foi excluída no meio do mês
     continua no documento com o que já havia. O mês é cobrado pelo que ele
     teve — perder uma linha por acidente seria perder dinheiro em silêncio. */
  const orgs = Object.assign({}, antesOrgs);
  for (const doc of snap.docs) {
    if (r.empresas >= TETO_EMPRESAS) { r.cortado = true; break; }
    const org = Object.assign({ id: doc.id }, doc.data() || {});
    r.empresas++;

    let membros = [];
    try {
      /* Filtrada pelos papéis que ocupam assento: numa empresa com 300
         analistas isto lê umas poucas linhas, não as 300. */
      const q = await db.collection('orgs/' + doc.id + '/members')
        .where('papel', 'in', PAPEIS_ASSENTO).get();
      membros = q.docs.map(d => d.data() || {});
    } catch (e) {
      /* Uma empresa que falha não derruba o mês das outras: a linha dela fica
         com o que já havia, e o erro aparece no console. */
      r.falhas++; erro('medicao: não li os membros', doc.id, e && e.message);
      continue;
    }

    const linha = linhaDeEmpresa({ org, membros, hoje, anterior: antesOrgs[doc.id] });
    orgs[doc.id] = linha;
    r.assentos += linha.assentos;
    if (linha.acima) r.acima++;
  }

  await db.doc('medicao/' + mes).set({ mes, em: Date.now(), hoje, orgs }, { merge: false });
  return r;
}

module.exports = { rodarMedicao, TETO_EMPRESAS };
