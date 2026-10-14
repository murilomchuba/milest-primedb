'use strict';
/* ============ o resumo semanal da carteira ============

   Uma tabela, duas vezes por semana, para quem não abre o sistema: cliente,
   projeto, previsto, realizado, horas previstas e horas realizadas.

   O vigia manda UM e-mail POR PROJETO que precisa de atenção. Este manda UM
   e-mail POR EMPRESA, com a carteira inteira. É a diferença entre cobrar e
   informar, e por isso são duas peças e não uma.

   Como no vigia, nada aqui conhece o Firebase: a decisão recebe os dados e
   devolve o que mandar. Quem busca e envia é `resumo-runner.js`.

   Sobre a validade dos números: eles vêm do retrato, que o NAVEGADOR grava
   quando alguém abre o projeto. Um projeto que ninguém abriu há duas semanas
   traz números daquele dia. O previsto é o mais sensível, porque cresce com o
   calendário e o retrato o congelou — um projeto parado aparece com previsto
   baixo demais, ou seja, parecendo melhor do que está. Por isso cada linha
   leva a data da medição, e o rodapé diz o que ela significa. A alternativa
   seria recalcular o plano no servidor, o que exige levar o cronograma
   inteiro para lá; é outro projeto, e a decisão foi consciente. */

const soData = s => String(s == null ? '' : s).slice(0, 10);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function listaDeEmails(v) {
  const bruto = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[;,\s]+/);
  const vistos = new Set(), fora = [];
  for (const x of bruto) {
    const e = String(x || '').trim().toLowerCase();
    if (!e || !EMAIL.test(e) || vistos.has(e)) continue;
    vistos.add(e); fora.push(e);
    if (fora.length >= 20) break;
  }
  return fora;
}

/** A configuração da empresa, com os padrões. */
function configResumo(org) {
  const c = (org && org.resumoSemanal) || {};
  return {
    ativo: !!c.ativo,
    para: listaDeEmails(c.para),
    dias: Array.isArray(c.dias) && c.dias.length ? c.dias.filter(d => d >= 0 && d <= 6) : [1, 5],
    incluirPausados: !!c.incluirPausados
  };
}

/** Segunda é 1, sexta é 5 — o mesmo que `getUTCDay`. */
function diaDaSemana(iso) {
  const p = soData(iso).split('-');
  if (p.length !== 3) return null;
  const d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  return isNaN(d.getTime()) ? null : d.getUTCDay();
}

function diasEntre(de, ate) {
  const a = soData(de), b = soData(ate);
  if (!a || !b) return null;
  const x = Date.parse(a + 'T00:00:00Z'), y = Date.parse(b + 'T00:00:00Z');
  if (isNaN(x) || isNaN(y)) return null;
  return Math.round((y - x) / 86400000);
}

/** O dia em que o retrato foi tirado, como data ISO. */
function diaDoRetrato(ret) {
  const t = Number(ret && ret.em);
  if (!isFinite(t) || t <= 0) return '';
  return new Date(t).toISOString().slice(0, 10);
}

/* Ordena como a gerência lê: o pior primeiro. Quem está mais atrás do plano
   encabeça; sem previsto não há atraso que se meça, e esses vão para o fim. */
function atrasoDe(r) {
  if (r.planPct == null || !isFinite(r.planPct)) return Infinity;
  return (r.real || 0) - r.planPct;
}

function linhasDoResumo(retratos, cfg, hoje) {
  return (retratos || [])
    .filter(r => r && !r.encerrado && (cfg.incluirPausados || !r.pausado))
    .map(r => ({
      cliente: String(r.cliente || ''),
      nome: String(r.nome || 'Projeto'),
      pausado: !!r.pausado,
      planPct: (r.planPct == null || !isFinite(r.planPct)) ? null : r.planPct,
      real: (r.real == null || !isFinite(r.real)) ? null : r.real,
      horasPrev: Number(r.horasPrev) || 0,
      horasFeitas: Number(r.horasFeitas) || 0,
      medidoEm: diaDoRetrato(r),
      idade: diasEntre(diaDoRetrato(r), hoje)
    }))
    .sort((a, b) => atrasoDe(a) - atrasoDe(b));
}

/** Manda ou não, e para quem. */
function decidirResumo(entrada) {
  const org = entrada.org || {}, hoje = entrada.hoje;
  const cfg = configResumo(org);
  const fora = { manda: false, porque: '', para: [], linhas: [], cfg: cfg, hoje: hoje };

  if (!cfg.ativo) return nao(fora, 'desligado');
  if (!cfg.para.length) return nao(fora, 'sem destinatário');
  const dia = diaDaSemana(hoje);
  if (dia == null) return nao(fora, 'data inválida');
  if (!cfg.dias.includes(dia)) return nao(fora, 'hoje não é dia');

  const linhas = linhasDoResumo(entrada.retratos, cfg, hoje);
  if (!linhas.length) return nao(fora, 'nenhum projeto em andamento');

  fora.manda = true;
  fora.para = cfg.para;
  fora.linhas = linhas;
  return fora;
}

