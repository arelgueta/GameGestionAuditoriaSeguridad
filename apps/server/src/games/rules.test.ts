import { describe, expect, it } from 'vitest';
import { scoreAnswer } from './phish.js';
import { trustOf } from './crisis.js';
import { basketTotal, dealCards, evaluateBasket, expectedLoss } from './boardroom.js';
import { normalizeWord, rankEscape } from './escape.js';
import { aiCost, referenceMatch } from './shadowit.js';
import { aggregateVerdict } from './juicio.js';
import { toCsv } from '@ciberjunta/shared';
import boardroom from '../../../../content/boardroom.json' with { type: 'json' };
import crisis from '../../../../content/crisis.json' with { type: 'json' };
import shadowit from '../../../../content/shadowit.json' with { type: 'json' };

describe('phish: puntaje', () => {
  it('+100 por acierto, +50 por señal, bonus de velocidad lineal', () => {
    expect(scoreAnswer({ choice: 'PHISH', at: 0, signal: 2 }, 'PHISH', 2, 0, 25).points).toBe(200);
    const half = scoreAnswer({ choice: 'PHISH', at: 12_500, signal: 1 }, 'PHISH', 2, 0, 25);
    expect(half).toMatchObject({ points: 125, bonus: 25, signalCorrect: false });
    expect(
      scoreAnswer({ choice: 'PHISH', at: 30_000, signal: null }, 'PHISH', 2, 0, 25).points,
    ).toBe(100);
  });
  it('si erran PHISH/FISH no suman nada, aunque acierten la señal', () => {
    expect(scoreAnswer({ choice: 'FISH', at: 0, signal: 2 }, 'PHISH', 2, 0, 25).points).toBe(0);
    expect(scoreAnswer(undefined, 'PHISH', 2, 0, 25).points).toBe(0);
  });
});

describe('crisis: confianza del mercado', () => {
  const c = crisis as Parameters<typeof trustOf>[0];
  it('suma los puntos de cada opción y resta 10 por cada inject sin decisión', () => {
    const runs: Parameters<typeof trustOf>[1] = [
      {
        index: 0,
        startedAt: 0,
        endsAt: 1,
        closed: true,
        decisions: { g1: { option: 'A', justification: '', at: 0 } },
      },
      { index: 1, startedAt: 0, endsAt: 1, closed: true, decisions: {} },
      {
        index: 2,
        startedAt: 0,
        endsAt: 1,
        closed: true,
        decisions: { g1: { option: 'B', justification: '', at: 0 } },
      },
    ];
    expect(trustOf(c, runs, 'g1')).toBe(100 + 10 - 10 - 15);
    expect(trustOf(c, runs, 'g2')).toBe(70);
  });
  it('un inject abierto sin decisión todavía no resta', () => {
    expect(
      trustOf(c, [{ index: 0, startedAt: 0, endsAt: 1, closed: false, decisions: {} }], 'g1'),
    ).toBe(100);
  });
});

describe('boardroom', () => {
  const c = boardroom as Parameters<typeof evaluateBasket>[2];
  const longText = 'x'.repeat(220);
  it('incluir a Hackers Shadow es alerta roja', () => {
    expect(evaluateBasket(['A', 'B-web'], '', c).level).toBe('red');
  });
  it('solo AutoScan es alerta amarilla', () => {
    expect(evaluateBasket(['C'], '', c).level).toBe('yellow');
  });
  it('B-web, B-web + C y B-full con fondos justificados son verdes', () => {
    expect(evaluateBasket(['B-web'], '', c).level).toBe('green');
    expect(evaluateBasket(['B-web', 'C'], longText, c).level).toBe('green');
    expect(evaluateBasket(['B-full'], longText, c).level).toBe('green');
  });
  it('B-full sin pedido de fondos se pasa del presupuesto', () => {
    expect(evaluateBasket(['B-full'], '', c).level).toBe('yellow');
  });
  it('C cuesta 12 meses de abono', () => {
    expect(basketTotal(['C'], c.providers)).toBe(4800);
    expect(basketTotal(['B-web', 'C'], c.providers)).toBe(14300);
  });
  it('calculadora: valores por defecto 57.600 vs 1.500', () => {
    expect(expectedLoss(boardroom.calcDefaults)).toEqual({ loss: 57600, fix: 1500 });
  });
  it('reparte giros sin repetir mientras alcancen', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const dealt = dealCards(ids, 5, new Set(), (x) => x);
    expect(new Set(Object.values(dealt)).size).toBe(5);
    const more = dealCards(['f', 'g'], 5, new Set([0, 1, 2]), (x) => x);
    expect(new Set(Object.values(more))).toEqual(new Set([3, 4]));
  });
});

describe('escape', () => {
  it('normaliza la palabra (mayúsculas, acentos, espacios)', () => {
    expect(normalizeWord(' verifícá ')).toBe('VERIFICA');
  });
  it('ranking: primero los que escaparon (más rápido), luego más letras', () => {
    const r = rankEscape([
      { id: 'a', escapedMs: null, letters: 7, errors: 0 },
      { id: 'b', escapedMs: 900, letters: 8, errors: 3 },
      { id: 'c', escapedMs: 600, letters: 8, errors: 5 },
      { id: 'd', escapedMs: null, letters: 8, errors: 1 },
    ]);
    expect(r.map((x) => x.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});

describe('shadowit', () => {
  const [gratis, pro, onprem] = shadowit.products as Parameters<typeof aiCost>[0][];
  it('calcula costos a 1 y 3 años', () => {
    expect(aiCost(gratis, 10, 1)).toBe(0);
    expect(aiCost(pro, 10, 1)).toBe(3600);
    expect(aiCost(pro, 10, 3)).toBe(10800);
    expect(aiCost(onprem, 10, 3)).toBe(18000 + 9000);
  });
  it('cuenta coincidencias con la referencia', () => {
    const m = referenceMatch(
      { c1: 'verde', c8: 'rojo', c5: 'rojo' },
      shadowit as Parameters<typeof referenceMatch>[1],
    );
    expect(m).toEqual({ match: 2, total: 12 });
  });
});

describe('juicio', () => {
  it('agrega los votos del jurado', () => {
    const parties = [
      { id: 'modaya', label: 'ModaYa' },
      { id: 'proveedor', label: 'Proveedor' },
    ];
    const v = aggregateVerdict(
      1,
      [
        { principal: 'modaya', responsibility: { modaya: 70, proveedor: 30 }, sanction: 'Multa' },
        {
          principal: 'modaya',
          responsibility: { modaya: 50, proveedor: 50 },
          sanction: 'Apercibimiento',
        },
      ],
      [],
      parties,
    );
    expect(v.principal[0]).toMatchObject({ party: 'modaya', count: 2 });
    expect(v.responsibility.find((r) => r.party === 'modaya')!.avg).toBe(60);
  });
});

describe('CSV', () => {
  it('neutraliza fórmulas y escapa comas', () => {
    const csv = toCsv([
      {
        grupo: '=HYPERLINK("x")',
        startup: 'A, B',
        fase: 'f',
        item: 'i',
        respuesta: '-10',
        detalle: '@x',
        puntos: -10,
      },
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"A, B"');
    expect(csv).toContain(',-10,');
    expect(csv).toContain("'@x");
  });
});
