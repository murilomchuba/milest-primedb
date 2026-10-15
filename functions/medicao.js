'use strict';
/* ============ medição de assentos ============
   De onde sai a fatura.

   A trava em `regras-acesso.js` impede o acidente e o atalho: ninguém ganha um
   login de assento acima do limite. Mas há um caminho que as regras do
   Firestore não alcançam — e é melhor dizer isso em voz alta do que fingir que
   não existe: o administrador da empresa pode cadastrar alguém como analista
   (que não ocupa assento) e DEPOIS trocar o papel para gerente, numa escrita
   comum no documento do membro. As regras do Firestore não sabem contar
   documentos de uma coleção, então não há como barrar isso lá.

   Este módulo é a resposta: todo dia o servidor conta quantos assentos cada
   empresa REALMENTE tem e guarda o maior número do mês. Quem promover para
   furar o limite não fica invisível — fica registrado exatamente no número de
   que a fatura sai. O controle deixa de ser um muro e passa a ser uma medição,
   que é o que a cobrança precisa de verdade.

   O `pico` existe por isso: um retrato do dia 1º não diria nada sobre uma
   empresa que subiu para 9 assentos no dia 10 e voltou para 3 no dia 28. O
   mês é cobrado pelo que ele teve, não pelo que sobrou dele.

   Função pura: recebe o que já foi lido e devolve a linha. `medicao-runner.js`
   faz a volta pelo banco. */

const { PAPEIS_ASSENTO, contarAssentos } = require('./regras-acesso');

/** 'YYYY-MM-DD' -> 'YYYY-MM'. O mês é o do fuso de São Paulo, que é quem
 *  decide a virada: o agendamento roda em America/Sao_Paulo. */
function mesDe(hoje) {
  return String(hoje || '').slice(0, 7);
}

/**
 * A linha de uma empresa no mês.
 *   org       orgs/{id}, com `id`
 *   membros   os membros já lidos (a consulta pode vir filtrada por papel;
 *             `contarAssentos` filtra de novo, então vir inteira também serve)
 *   hoje      'YYYY-MM-DD'
 *   anterior  a linha desta mesma empresa já gravada neste mês (ou null)
 *
 * `limite` 0 significa sem limite, igual ao `expiraEm`. `acima` é verdade
 * quando o pico do mês passou do limite — é o que se procura na hora de
 * faturar, e o que denuncia a promoção que furou a trava.
 */
function linhaDeEmpresa(p) {
  const org = p.org || {};
  const assentos = contarAssentos(p.membros);
  const limite = Number(org.limiteAssentos || 0);
  const antes = p.anterior || {};
  const pico = Math.max(assentos, Number(antes.pico || 0));
  return {
    nome: String(org.nome || org.id || ''),
    plano: String(org.plano || ''),
    limite: limite,
    assentos: assentos,
    pico: pico,
    /* Os dois números que a própria empresa escreve sobre si mesma. Ficam aqui
       ao lado, para conferência, e NUNCA entram na conta: quem os escreve é o
       navegador do cliente. Divergência grande entre `usuarios` e o que o
       servidor contou é sinal de tela velha, não de fraude. */
    usuarios: org.usuarios == null ? null : Number(org.usuarios),
    projetos: org.projetos == null ? null : Number(org.projetos),
    ativa: org.ativo !== false,
    acima: limite > 0 && pico > limite,
    em: p.hoje || ''
  };
}

/** O que cobrar de uma empresa no mês: o pico, nunca menos que o contratado.
 *  Separado de propósito — é a regra comercial, e vai mudar sem que o resto
 *  mude. Hoje: paga-se pelo que se contratou, e pelo excedente se houver. */
function assentosACobrar(linha) {
  const l = linha || {};
  const limite = Number(l.limite || 0);
  const pico = Number(l.pico || 0);
  if (!limite) return pico;                 // sem limite: paga pelo que usou
  return Math.max(limite, pico);            // com limite: o contratado, ou o excedente
}

/** As empresas que passaram do contratado neste mês. É a lista para onde olhar
 *  antes de faturar — e para ligar para o cliente, que normalmente não sabe. */
function excedentes(doc) {
  const orgs = (doc && doc.orgs) || {};
  return Object.keys(orgs)
    .filter(id => orgs[id] && orgs[id].acima)
    .map(id => ({ orgId: id, nome: orgs[id].nome, limite: orgs[id].limite, pico: orgs[id].pico,
      excedente: orgs[id].pico - orgs[id].limite }))
    .sort((a, b) => b.excedente - a.excedente);
}

module.exports = { mesDe, linhaDeEmpresa, assentosACobrar, excedentes, PAPEIS_ASSENTO };
