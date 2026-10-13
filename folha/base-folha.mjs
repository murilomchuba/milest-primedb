/* Linha de base visual da folha de status.
   Desenha a folha de CINCO cenários com o código como ele está hoje e guarda
   SVG + PNG de cada um. Depois do refactor para a grade, `comparar-folha.mjs`
   gera os mesmos cinco e mede a diferença.

   Os cenários não são decorativos: cada um exercita uma regra especial da
   cascata atual, e são exatamente esses os caminhos que um refactor quebra
   sem avisar.
     normal       — o caso de todo dia
     pausado      — a faixa de pausa empurra o cabeçalho para baixo
     selo         — selo definido à mão: mais duas linhas no cabeçalho
     muitas-fases — 14 fases, estoura a negociação da coluna da direita
     magro        — sem linha de base, sem horas, sem textos: tudo vazio
*/
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ARQ = 'file:///mnt/user-data/uploads/Milest/cronograma.html';
const SAIDA = process.argv[2] || 'base';
mkdirSync(SAIDA, { recursive: true });

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pag = await nav.newPage({ viewport: { width: 1680, height: 900 }, deviceScaleFactor: 2 });
const erros = [];
pag.on('pageerror', e => erros.push(e.message));
await pag.addInitScript(() => { try { localStorage.setItem('milest.aviso.auto', '0'); } catch (e) {} });
await pag.goto(ARQ);
await pag.waitForFunction(() => typeof window.desenharStatusReport === 'function'
  && typeof window.computeSchedule === 'function' && typeof window.newTask === 'function');

/* O rodapé escreve "Gerado em <hoje>". Sem congelar o dia, a linha de base
   capturada hoje acusa diferença amanhã — e um teste que falha sozinho com o
   calendário é pior que teste nenhum, porque ensina a ignorá-lo. */
await pag.evaluate(() => { window.todayISO = () => '2026-10-13'; });

const dados = readFileSync('dados.js', 'utf8')
  .replace(/^export const /gm, 'window.').replace(/window\.newTask/g, 'newTask');

const CENARIOS = ['normal', 'pausado', 'selo', 'muitas-fases', 'magro'];

for (const cen of CENARIOS) {
  const r = await pag.evaluate(({ src, cen }) => {
    eval(src);

    /* ---- o projeto base, igual em todos os cenários ---- */
    const montar = () => {
      const { T, atrasou } = MONTAR();
      const meta = Object.assign(newMeta('Modernização do parque de TI'), {
        client: 'Grupo Meridiano',
        start: '2026-08-03', statusDate: '2026-10-09', statusFixa: true,
        horasPrev: 640,
        resumo: 'Substituição do parque de estações de trabalho das cinco unidades, em ondas, com inventário de licenças e transferência de conhecimento ao time interno.',
        conquistas: 'Relatório de diagnóstico aprovado.\nArquitetura de destino fechada com a TI do cliente.\nOnda 1 em 70% — 29 das 42 máquinas migradas.',
        andamento: 'Onda 1 — matriz (42 máquinas), 70%.\nOnda 2 — filial Sul, início previsto 20/10.\nTransferência de conhecimento a partir de 10/11.',
        riscos: 'Licença do antivírus vence antes da Onda 3.\nFirewall da filial Sul bloqueia a porta usada na cópia dos perfis.\nHomologação do cliente levou o dobro do previsto.'
      });
      meta.horas = HORAS;
      const P = { meta, tasks: sortTasks(T), resources: RECURSOS, equipe: [] };
      const plano = computeSchedule(P);
      for (const t of P.tasks) {
        const o = plano.out.get(t.id);
        t.bl = { start: o.start, finish: o.finish, dur: o.D, cost: o.cost, work: o.work };
      }
      meta.baselineAt = '2026-08-03';
      const h = P.tasks.find(x => x.id === atrasou);
      if (h) h.dur = 12;
      return P;
    };

    const P = montar();
    const m = P.meta;

    if (cen === 'pausado') {
      m.pausadoEm = '2026-09-22';
      m.pausaMotivo = 'Aguardando o cliente liberar a janela de parada da filial Sul.';
      m.pausaRetomaEm = '2026-11-03';
    }

    if (cen === 'selo') {
      m.statusManual = 'critico';
      m.statusMotivo = 'O cliente ainda não comprou os certificados, e o go-live de 17/11 está em risco.';
    }

    if (cen === 'muitas-fases') {
      /* Catorze fases: é o número em que a coluna da direita para de caber e a
         negociação entre ENTREGAS e "Em Andamento" entra em ação — aperta o
         passo, diminui a fonte e, no limite, escreve "e mais N fases…". */
      const T = []; let ord = 0;
      for (let f = 1; f <= 14; f++) {
        T.push(newTask({ id: 'f' + f, ord: ++ord, name: f + '. Fase de nome razoavelmente longo ' + f, level: 0, dur: 1, pct: 0 }));
        T.push(newTask({
          id: 'f' + f + 'a', ord: ++ord, name: 'Atividade da fase ' + f, level: 1,
          dur: 5, pct: f <= 6 ? 100 : (f === 7 ? 40 : 0),
          preds: f > 1 ? [{ id: 'f' + (f - 1) + 'a', type: 'FS', lag: 0 }] : [],
          res: [{ rid: 'r' + ((f % 4) + 1), units: 100 }]
        }));
      }
      P.tasks = sortTasks(T);
      const plano = computeSchedule(P);
      for (const t of P.tasks) {
        const o = plano.out.get(t.id);
        t.bl = { start: o.start, finish: o.finish, dur: o.D, cost: o.cost, work: o.work };
      }
    }

    if (cen === 'magro') {
      m.resumo = ''; m.riscos = ''; m.conquistas = ''; m.andamento = '';
      m.horasPrev = 0; m.horas = [];
      m.baselineAt = '';
      for (const t of P.tasks) delete t.bl;
    }

    ST.P = P;
    ST.sch = computeSchedule(P);

    const svg = desenharStatusReport();
    const txt = new XMLSerializer().serializeToString(svg);

    return { svg: txt, nTarefas: P.tasks.length };
  }, { src: dados, cen });

  writeFileSync(SAIDA + '/' + cen + '.svg', r.svg);

  /* Rasteriza no próprio navegador: o PNG é o que a comparação depois mede,
     porque o SVG vai mudar de coordenadas por desenho e mesmo assim precisa
     produzir a mesma imagem. */
  const png = await pag.evaluate(async (txt) => {
    const url = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = await new Promise((ok, err) => {
        const im = new Image(); im.onload = () => ok(im);
        im.onerror = () => err(new Error('nao desenhou')); im.src = url;
      });
      const ESC = 2, cv = document.createElement('canvas');
      cv.width = 960 * ESC; cv.height = 540 * ESC;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#FFFFFF'; cx.fillRect(0, 0, cv.width, cv.height);
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/png');
    } finally { URL.revokeObjectURL(url); }
  }, r.svg);

  writeFileSync(SAIDA + '/' + cen + '.png', Buffer.from(png.split(',')[1], 'base64'));
  console.log('  ' + cen.padEnd(14) + r.nTarefas + ' atividades · ' + Math.round(r.svg.length / 1024) + ' kB de SVG');
}

await nav.close();
console.log(erros.length ? 'ERROS DE PÁGINA: ' + erros.slice(0, 3).join(' | ') : 'sem erros de página');
