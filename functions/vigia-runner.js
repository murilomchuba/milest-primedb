'use strict';
/* ============ o executor do vigia ============
   A decisão mora em `vigia.js` e não conhece o mundo. Este arquivo é a volta
   pelo banco: achar os retratos, buscar o que falta, mandar o e-mail e marcar.

   Ele também não conhece o Firebase nem o Resend: tudo o que vem de fora
   chega como peça pela entrada (`mandar`, `apagar`, `caminho`, `ler`). É o que
   permite conferir aqui, com `npm test`, a única regra que não dá para
   verificar lendo: a marca só entra DEPOIS do envio dar certo. Um "já avisei"
   falso é pior do que avisar duas vezes — o aviso simplesmente nunca mais
   sai. */
const { decidirVigia } = require('./vigia');

const TETO = 300;

async function rodarVigia(o) {
  const db = o.db, hoje = o.hoje, agora = o.agora || Date.now();
  const teto = o.teto || TETO;
  const erro = o.erro || (() => { });
  const r = { hoje, retratos: 0, olhados: 0, enviados: 0, falhas: 0, semLista: 0, cortado: false };

  const snap = await db.collectionGroup('vigia').get();
  const cadastros = new Map();          // um get por empresa, não um por projeto

  for (const doc of snap.docs) {
    if (doc.id !== 'retrato') continue;
    r.retratos++;
    if (r.enviados >= teto) { r.cortado = true; break; }

    const ret = doc.data() || {};
    const projRef = doc.ref.parent.parent;
    if (!projRef) continue;
    const orgRef = projRef.parent.parent;
    const orgId = (orgRef && orgRef.id) || ret.orgId;
    if (!orgId) continue;

    if (!cadastros.has(orgId)) cadastros.set(orgId, await o.ler(db.doc('orgs/' + orgId)));
    const org = cadastros.get(orgId);
    if (!org) continue;
    r.olhados++;

    const marcasRef = projRef.collection('vigiaMarcas').doc('atual');
    let projeto, marcas;
    try {
      const [a, b] = await Promise.all([projRef.get(), marcasRef.get()]);
      if (!a.exists) continue;
      projeto = a.data() || {};
      marcas = b.exists ? (b.data() || {}) : {};
    } catch (e) { r.falhas++; continue; }

    let d;
    try { d = decidirVigia({ retrato: ret, projeto, org, marcas, hoje, agora }); }
    catch (e) { r.falhas++; erro('vigia: decisão falhou', orgId, projRef.id, e && e.message); continue; }

    /* Apagar uma marca é o FIM de uma cobrança — a atividade foi entregue, o
       projeto foi replanejado. Vale mesmo sem e-mail nenhum, e é o que faz a
       cobrança recomeçar do zero se o problema voltar. */
    const apagar = {};
    for (const k of Object.keys(d.marcas || {})) if (d.marcas[k] === null) apagar[k] = o.apagar();
    if (Object.keys(apagar).length) {
      try { await marcasRef.set(apagar, { merge: true }); } catch (e) { }
    }

    if (!d.enviar) { if (d.porque === 'sem destinatário') r.semLista++; continue; }

    let env;
    try {
      env = await o.mandar({
        para: d.para, assunto: o.assunto(d, ret),
        empresa: org.nome || 'MILEST', corpo: o.corpo(d, ret)
      });
    } catch (e) { env = { enviado: false, erro: (e && e.message) || 'erro no envio' }; }

    if (!env || !env.enviado) {
      r.falhas++;
      erro('vigia: envio falhou', orgId, projRef.id, env && env.erro);
      continue;                       // sem marca: amanhã tenta de novo
    }
    r.enviados++;

    const gravar = { ultimoEm: hoje };
    for (const k of Object.keys(d.marcas || {})) if (d.marcas[k] !== null) gravar[k] = d.marcas[k];
    try { await marcasRef.set(gravar, { merge: true }); }
    catch (e) { erro('vigia: não consegui marcar', orgId, projRef.id, e && e.message); }

    /* A faixa que escapou fica marcada no PROJETO, no mesmo campo em que o
       navegador marca — senão ele mandaria de novo na próxima abertura. Por
       caminho de campo, e não pelo objeto inteiro, para não apagar as outras
       faixas que já estavam lá. */
    const campos = [];
    const marcaFaixa = pct => ({ em: agora, para: d.para, pct: pct, por: 'vigia' });
    if (d.marcas.faixaHoras)
      campos.push(o.caminho('avisosHoras', String(d.marcas.faixaHoras.faixa)), marcaFaixa(d.horas.pct));
    if (d.marcas.faixaAvanco)
      campos.push(o.caminho('avisosAvanco', String(d.marcas.faixaAvanco.faixa)), marcaFaixa(d.avanco.pct));
    if (campos.length) {
      try { await projRef.update(...campos); }
      catch (e) { erro('vigia: não consegui marcar a faixa', orgId, projRef.id, e && e.message); }
    }
  }
  return r;
}

module.exports = { rodarVigia, TETO };
