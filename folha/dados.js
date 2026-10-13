/* Um projeto de demonstração plausível: consultoria de TI trocando o parque
   de estações de um cliente, em ondas. Números inventados, forma real — fase,
   marco, dependência, uma homologação que atrasou e empurrou o resto, e um
   avanço que NÃO bate com o plano. Projeto perfeito em screenshot não
   convence ninguém que já gerenciou um. */
export const MONTAR = () => {
  const T = []; let ord = 0;
  const t = (nome, nivel, dur, pct, dep, res) => {
    const id = 't' + (++ord);
    T.push(newTask({
      id: id, ord: ord, name: nome, level: nivel, dur: dur, pct: pct || 0,
      preds: dep ? [{ id: dep, type: 'FS', lag: 0 }] : [],
      res: res ? [{ rid: res, units: 100 }] : []
    }));
    return id;
  };
  t('1. Diagnóstico', 0, 1, 0);
  const a1 = t('Levantamento do parque instalado', 1, 10, 100, '', 'r1');
  t('Inventário de licenças', 1, 8, 100, '', 'r2');
  const a3 = t('Relatório de diagnóstico', 1, 5, 100, a1, 'r1');
  t('2. Desenho da solução', 0, 1, 0);
  const b1 = t('Arquitetura de destino', 1, 12, 100, a3, 'r3');
  const b2 = t('Plano de ondas de migração', 1, 8, 100, b1, 'r1');
  const b3 = t('Homologação com o cliente', 1, 6, 60, b2, 'r1');
  t('3. Migração', 0, 1, 0);
  const c1 = t('Onda 1 — matriz (42 máquinas)', 1, 15, 70, b3, 'r2');
  const c2 = t('Onda 2 — filial Sul (7 máquinas)', 1, 6, 20, c1, 'r2');
  const c3 = t('Onda 3 — filial Norte (12 máquinas)', 1, 8, 0, c2, 'r4');
  const go = t('Go-live do parque', 1, 0, 0, c3);
  t('4. Encerramento', 0, 1, 0);
  const d1 = t('Transferência de conhecimento', 1, 5, 0, go, 'r3');
  t('Termo de aceite', 1, 2, 0, d1);
  return { T, atrasou: b3 };
};

export const RECURSOS = [
  { id: 'r1', name: 'Ana Prado', capacity: 100, rate: 180 },
  { id: 'r2', name: 'Bruno Sá', capacity: 100, rate: 150 },
  { id: 'r3', name: 'Carla Nunes', capacity: 100, rate: 220 },
  { id: 'r4', name: 'Diego Alves', capacity: 100, rate: 150 }
];

/* Horas aceitas, do jeito que a aba Horas guarda fora do banco. */
export const HORAS = [
  ['2026-08-07', 'Ana Prado', 't2', 72], ['2026-08-14', 'Bruno Sá', 't3', 56],
  ['2026-08-21', 'Ana Prado', 't4', 38], ['2026-09-04', 'Carla Nunes', 't6', 96],
  ['2026-09-11', 'Ana Prado', 't7', 60], ['2026-09-25', 'Ana Prado', 't8', 44],
  ['2026-10-02', 'Bruno Sá', 't10', 88], ['2026-10-08', 'Bruno Sá', 't11', 16]
].map((x, i) => ({ id: 'h' + i, data: x[0], pessoa: x[1], tid: x[2], h: x[3], estado: 'aceito' }));
