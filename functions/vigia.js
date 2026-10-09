'use strict';
/* ============ o vigia ============
   O servidor do MILEST não calcula cronograma. CPM, avanço planejado e os
   índices vivem no `app.src.html`, e reimplementá-los aqui seria manter duas
   contas para a mesma pergunta — no dia em que discordassem, ninguém saberia
   em qual acreditar.

   Mas há avisos que só o servidor pode dar, porque dependem do RELÓGIO e não
   de alguém mexer no projeto: a atividade que venceu ontem, o projeto que
   passou do término previsto. Esses nunca saem de dentro do navegador, porque
   ninguém abre o sistema para descobri-los — é justamente o projeto esquecido.

   A saída: o navegador deixa um retrato do PLANO em
   `orgs/{org}/projects/{pid}/vigia/retrato`, e este módulo compara o plano com
   o calendário. O retrato guarda só o que não anda sozinho com o relógio
   (avanço, horas, datas previstas), então um retrato de três semanas atrás
   continua exato para estas decisões.

   Aqui não há rede, banco nem Firebase: só dados entrando e uma decisão
   saindo. É o que torna este arquivo testável com `node --test`, que é como
   todas as regras do servidor do MILEST são conferidas. */

const DIA = 86400000;
const MAX_LISTA = 40;      // quantas atrasadas entram no e-mail
const MAX_IDS = 200;       // quantas ficam na marca, para saber o que é novo

const soData = s => String(s == null ? '' : s).slice(0, 10);

/** Dias inteiros entre duas datas ISO. null quando uma delas não é data. */
function diasEntre(de, ate) {
  const a = Date.parse(soData(de) + 'T00:00:00Z');
  const b = Date.parse(soData(ate) + 'T00:00:00Z');
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.round((b - a) / DIA);
}

const limitar = (v, min, max, pad) => {
  const n = Math.round(Number(v) || 0);
  return (n >= min && n <= max) ? n : pad;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mesma leitura do navegador: texto ou lista, aceita as duas. */
function listaDeEmails(v) {
  const bruto = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[;,\s]+/);
  const fora = [];
  for (const x of bruto) {
    const e = String(x == null ? '' : x).trim().toLowerCase();
    if (e && EMAIL.test(e) && !fora.includes(e)) fora.push(e);
  }
  return fora.slice(0, 20);
}

function faixasDe(v, padrao) {
  const f = Array.isArray(v) && v.length ? v : padrao;
  return [...new Set(f.map(x => Math.round(Number(x) || 0)).filter(x => x > 0 && x <= 500))]
    .sort((a, b) => a - b);
}

/* A faixa mais alta que o número já passou e que ninguém avisou — ou null.

   Isto NÃO é uma segunda cópia do cálculo: o número (consumo, avanço) vem
   pronto do retrato, feito pelo navegador. O que está aqui é a comparação com
   um limite, que é aritmética, não modelo. */
function faixaEscapada(pct, faixas, jaFoi) {
  if (!isFinite(pct)) return null;
  const passadas = faixas.filter(f => pct + 1e-6 >= f);
  if (!passadas.length) return null;
  const alvo = passadas[passadas.length - 1];
  return (jaFoi && jaFoi[String(alvo)]) ? null : alvo;
}

/* Quem recebe: a lista do projeto manda; sem ela, a da empresa. Mesma regra
   do navegador, de propósito — dois lugares com listas diferentes para o mesmo
   projeto seria o jeito de alguém parar de receber sem ninguém perceber. */
function destinatarios(retrato, org) {
  const doProjeto = listaDeEmails(retrato && retrato.avisoHorasPara);
  if (doProjeto.length) return doProjeto;
  return listaDeEmails(org && org.avisoHoras && org.avisoHoras.para);
}

/* Algum aviso ligado nesta empresa? Serve para o executor parar ANTES de ler
   o projeto e as marcas: sem isto, uma empresa que nunca ligou nada pagaria
   três leituras por projeto todo dia de manhã para o vigia concluir que não
   tem nada a fazer. */
function avisoLigado(org) {
  const o = org || {};
  return !!(o.avisoPrazo && o.avisoPrazo.ativo === true)
      || !!(o.avisoHoras && o.avisoHoras.ativo === true)
      || !!(o.avisoAvanco && o.avisoAvanco.ativo === true);
}

/* A decisão.

   Entra: o retrato (navegador), as marcas do próprio vigia, o documento do
   projeto (de onde saem as faixas já avisadas pelo navegador), a configuração
   da empresa e a data de hoje. Sai: um aviso só por projeto, com todos os
   motivos juntos — dois e-mails na mesma manhã sobre o mesmo projeto é como
   um aviso automático deixa de ser lido. */