function nao(fora, porque) { fora.porque = porque; return fora; }

/* ---------------- o e-mail ---------------- */

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const num = (v, d) => (v == null || !isFinite(v)) ? '—' : Number(v).toFixed(d == null ? 0 : d).replace('.', ',');
const BR = s => { const p = soData(s).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0].slice(2) : '—'; };
const horas = v => !isFinite(v) || v <= 0 ? '—' : num(v) + ' h';

function assuntoResumo(d, nomeEmpresa) {
  const n = d.linhas.length;
  return '[Carteira] ' + (nomeEmpresa ? nomeEmpresa + ' — ' : '')
    + n + (n === 1 ? ' projeto' : ' projetos') + ' em ' + BR(d.hoje);
}

/* A cor do realizado contra o previsto é o único julgamento que o e-mail faz,
   e é o que permite ler a tabela de relance: vermelho é quem está atrás. */
function corDoAvanco(l) {
  if (l.planPct == null || l.real == null) return '#5A6B7B';
  const dif = l.real - l.planPct;
  if (dif >= -0.5) return '#1F7A4C';
  if (dif >= -10) return '#8A5A00';
  return '#B3322B';
}

function celula(txt, extra) {
  return '<td style="padding:8px 10px 8px 0;border-bottom:1px solid #F0F4F8;font-size:12.5px;' + (extra || '') + '">' + txt + '</td>';
}

function corpoResumo(d, nomeEmpresa) {
  const cab = ['Cliente', 'Projeto', 'Previsto', 'Realizado', 'H. prev.', 'H. real.', 'Medido em']
    .map((t, i) => '<th style="padding:0 10px 7px 0;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;'
      + 'color:#8A99A8;text-align:' + (i >= 2 && i <= 5 ? 'right' : 'left') + ';border-bottom:1px solid #E6ECF2;white-space:nowrap">'
      + t + '</th>').join('');

  const corpo = d.linhas.map(l => '<tr>'
    + celula(esc(l.cliente || '—'), 'color:#5A6B7B')
    + celula(esc(l.nome) + (l.pausado ? ' <span style="color:#8A99A8">(pausado)</span>' : ''), 'font-weight:600')
    + celula(num(l.planPct, 1) + '%', 'text-align:right;white-space:nowrap;color:#5A6B7B')
    + celula(num(l.real, 1) + '%', 'text-align:right;white-space:nowrap;font-weight:700;color:' + corDoAvanco(l))
    + celula(horas(l.horasPrev), 'text-align:right;white-space:nowrap;color:#5A6B7B')
    + celula(horas(l.horasFeitas), 'text-align:right;white-space:nowrap')
    + celula(esc(BR(l.medidoEm)), 'text-align:left;white-space:nowrap;color:#8A99A8;font-size:11.5px')
    + '</tr>').join('');

  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#17202A;background:#FFF;border:1px solid #E6ECF2;border-radius:10px;overflow:hidden">'
    + '<div style="background:#F3F7FA;padding:16px 20px;border-bottom:1px solid #E6ECF2">'
    + '<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#014479;font-weight:700">Resumo da carteira</div>'
    + '<div style="font-size:19px;font-weight:700;margin-top:4px;color:#014479">'
    + esc(nomeEmpresa || 'Projetos em andamento') + '</div>'
    + '<div style="font-size:13px;margin-top:6px;color:#5A6B7B">' + esc(BR(d.hoje))
    + ' · ' + d.linhas.length + (d.linhas.length === 1 ? ' projeto' : ' projetos') + '</div>'
    + '</div>'
    + '<div style="padding:16px 20px 18px">'
    + '<table style="width:100%;border-collapse:collapse"><thead><tr>' + cab + '</tr></thead>'
    + '<tbody>' + corpo + '</tbody></table>'
    + '<div style="font-size:12px;color:#8A99A8;margin-top:16px;line-height:1.5">'
    + 'Os números de cada projeto são os da última vez que ele foi aberto no MILEST — '
    + 'a coluna <b>Medido em</b> diz quando foi. O previsto cresce com o calendário, '
    + 'então num projeto medido há vários dias ele aparece menor do que já é hoje. '
    + 'Para um número do dia, basta abrir o projeto no sistema.'
    + '</div></div></div>';
}

module.exports = {
  decidirResumo, configResumo, linhasDoResumo, listaDeEmails,
  diaDaSemana, diaDoRetrato, corpoResumo, assuntoResumo
};
