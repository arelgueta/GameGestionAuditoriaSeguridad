import { describe, expect, it } from 'vitest';
import { lotWinners, minBid, placeBid, resolveIncident, type Lot } from './subasta.js';
import content from '../../../../content/subasta.json' with { type: 'json' };

const rules = {
  affectedMax: 3,
  insuranceId: 'seguro',
  responsePlanId: 'plan',
  responsePlanBonus: 5,
};
const inc = (id: string) => content.incidents.find((i) => i.id === id)!;

describe('resolveIncident', () => {
  it('Backups + Ciberseguro afectados por incendio: 30 → 15 → 8', () => {
    const r = resolveIncident(inc('incendio'), ['backups', 'seguro'], 2, rules);
    expect(r.affected).toBe(true);
    expect(r.damage).toBe(8);
  });

  it('con dado 4-6 el incidente no los afecta', () => {
    for (const roll of [4, 5, 6])
      expect(resolveIncident(inc('ransomware'), [], roll, rules).damage).toBe(0);
  });

  it('dado 1-3 sin controles: daño completo', () => {
    expect(resolveIncident(inc('ransomware'), [], 1, rules).damage).toBe(40);
  });

  it('el control que anula tiene prioridad sobre el que reduce y sobre el seguro', () => {
    const r = resolveIncident(inc('ransomware'), ['backups', 'capacitacion', 'seguro'], 3, rules);
    expect(r.damage).toBe(0);
    expect(r.bonus).toBe(0);
  });

  it('ransomware con capacitación y seguro: 40 → 20 → 10', () => {
    expect(resolveIncident(inc('ransomware'), ['capacitacion', 'seguro'], 1, rules).damage).toBe(
      10,
    );
  });

  it('el seguro redondea hacia arriba el daño', () => {
    expect(resolveIncident(inc('idor'), ['seguro'], 1, rules).damage).toBe(18);
  });

  it('el plan de respuesta suma +5 si sufrieron el incidente', () => {
    const r = resolveIncident(inc('notebook'), ['plan'], 1, rules);
    expect(r.damage).toBe(20);
    expect(r.bonus).toBe(5);
  });
});

function lot(units = 2): Lot {
  return {
    controlId: 'mfa',
    units,
    status: 'open',
    openedAt: 0,
    endsAt: 45_000,
    bids: {},
    winners: [],
  };
}

describe('subasta', () => {
  it('ganan las N ofertas más altas y cada uno paga lo suyo', () => {
    const l = lot(2);
    placeBid(l, 'g1', 12, 100, 10, 1);
    placeBid(l, 'g2', 20, 100, 10, 2);
    placeBid(l, 'g3', 15, 100, 10, 3);
    expect(lotWinners(l)).toEqual([
      { groupId: 'g2', amount: 20 },
      { groupId: 'g3', amount: 15 },
    ]);
  });

  it('empate: gana la oferta que llegó primero', () => {
    const l = lot(1);
    l.bids = { g1: { amount: 30, at: 500 }, g2: { amount: 30, at: 200 } };
    expect(lotWinners(l)[0].groupId).toBe('g2');
  });

  it('rechaza ofertas mayores al saldo', () => {
    expect(() => placeBid(lot(), 'g1', 50, 40, 10, 1)).toThrow(/más de lo que les queda/);
  });

  it('rechaza ofertas por debajo del precio base', () => {
    expect(() => placeBid(lot(), 'g1', 5, 100, 10, 1)).toThrow(/mínima es 10/);
  });

  it('las ofertas suben de a 1 sobre la última posición ganadora', () => {
    const l = lot(1);
    placeBid(l, 'g1', 15, 100, 10, 1);
    expect(minBid(l, 'g2', 10)).toBe(16);
    expect(() => placeBid(l, 'g2', 15, 100, 10, 2)).toThrow(/mínima es 16/);
    placeBid(l, 'g2', 16, 100, 10, 2);
    expect(lotWinners(l)[0].groupId).toBe('g2');
  });

  it('con unidades libres alcanza con el precio base', () => {
    const l = lot(3);
    placeBid(l, 'g1', 40, 100, 10, 1);
    expect(minBid(l, 'g2', 10)).toBe(10);
  });

  it('no se puede ofertar en un lote cerrado', () => {
    const l = lot();
    l.status = 'closed';
    expect(() => placeBid(l, 'g1', 20, 100, 10, 1)).toThrow(/cerrado/);
  });
});