function decidirVigia(entrada) {
  const e = entrada || {};
  const ret = e.retrato || {};
  const marcas = e.marcas || {};
  const proj = e.projeto || {};
  const org = e.org || {};
  const hoje = soData(e.hoje);

  const fora = { motivos: [], atrasadas: [], marcas: {}, para: [] };
  if (ret.v !== 1) return nao(fora, 'retrato de outra versão');
  if (!hoje || diasEntre(hoje, hoje) === null) return nao(fora, 'sem data');
  if (ret.pausado) return nao(fora, 'projeto pausado');
  if (ret.encerrado) return nao(fora, 'projeto encerrado');

  /* Empresa desligada não recebe nada, e empresa com o prazo vencido também
     não: ela continua lendo os próprios dados, mas mandar cobrança automática
     para quem já saiu é o tipo de e-mail que vira reclamação. */
  if (org.ativo === false) return nao(fora, 'empresa desligada');
  const expira = Number(org.expiraEm) || 0;
  if (expira > 0 && Number(e.agora || 0) > expira) return nao(fora, 'prazo da empresa vencido');

  const para = destinatarios(ret, org);
  fora.para = para;

  const cfgP = {
    ativo: !!(org.avisoPrazo && org.avisoPrazo.ativo === true),
    dias: limitar(org.avisoPrazo && org.avisoPrazo.dias, 1, 90, 7)
  };
  const venceu = !!(ret.fim && ret.fim < hoje);

  // ---- o projeto passou do término previsto ---------------------------------
  const mPrazo = marcas.prazo || null;
  if (cfgP.ativo && venceu && (Number(ret.real) || 0) < 99.5) {
    /* Uma vez por data de término. Replanejar muda `fim`, e aí volta a valer:
       é uma promessa nova, que também pode ser quebrada. */
    if (!mPrazo || mPrazo.fim !== ret.fim) {
      fora.motivos.push('prazo');
      fora.diasEstouro = diasEntre(ret.fim, hoje);
      fora.marcas.prazo = { fim: ret.fim, em: hoje };
    }
  }
  if (!venceu && mPrazo) fora.marcas.prazo = null;   // replanejou para a frente

  // ---- atividades que venceram e seguem abertas -----------------------------
  const atraso = (ret.abertas || [])
    .filter(a => a && a.fim && a.fim < hoje)
    .map(a => ({ id: a.id, nome: a.nome, fim: a.fim, pct: a.pct, dias: diasEntre(a.fim, hoje) }))
    .sort((a, b) => (b.dias - a.dias) || String(a.nome).localeCompare(String(b.nome)));
  const mAtr = marcas.atrasadas || null;
  if (cfgP.ativo && atraso.length) {
    const antes = (mAtr && Array.isArray(mAtr.ids)) ? mAtr.ids : [];
    const novas = atraso.filter(a => !antes.includes(a.id));
    /* Repete só depois do intervalo — quem cobra todo dia deixa de ser lido.
       Mas uma atividade que venceu HOJE é notícia, e fura o intervalo. */
    const passou = (mAtr && mAtr.em) ? (diasEntre(mAtr.em, hoje) >= cfgP.dias) : true;
    if (novas.length || passou) {
      fora.motivos.push('atrasadas');
      fora.atrasadas = atraso.slice(0, MAX_LISTA);
      fora.nAtrasadas = atraso.length;
      fora.nNovas = novas.length;
      /* Sem aviso anterior, TODAS são "novas" — e dizer "3 venceram desde o
         último aviso" quando não houve último aviso é uma frase que não é
         verdade. O e-mail só fala em novidade quando há com o que comparar. */
      fora.primeiroAviso = !mAtr;
      fora.marcas.atrasadas = { em: hoje, ids: atraso.slice(0, MAX_IDS).map(a => a.id) };
    }
  }
  if (!atraso.length && mAtr) fora.marcas.atrasadas = null;

  // ---- rede de segurança: a faixa que o navegador não conseguiu mandar ------
  /* Só a partir do dia seguinte ao retrato. No mesmo dia, quem mexeu no
     projeto ainda estava na tela e o navegador já cuidou — avisar aqui seria
     correr com ele, não cobrir a falta dele. */
  const retratoDe = soData(new Date(Number(ret.em) || 0).toISOString());
  const velho = diasEntre(retratoDe, hoje);
  if (velho != null && velho >= 1) {
    const cfgH = org.avisoHoras || {}, cfgA = org.avisoAvanco || {};
    if (cfgH.ativo === true && Number(ret.horasPrev) > 0) {
      const pct = Number(ret.horasFeitas) / Number(ret.horasPrev) * 100;
      const f = faixaEscapada(pct, faixasDe(cfgH.faixas, [50, 70, 90, 100]), proj.avisosHoras);
      if (f) {
        fora.motivos.push('horas');
        fora.horas = { faixa: f, pct: Math.round(pct * 10) / 10, feitas: Number(ret.horasFeitas), prev: Number(ret.horasPrev) };
        fora.marcas.faixaHoras = { faixa: f, em: hoje };
      }
    }
    if (cfgA.ativo === true) {
      const f = faixaEscapada(Number(ret.real), faixasDe(cfgA.faixas, [25, 50, 75, 90, 100]), proj.avisosAvanco);
      if (f) {
        fora.motivos.push('avanco');
        fora.avanco = { faixa: f, pct: Math.round((Number(ret.real) || 0) * 10) / 10 };
        fora.marcas.faixaAvanco = { faixa: f, em: hoje };
      }
    }
  }

  if (!fora.motivos.length) return fora;
  /* Sem ninguém para receber, não há aviso — e, principalmente, não há marca:
     cadastrar a lista amanhã tem de fazer o aviso sair, não encontrá-lo já
     dado por avisado. */
  if (!para.length) return nao({ motivos: [], atrasadas: [], marcas: {}, para: [] }, 'sem destinatário');

  fora.enviar = true;
  fora.retratoDe = retratoDe;
  fora.diasDoRetrato = velho;
  return fora;
}

