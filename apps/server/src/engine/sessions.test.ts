import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateSession, SessionManager, type SessionData } from './sessions.js';
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
    expect(m.exportJson(code).activities[0].seed).toBe(s.activities[0].seed);
  });

  it('una acción inválida no modifica el estado', () => {
    const { code } = m.create({ gameId: 'crisis', pin: '1234' });
    const g = m.joinGroup(code, { name: 'Uno', startup: '', roles: {} });
    m.hostAction(code, { type: 'start' });
    m.hostAction(code, { type: 'game', action: { type: 'nextInject' } });
    const before = JSON.stringify(m.get(code).activities[0].state);
    expect(() =>
      m.groupAction(code, g.groupId, { type: 'decide', inject: 0, option: 'Z' }),
    ).toThrow();
    expect(() => m.groupAction(code, g.groupId, { type: 'hackear' })).toThrow(/Acción inválida/);
    expect(JSON.stringify(m.get(code).activities[0].state)).toBe(before);
  });

  it('los dados de la subasta son reproducibles con la misma semilla', () => {
    const run = () => {
      const mm = new SessionManager(new MemoryStorage());
      const { code } = mm.create({ gameId: 'subasta', pin: '1234' });
      mm.joinGroup(code, { name: 'A', startup: '', roles: {} });
      mm.joinGroup(code, { name: 'B', startup: '', roles: {} });
      const s = mm.get(code).activities[0];
      s.rngState = s.seed = 42;
      mm.hostAction(code, { type: 'start' });
      mm.hostAction(code, { type: 'nextPhase' });
      mm.hostAction(code, { type: 'nextPhase' });
      mm.hostAction(code, { type: 'game', action: { type: 'revealIncident' } });
      return JSON.stringify((s.state as { revealed: unknown }).revealed);
    };
    expect(run()).toBe(run());
  });

  it('un mismo código sirve para varias dinámicas y conserva los grupos', () => {
    const { code } = m.create({ gameId: 'phish', pin: '1234' });
    const g = m.joinGroup(code, { name: 'Uno', startup: 'PagaFácil', roles: {} });
    m.hostAction(code, { type: 'start' });
    m.groupAction(code, g.groupId, { type: 'osint', notes: 'Viaje a Bariloche' });

    m.hostAction(code, { type: 'addActivity', gameId: 'crisis', config: { injectSec: 60 } });
    const s = m.get(code);
    expect(s.activities.map((a) => a.gameId)).toEqual(['phish', 'crisis']);
    expect(s.current).toBe(1);
    expect(s.activities[1].config.injectSec).toBe(60);
    // La dinámica anterior queda en pausa y la nueva en sala de espera.
    expect(s.activities[0].paused).toBe(true);
    const meta = m.hostPayload(s).meta;
    expect(meta.gameId).toBe('crisis');
    expect(meta.status).toBe('lobby');
    expect(meta.groups.map((x) => x.name)).toEqual(['Uno']);
    expect(meta.activities.map((a) => a.status)).toEqual(['running', 'lobby']);

    // El grupo no necesita volver a unirse: actúa en la nueva dinámica.
    m.hostAction(code, { type: 'start' });
    m.hostAction(code, { type: 'game', action: { type: 'nextInject' } });
    m.groupAction(code, g.groupId, { type: 'decide', inject: 0, option: 'A' });

    // Volver a la primera la reanuda; la exportación incluye las dos.
    m.hostAction(code, { type: 'switchActivity', index: 0 });
    expect(s.activities[0].paused).toBe(false);
    expect(s.activities[1].paused).toBe(true);
    expect(() => m.hostAction(code, { type: 'switchActivity', index: 0 })).toThrow(/Ya están/);
    expect(() => m.hostAction(code, { type: 'switchActivity', index: 5 })).toThrow(/no existe/);
    const csv = m.exportCsv(code);
    expect(csv.split('\r\n')[0]).toBe(
      '\uFEFFsesion,dinamica,grupo,startup,fase,item,respuesta,detalle,puntos',
    );
    expect(csv).toMatch(/,phish,Uno,PagaFácil,/);
    expect(csv).toMatch(/,crisis,Uno,PagaFácil,/);
    expect(m.exportJson(code).activities.map((a) => a.dinamica)).toEqual(['phish', 'crisis']);
  });

  it('cambiar de dinámica congela sus plazos y respeta la pausa manual', () => {
    const { code } = m.create({ gameId: 'crisis', pin: '1234' });
    m.hostAction(code, { type: 'start' });
    const s = m.get(code);
    const crisis = s.activities[0];
    const left = () =>
      crisis.phaseEndsAt === null ? null : crisis.phaseEndsAt - m.gameNow(crisis);
    m.hostAction(code, { type: 'addTime', seconds: 300 });
    const before = left();
    m.hostAction(code, { type: 'addActivity', gameId: 'escape' });
    vi.advanceTimersByTime(120_000);
    m.hostAction(code, { type: 'switchActivity', index: 0 });
    expect(left()).toBe(before);

    // Si el docente la pausó a mano, al volver sigue en pausa.
    m.hostAction(code, { type: 'pause' });
    m.hostAction(code, { type: 'switchActivity', index: 1 });
    m.hostAction(code, { type: 'switchActivity', index: 0 });
    expect(crisis.paused).toBe(true);
  });

  it('repite una dinámica y la distingue en la exportación', () => {
    const { code } = m.create({ gameId: 'phish', pin: '1234' });
    m.joinGroup(code, { name: 'Uno', startup: '', roles: {} });
    m.hostAction(code, { type: 'addActivity', gameId: 'phish' });
    const labels = m.exportJson(code).activities.map((a) => a.dinamica);
    expect(labels).toEqual(['phish', 'phish #2']);
  });

  it('migra sesiones guardadas con el formato de una sola dinámica', () => {
    const { code } = m.create({ gameId: 'subasta', pin: '1234' });
    const { activities, current: _current, ...rest } = m.get(code);
    const { createdAt: _createdAt, autoPaused: _autoPaused, ...activity } = activities[0];
    const legacy = { ...rest, ...activity } as unknown as SessionData;
    const migrated = migrateSession(legacy);
    expect(migrated.current).toBe(0);
    expect(migrated.activities).toHaveLength(1);
    expect(migrated.activities[0].gameId).toBe('subasta');
    expect(migrated.activities[0].seed).toBe(activities[0].seed);
    expect(migrateSession(migrated)).toBe(migrated);
  });
});
