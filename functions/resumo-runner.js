'use strict';
/* ============ o executor do resumo semanal ============
   A decisão mora em `resumo.js`. Aqui é a volta pelo banco: juntar os retratos
   POR EMPRESA — e não por projeto, que é como o vigia anda —, ler o cadastro
   de cada uma, decidir e mandar um e-mail só.

   Como no vigia, nada do mundo entra direto: `mandar`, `ler` e `erro` chegam
   pela entrada, e é isso que permite testar com `npm test` a regra que não dá
   para verificar lendo — uma empresa com o resumo desligado não custa nenhuma
   leitura de projeto. */
const { decidirResumo, configResumo, corpoResumo, assuntoResumo } = require('./resumo');

const TETO_EMPRESAS = 200;

async function rodarResumo(o) {
  const db = o.db, hoje = o.hoje;
  const erro = o.erro || (() => { });
  const r = { hoje, retratos: 0, empresas: 0, desligadas: 0, enviados: 0, falhas: 0, semLista: 0, cortado: false };

  const snap = await db.collectionGroup('vigia').get();

  /* Um balde por empresa. O retrato não diz sozinho de que empresa é — diz,
     no campo `orgId`, mas o caminho é a fonte confiável quando os dois
     divergem, porque o campo é escrito pelo navegador. */
  const porOrg = new Map();
  for (const doc of snap.docs) {
    if (doc.id !== 'retrato') continue;
    r.retratos++;
    const projRef = doc.ref.parent.parent;
    if (!projRef) continue;
    const orgRef = projRef.parent.parent;
    const orgId = (orgRef && orgRef.id) || (doc.data() || {}).orgId;
    if (!orgId) continue;
    if (!porOrg.has(orgId)) porOrg.set(orgId, []);
    porOrg.get(orgId).push(doc.data() || {});
  }

  for (const [orgId, retratos] of porOrg) {
    if (r.enviados >= TETO_EMPRESAS) { r.cortado = true; break; }
    r.empresas++;

    const org = await o.ler(db.doc('orgs/' + orgId));
    if (!org) continue;

    /* Desligado é a maioria dos casos: sair antes de montar a tabela evita
       trabalho à toa para quem nunca pediu o resumo. */
    const cfg = configResumo(org);
    if (!cfg.ativo) { r.desligadas++; continue; }

    let d;
    try { d = decidirResumo({ org, retratos, hoje }); }
    catch (e) { r.falhas++; erro('resumo: decisão falhou', orgId, e && e.message); continue; }

    if (!d.manda) {
      if (d.porque === 'sem destinatário') r.semLista++;
      continue;
    }

    try {
      await o.mandar({
        para: d.para,
        assunto: assuntoResumo(d, org.nome || ''),
        corpo: corpoResumo(d, org.nome || '')
      });
      r.enviados++;
    } catch (e) { r.falhas++; erro('resumo: envio falhou', orgId, e && e.message); }
  }

  return r;
}

module.exports = { rodarResumo };