function nao(fora, porque) { fora.porque = porque; return fora; }

/* ============ o e-mail ============
   Mesma moldura dos avisos que saem do navegador, porque chegam na mesma
   caixa e a pessoa não deveria notar de onde cada um veio. A diferença é o
   carimbo: tudo o que anda com o calendário aparece com a data do retrato. */

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const num = (v, d) => (v == null || !isFinite(v)) ? '—' : Number(v).toFixed(d == null ? 0 : d).replace('.', ',');
const BR = s => { const p = soData(s).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0].slice(2) : '—'; };
const plural = (n, um, muitos) => n === 1 ? um : muitos;

function linha(rot, valor, nota) {
  return '<tr>'
    + '<td style="padding:9px 0;border-bottom:1px solid #E6ECF2;font-size:13px;color:#5A6B7B">' + rot + '</td>'
    + '<td style="padding:9px 0;border-bottom:1px solid #E6ECF2;font-size:15px;font-weight:700;text-align:right;white-space:nowrap">' + valor + '</td>'
    + '</tr>'
    + (nota ? '<tr><td colspan="2" style="padding:0 0 9px;font-size:11.5px;color:#8A99A8">' + nota + '</td></tr>' : '');
}

function tituloVigia(d) {
  if (d.motivos.includes('prazo'))
    return 'O projeto passou do término previsto';
  if (d.motivos.includes('atrasadas'))
    return d.nAtrasadas + ' ' + plural(d.nAtrasadas, 'atividade venceu', 'atividades venceram') + ' e ' + plural(d.nAtrasadas, 'segue aberta', 'seguem abertas');
  return 'Um aviso deste projeto não tinha chegado a sair';
}

function assuntoVigia(d, ret) {
  const nome = (ret.cliente ? ret.cliente + ' · ' : '') + (ret.nome || 'Projeto');
  if (d.motivos.includes('prazo')) return '[Prazo estourado] ' + nome;
  if (d.motivos.includes('atrasadas'))
    return '[' + d.nAtrasadas + ' ' + plural(d.nAtrasadas, 'atividade vencida', 'atividades vencidas') + '] ' + nome;
  return '[Aviso pendente] ' + nome;
}

/* A lista das vencidas. É o conteúdo que torna o e-mail acionável: sem ela,
   "3 atividades venceram" obriga a pessoa a abrir o sistema para descobrir
   quais — e abrir o sistema é justamente o que ela não estava fazendo. */
function tabelaAtrasadas(d) {
  if (!d.atrasadas.length) return '';
  const linhas = d.atrasadas.map(a =>
    '<tr>'
    + '<td style="padding:7px 10px 7px 0;border-bottom:1px solid #F0F4F8;font-size:13px">' + esc(a.nome) + '</td>'
    + '<td style="padding:7px 0;border-bottom:1px solid #F0F4F8;font-size:12px;color:#8A99A8;white-space:nowrap">' + esc(BR(a.fim)) + '</td>'
    + '<td style="padding:7px 0 7px 10px;border-bottom:1px solid #F0F4F8;font-size:12.5px;font-weight:700;text-align:right;white-space:nowrap;color:#B3322B">'
    + a.dias + ' ' + plural(a.dias, 'dia', 'dias') + '</td>'
    + '<td style="padding:7px 0 7px 10px;border-bottom:1px solid #F0F4F8;font-size:12px;color:#8A99A8;text-align:right;white-space:nowrap">' + num(a.pct) + '%</td>'
    + '</tr>').join('');
  const resto = d.nAtrasadas > d.atrasadas.length
    ? '<div style="font-size:11.5px;color:#8A99A8;margin-top:8px">e mais ' + (d.nAtrasadas - d.atrasadas.length) + ' no sistema.</div>'
    : '';
  return '<div style="margin-top:18px">'
    + '<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5A6B7B;font-weight:700;margin-bottom:6px">O que venceu</div>'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<tr><th style="text-align:left;padding:0 10px 6px 0;font-size:11px;color:#8A99A8;font-weight:400">Atividade</th>'
    + '<th style="text-align:left;padding:0 0 6px;font-size:11px;color:#8A99A8;font-weight:400">Prevista</th>'
    + '<th style="text-align:right;padding:0 0 6px 10px;font-size:11px;color:#8A99A8;font-weight:400">Atraso</th>'
    + '<th style="text-align:right;padding:0 0 6px 10px;font-size:11px;color:#8A99A8;font-weight:400">Feito</th></tr>'
    + linhas + '</table>' + resto + '</div>';
}

