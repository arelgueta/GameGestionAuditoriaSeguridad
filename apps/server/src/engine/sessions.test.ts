import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManager } from './sessions.js';
import { MemoryStorage } from './storage.js';
import type { phish } from '@ciberjunta/shared';

describe('SessionManager', () => {
  let m: SessionManager;
  beforeEach(() => {
    vi.useFakeTimers();
    m = new SessionManager(new MemoryStorage());
  });
  afterEach(() => vi.useRealTimers());

  it('crea sesión, valida PIN y tokens', () => {
    const { code, hostToken } = m.create({ gameId: 'phish', pin: '1234' });
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(m.verifyHost(code, hostToken)).toBe(true);
    expect(m.verifyHost(code, 'x'.repeat(32))).toBe(false);
    expect(() => m.hostLogin(code, '0000')).toThrow(/PIN incorrecto/);
    expect(m.verifyHost(code, m.hostLogin(code, '1234'))).toBe(true);
  });

  it('bloquea el PIN tras muchos intentos fallidos', () => {
    const { code } = m.create({ gameId: 'phish', pin: '1234' });
    for (let i = 0; i < 8; i++) expect(() => m.hostLogin(code, '9999')).toThrow();
    expect(() => m.hostLogin(code, '1234')).toThrow(/Demasiados intentos/);
  });

  it('grupos: nombres únicos y reconexión por token', () => {
    const { code } = m.create({ gameId: 'crisis', pin: '1234' });
    const a = m.joinGroup(code, {
      name: 'Los Halcones',
      startup: 'PagaFácil',
      roles: { ceo: 'Ana' },
    });
    expect(() => m.joinGroup(code, { name: 'los halcones', startup: '', roles: {} })).toThrow(
      /Ya hay un grupo/,
    );
    expect(m.verifyGroup(code, a.groupToken)).toBe(a.groupId);
  });

  it('partida corta de phish con reloj de juego y pausa', () => {
    const { code } = m.create({ gameId: 'phish', pin: '1234' });
    const g1 = m.joinGroup(code, { name: 'Uno', startup: '', roles: {} });
    const g2 = m.joinGroup(code, { name: 'Dos', startup: '', roles: {} });
    m.hostAction(code, { type: 'start' });
    m.hostAction(code, { type: 'nextPhase' });
    m.hostAction(code, { type: 'game', action: { type: 'nextRound' } });
    const s = m.get(code);
    vi.advanceTimersByTime(5000);
    m.groupAction(code, g1.groupId, { type: 'answer', round: 0, choice: 'PHISH' });
    m.hostAction(code, { type: 'pause' });
    expect(() =>
      m.groupAction(code, g2.groupId, { type: 'answer', round: 0, choice: 'FISH' }),
    ).toThrow(/pausa/);
    vi.advanceTimersByTime(60_000); // en pausa el reloj no avanza
    m.hostAction(code, { type: 'resume' });
    m.groupAction(code, g2.groupId, { type: 'answer', round: 0, choice: 'FISH' });
    vi.advanceTimersByTime(26_000);
    m.tick();
    let view = m.hostPayload(s).view as phish.PhishView;
    expect(view.round?.stage).toBe('signal');
    vi.advanceTimersByTime(16_000);
    m.tick();
    view = m.hostPayload(s).view as phish.PhishView;
    expect(view.round?.stage).toBe('reveal');
    const top = view.ranking[0];
    expect(top.name).toBe('Uno');
    expect(top.score).toBe(100 + Math.round(50 * (1 - 5 / 25)));
    const csv = m.exportCsv(code);
    expect(csv).toContain('Ronda 1');
    expect(m.exportJson(code).seed).toBe(s.seed);
  });

  it('una acción inválida no modifica el estado', () => {
    const { code } = m.create({ gameId: 'crisis', pin: '1234' });
    const g = m.joinGroup(code, { name: 'Uno', startup: '', roles: {} });
    m.hostAction(code, { type: 'start' });
    m.hostAction(code, { type: 'game', action: { type: 'nextInject' } });
    const before = JSON.stringify(m.get(code).state);
    expect(() =>
      m.groupAction(code, g.groupId, { type: 'decide', inject: 0, option: 'Z' }),
    ).toThrow();
    expect(() => m.groupAction(code, g.groupId, { type: 'hackear' })).toThrow(/Acción inválida/);
    expect(JSON.stringify(m.get(code).state)).toBe(before);
  });

  it('los dados de la subasta son reproducibles con la misma semilla', () => {
    const run = () => {
      const mm = new SessionManager(new MemoryStorage());
      const { code } = mm.create({ gameId: 'subasta', pin: '1234' });
      mm.joinGroup(code, { name: 'A', startup: '', roles: {} });
      mm.joinGroup(code, { name: 'B', startup: '', roles: {} });
      const s = mm.get(code);
      s.rngState = s.seed = 42;
      mm.hostAction(code, { type: 'start' });
      mm.hostAction(code, { type: 'nextPhase' });
      mm.hostAction(code, { type: 'nextPhase' });
      mm.hostAction(code, { type: 'game', action: { type: 'revealIncident' } });
      return JSON.stringify((s.state as { revealed: unknown }).revealed);
    };
    expect(run()).toBe(run());
  });
});