function corpoVigia(d, ret) {
  const grave = d.motivos.includes('prazo');
  const cor = grave ? '#B3322B' : '#8A5200';
  const fundo = grave ? '#FBE6E4' : '#FFF1DC';
  const hPct = Number(ret.horasPrev) > 0 ? Number(ret.horasFeitas) / Number(ret.horasPrev) * 100 : null;
  const carimbo = 'no retrato de ' + esc(BR(d.retratoDe));

  let corpo = '';
  if (d.motivos.includes('prazo'))
    corpo += linha('Término previsto', esc(BR(ret.fim)),
      'passou há ' + d.diasEstouro + ' ' + plural(d.diasEstouro, 'dia', 'dias') + ', e o projeto não foi encerrado');
  if (d.motivos.includes('atrasadas'))
    corpo += linha('Atividades vencidas', String(d.nAtrasadas),
      ((d.nNovas && !d.primeiroAviso) ? d.nNovas + ' ' + plural(d.nNovas, 'venceu', 'venceram') + ' desde o último aviso · ' : '')
      + 'a mais antiga há ' + d.atrasadas[0].dias + ' ' + plural(d.atrasadas[0].dias, 'dia', 'dias'));
  if (d.motivos.includes('horas'))
    corpo += linha('Horas consumidas', num(d.horas.pct, 1) + '%',
      'passou da faixa de ' + d.horas.faixa + '% e o aviso não tinha saído · '
      + num(d.horas.feitas) + ' h de ' + num(d.horas.prev) + ' h previstas');
  else if (hPct != null)
    corpo += linha('Horas consumidas', num(hPct, 1) + '%',
      num(ret.horasFeitas) + ' h de ' + num(ret.horasPrev) + ' h previstas · ' + carimbo);
  if (d.motivos.includes('avanco'))
    corpo += linha('Avanço físico', num(d.avanco.pct, 1) + '%',
      'passou da faixa de ' + d.avanco.faixa + '% e o aviso não tinha saído · ' + carimbo);
  else
    corpo += linha('Avanço físico', num(ret.real, 1) + '%', carimbo);
  corpo += linha('IDP — prazo', ret.IDP == null ? '—' : num(ret.IDP, 2), carimbo + ', e este anda com o calendário')
    + linha('IDC — custo', ret.IDC == null ? '—' : num(ret.IDC, 2), carimbo);

  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#17202A;background:#FFF;border:1px solid #E6ECF2;border-radius:10px;overflow:hidden">'
    + '<div style="background:' + fundo + ';padding:16px 20px;border-bottom:1px solid #E6ECF2">'
    + '<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:' + cor + ';font-weight:700">Conferência diária</div>'
    + '<div style="font-size:19px;font-weight:700;margin-top:4px;color:' + cor + '">' + esc(tituloVigia(d)) + '</div>'
    + '<div style="font-size:14px;margin-top:6px">' + esc((ret.cliente ? ret.cliente + ' · ' : '') + (ret.nome || 'Projeto')) + '</div>'
    + '</div>'
    + '<div style="padding:4px 20px 18px">'
    + '<table style="width:100%;border-collapse:collapse">' + corpo + '</table>'
    + tabelaAtrasadas(d)
    + '<div style="font-size:12px;color:#8A99A8;margin-top:16px;line-height:1.5">'
    + 'Conferência automática do MILEST, feita todo dia de manhã pelo servidor — '
    + 'por isso ela alcança o projeto que ninguém abriu. '
    + 'As datas e o avanço vêm do plano como ele estava em ' + esc(BR(d.retratoDe))
    + ' e não mudam sozinhos; o IDP e o IDC andam com o calendário, então são daquele dia. '
    + 'Para desligar ou mudar o intervalo: aba Usuários, Avisos automáticos.</div>'
    + '</div></div>';
}

module.exports = { decidirVigia, avisoLigado, diasEntre, listaDeEmails, faixaEscapada, faixasDe, destinatarios, corpoVigia, assuntoVigia, tituloVigia };

