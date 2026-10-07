import type { Server } from 'socket.io';
import {
  catalogEntry,
  toCsv,
  type ClientToServer,
  type CreateSessionInput,
  type Cue,
  type ExportRow,
  type GameId,
  type GroupInfo,
  type HostAction,
  type HostGroupRow,
  type PhaseInfo,
  type RoleId,
  type ServerToClient,
  type SessionMeta,
  type StatePayload,
  createSessionSchema,
} from '@ciberjunta/shared';
import { config } from '../config.js';
import { loadContent } from '../content.js';
import { getModule } from '../games/registry.js';
import { makeRng } from './rng.js';
import {
  hashPin,
  hashToken,
  newCode,
  newSalt,
  newSeed,
  newToken,
  safeEqualHex,
} from './security.js';
import type { Storage } from './storage.js';
import { GameError, type AnyModule, type Ctx } from './types.js';

export interface StoredGroup {
  id: string;
  tokenHash: string;
  name: string;
  startup: string;
  roles: Partial<Record<RoleId, string>>;
  removed: boolean;
  joinedAt: number;
}

export interface SessionData {
  code: string;
  gameId: GameId;
  createdAt: number;
  lastActivity: number;
  pinHash: string;
  pinSalt: string;
  hostTokenHashes: string[];
  failedPins: number;
  lockedUntil: number;
  expectedGroups: number;
  phaseDurations: Record<string, number>;
  config: Record<string, boolean | number | string>;
  seed: number;
  rngState: number;
  status: 'lobby' | 'running';
  phaseIndex: number;
  paused: boolean;
  pausedAt: number | null;
  pausedTotal: number;
  phaseEndsAt: number | null;
  spotlight: { groupId: string; endsAt: number | null } | null;
  groups: StoredGroup[];
  state: unknown;
  content: unknown;
}

type IO = Server<ClientToServer, ServerToClient>;

const MAX_HOST_TOKENS = 5;
const MAX_FAILED_PINS = 8;
const PIN_LOCK_MS = 5 * 60_000;

export class SessionManager {
  private sessions = new Map<string, SessionData>();
  /** Conexiones abiertas por sesión y grupo (estado de "conectado"). */
  private connections = new Map<string, Map<string, number>>();
  private dirty = new Set<string>();
  private flushTimer: NodeJS.Timeout | null = null;
  private io: IO | null = null;

  constructor(private readonly storage: Storage) {}

  attachIo(io: IO) {
    this.io = io;
  }

  async restore() {
    const all = await this.storage.loadAll();
    const now = Date.now();
    for (const s of all) {
      if (now - s.lastActivity < config.sessionTtlMs) this.sessions.set(s.code, s);
    }
    if (all.length) console.log(`[sesiones] restauradas ${this.sessions.size} sesiones`);
  }

  get size() {
    return this.sessions.size;
  }

  // ------------------------------------------------------------ helpers

  get(code: string): SessionData {
    const s = this.sessions.get(code);
    if (!s) throw new GameError('No existe una sesión con ese código (o ya expiró).');
    return s;
  }

  has(code: string) {
    return this.sessions.has(code);
  }

  module(s: SessionData): AnyModule {
    return getModule(s.gameId);
  }

  gameNow(s: SessionData, real = Date.now()): number {
    const pausedNow = s.paused && s.pausedAt !== null ? real - s.pausedAt : 0;
    return real - s.pausedTotal - pausedNow;
  }

  phases(s: SessionData): PhaseInfo[] {
    return catalogEntry(s.gameId).phases.map((p) => ({
      ...p,
      durationSec: s.phaseDurations[p.id] ?? p.durationSec,
    }));
  }

  activeGroups(s: SessionData): GroupInfo[] {
    const conns = this.connections.get(s.code);
    return s.groups
      .filter((g) => !g.removed)
      .map((g) => ({
        id: g.id,
        name: g.name,
        startup: g.startup,
        roles: g.roles,
        connected: (conns?.get(g.id) ?? 0) > 0,
      }));
  }

  makeCtx(s: SessionData, effects?: { cues: Cue[]; toasts: string[] }): Ctx<unknown> {
    const groups = this.activeGroups(s);
    const phases = this.phases(s);
    return {
      now: this.gameNow(s),
      rng: makeRng(s),
      content: s.content,
      config: s.config,
      groups,
      phaseId: s.phaseIndex >= 0 ? phases[s.phaseIndex].id : 'lobby',
      phaseEndsAt: s.phaseEndsAt,
      groupName: (id) => s.groups.find((g) => g.id === id)?.name ?? '¿?',
      cue: (c) => effects?.cues.push(c),
      toast: (t) => effects?.toasts.push(t),
    };
  }

  /** Ejecuta una modificación del estado del módulo de forma transaccional. */
  private mutate(s: SessionData, fn: (draft: unknown, ctx: Ctx<unknown>) => void) {
    const effects = { cues: [] as Cue[], toasts: [] as string[] };
    const draft = structuredClone(s.state);
    const ctx = this.makeCtx(s, effects);
    fn(draft, ctx);
    s.state = draft;
    s.lastActivity = Date.now();
    for (const c of effects.cues) this.io?.to(rooms.all(s.code)).emit('cue', c);
    for (const t of effects.toasts)
      this.io?.to(rooms.all(s.code)).emit('toast', { kind: 'info', text: t });
    this.markDirty(s.code);
  }

  // ------------------------------------------------------------ ciclo de vida

  create(input: CreateSessionInput): { code: string; hostToken: string } {
    const parsed = createSessionSchema.parse(input);
    if (this.sessions.size >= config.maxSessions)
      throw new GameError(
        'El servidor alcanzó el máximo de sesiones activas. Probá en unos minutos.',
      );
    let code = newCode();
    while (this.sessions.has(code)) code = newCode();
    const entry = catalogEntry(parsed.gameId);
    const cfg: Record<string, boolean | number | string> = {};
    for (const f of entry.config) {
      const v = parsed.config[f.key];
      if (f.type === 'boolean') cfg[f.key] = typeof v === 'boolean' ? v : (f.default as boolean);
      else {
        const n = typeof v === 'number' && Number.isFinite(v) ? v : (f.default as number);
        cfg[f.key] = Math.min(f.max ?? n, Math.max(f.min ?? n, Math.round(n)));
      }
    }
    const durations: Record<string, number> = {};
    for (const p of entry.phases) {
      const d = parsed.phaseDurations[p.id];
      if (d && p.durationSec !== null) durations[p.id] = d;
    }
    const mod = getModule(parsed.gameId);
    const content = mod.parseContent(loadContent(parsed.gameId));
    const salt = newSalt();
    const hostToken = newToken();
    const seed = newSeed();
    const now = Date.now();
    const s: SessionData = {
      code,
      gameId: parsed.gameId,
      createdAt: now,
      lastActivity: now,
      pinHash: hashPin(parsed.pin, salt),
      pinSalt: salt,
      hostTokenHashes: [hashToken(hostToken)],
      failedPins: 0,
      lockedUntil: 0,
      expectedGroups: parsed.expectedGroups,
      phaseDurations: durations,
      config: cfg,
      seed,
      rngState: seed,
      status: 'lobby',
      phaseIndex: -1,
      paused: false,
      pausedAt: null,
      pausedTotal: 0,
      phaseEndsAt: null,
      spotlight: null,
      groups: [],
      state: null,
      content,
    };
    s.state = mod.init(this.makeCtx(s));
    this.sessions.set(code, s);
    this.markDirty(code);
    return { code, hostToken };
  }

  hostLogin(code: string, pin: string): string {
    const s = this.get(code);
    const now = Date.now();
    if (s.lockedUntil > now)
      throw new GameError('Demasiados intentos fallidos. Esperá unos minutos antes de reintentar.');
    if (!safeEqualHex(hashPin(pin, s.pinSalt), s.pinHash)) {
      s.failedPins++;
      if (s.failedPins >= MAX_FAILED_PINS) {
        s.lockedUntil = now + PIN_LOCK_MS;
        s.failedPins = 0;
      }
      throw new GameError('PIN incorrecto.');
    }
    s.failedPins = 0;
    const token = newToken();
    s.hostTokenHashes = [...s.hostTokenHashes, hashToken(token)].slice(-MAX_HOST_TOKENS);
    return token;
  }

  verifyHost(code: string, token: string): boolean {
    const s = this.sessions.get(code);
    if (!s) return false;
    const h = hashToken(token);
    return s.hostTokenHashes.some((x) => safeEqualHex(x, h));
  }

  joinGroup(
    code: string,
    input: { name: string; startup: string; roles: Partial<Record<RoleId, string | undefined>> },
  ): { groupId: string; groupToken: string } {
    const s = this.get(code);
    const active = s.groups.filter((g) => !g.removed);
    if (active.length >= config.maxGroupsPerSession)
      throw new GameError('La sesión ya tiene el máximo de grupos.');
    const name = input.name.trim();
    if (active.some((g) => g.name.toLowerCase() === name.toLowerCase()))
      throw new GameError('Ya hay un grupo con ese nombre. Elijan otro.');
    const roles: Partial<Record<RoleId, string>> = {};
    for (const [k, v] of Object.entries(input.roles)) if (v) roles[k as RoleId] = v;
    const groupToken = newToken();
    const id = `g${s.groups.length + 1}`;
    s.groups.push({
      id,
      tokenHash: hashToken(groupToken),
      name,
      startup: input.startup.trim(),
      roles,
      removed: false,
      joinedAt: Date.now(),
    });
    s.lastActivity = Date.now();
    this.markDirty(code);
    return { groupId: id, groupToken };
  }

  verifyGroup(code: string, token: string): string | null {
    const s = this.sessions.get(code);
    if (!s) return null;
    const h = hashToken(token);
    const g = s.groups.find((x) => !x.removed && safeEqualHex(x.tokenHash, h));
    return g ? g.id : null;
  }

  verifyGroupId(code: string, groupId: string): boolean {
    return !!this.sessions.get(code)?.groups.some((g) => g.id === groupId && !g.removed);
  }

  connect(code: string, groupId: string, delta: 1 | -1) {
    let m = this.connections.get(code);
    if (!m) this.connections.set(code, (m = new Map()));
    m.set(groupId, Math.max(0, (m.get(groupId) ?? 0) + delta));
    if (this.sessions.has(code)) this.markDirty(code);
  }

  // ------------------------------------------------------------ acciones

  hostAction(code: string, action: HostAction) {
    const s = this.get(code);
    const mod = this.module(s);
    const phases = this.phases(s);
    const now = this.gameNow(s);
    const enterPhase = (index: number) => {
      s.phaseIndex = index;
      const d = phases[index].durationSec;
      s.phaseEndsAt = d ? this.gameNow(s) + d * 1000 : null;
      s.spotlight = null;
      if (mod.onPhaseEnter) this.mutate(s, (st, ctx) => mod.onPhaseEnter!(st, ctx));
      this.io?.to(rooms.all(code)).emit('cue', 'bell');
    };
    switch (action.type) {
      case 'start':
        if (s.status !== 'lobby') throw new GameError('La dinámica ya empezó.');
        s.status = 'running';
        enterPhase(0);
        break;
      case 'nextPhase':
        if (s.status === 'lobby') throw new GameError('Primero inicien la dinámica.');
        if (s.phaseIndex >= phases.length - 1) throw new GameError('Ya están en la última fase.');
        if (s.paused) this.resume(s);
        enterPhase(s.phaseIndex + 1);
        break;
      case 'pause':
        if (!s.paused) {
          s.paused = true;
          s.pausedAt = Date.now();
        }
        break;
      case 'resume':
        this.resume(s);
        break;
      case 'addTime': {
        const base = s.phaseEndsAt && s.phaseEndsAt > now ? s.phaseEndsAt : now;
        const next = base + action.seconds * 1000;
        s.phaseEndsAt = next > now ? next : now;
        break;
      }
      case 'spotlight': {
        if (!s.groups.some((g) => g.id === action.groupId && !g.removed))
          throw new GameError('Grupo inexistente.');
        s.spotlight = {
          groupId: action.groupId,
          endsAt: action.seconds > 0 ? now + action.seconds * 1000 : null,
        };
        break;
      }
      case 'clearSpotlight':
        s.spotlight = null;
        break;
      case 'removeGroup': {
        const g = s.groups.find((x) => x.id === action.groupId);
        if (!g) throw new GameError('Grupo inexistente.');
        g.removed = true;
        if (s.spotlight?.groupId === g.id) s.spotlight = null;
        this.io
          ?.to(rooms.group(code, g.id))
          .emit('closed', 'El docente quitó a este grupo de la sesión.');
        this.io?.in(rooms.group(code, g.id)).socketsLeave(rooms.group(code, g.id));
        break;
      }
      case 'game':
        if (!mod.onHostAction) throw new GameError('Esta dinámica no tiene acciones especiales.');
        if (s.status !== 'running') throw new GameError('Primero inicien la dinámica.');
        this.mutate(s, (st, ctx) => mod.onHostAction!(st, action.action, ctx));
        break;
    }
    s.lastActivity = Date.now();
    this.markDirty(code);
  }

  private resume(s: SessionData) {
    if (s.paused && s.pausedAt !== null) s.pausedTotal += Date.now() - s.pausedAt;
    s.paused = false;
    s.pausedAt = null;
  }

  groupAction(code: string, groupId: string, action: unknown) {
    const s = this.get(code);
    if (s.status !== 'running') throw new GameError('La dinámica todavía no empezó.');
    if (s.paused) throw new GameError('La sesión está en pausa.');
    const mod = this.module(s);
    this.mutate(s, (st, ctx) => mod.onGroupAction(st, groupId, action, ctx));
  }

  tick() {
    for (const s of this.sessions.values()) {
      if (s.status !== 'running' || s.paused) continue;
      const mod = this.module(s);
      if (!mod.onTick) continue;
      try {
        const ctx = this.makeCtx(s);
        if (mod.needsTick && !mod.needsTick(s.state, ctx)) continue;
        let changed = false;
        this.mutateQuiet(s, (st, c) => {
          changed = mod.onTick!(st, c);
        });
        if (changed) this.markDirty(s.code);
      } catch (err) {
        console.error(`[tick ${s.code}]`, err);
      }
    }
  }

  private mutateQuiet(s: SessionData, fn: (draft: unknown, ctx: Ctx<unknown>) => void) {
    const effects = { cues: [] as Cue[], toasts: [] as string[] };
    const draft = structuredClone(s.state);
    fn(draft, this.makeCtx(s, effects));
    s.state = draft;
    for (const c of effects.cues) this.io?.to(rooms.all(s.code)).emit('cue', c);
    for (const t of effects.toasts)
      this.io?.to(rooms.all(s.code)).emit('toast', { kind: 'info', text: t });
  }

  sweep() {
    const now = Date.now();
    for (const s of [...this.sessions.values()]) {
      if (now - s.lastActivity > config.sessionTtlMs) {
        this.io?.to(rooms.all(s.code)).emit('closed', 'La sesión expiró.');
        this.sessions.delete(s.code);
        this.connections.delete(s.code);
        void this.storage.delete(s.code);
      }
    }
  }

  // ------------------------------------------------------------ vistas

  meta(s: SessionData, ctx: Ctx<unknown>): SessionMeta {
    const mod = this.module(s);
    let spotlight: SessionMeta['spotlight'] = null;
    if (s.spotlight) {
      const g = s.groups.find((x) => x.id === s.spotlight!.groupId);
      if (g)
        spotlight = {
          groupId: g.id,
          groupName: g.name,
          startup: g.startup,
          endsAt: s.spotlight.endsAt,
          items: mod.summarize(s.state, g.id, ctx),
        };
    }
    return {
      code: s.code,
      gameId: s.gameId,
      gameTitle: catalogEntry(s.gameId).title,
      status: s.status,
      phases: this.phases(s),
      phaseIndex: s.phaseIndex,
      paused: s.paused,
      serverNow: ctx.now,
      phaseEndsAt: s.phaseEndsAt,
      groups: ctx.groups,
      spotlight,
      expectedGroups: s.expectedGroups,
    };
  }

  rows(s: SessionData, ctx: Ctx<unknown>): ExportRow[] {
    const mod = this.module(s);
    return mod.exportRows(s.state, ctx).map(({ groupId, ...r }) => {
      const g = groupId ? s.groups.find((x) => x.id === groupId) : null;
      return { grupo: g ? g.name : '(sesión)', startup: g ? g.startup : '', ...r };
    });
  }

  hostPayload(s: SessionData): StatePayload {
    const ctx = this.makeCtx(s);
    const mod = this.module(s);
    const groups: HostGroupRow[] = ctx.groups.map((g) => {
      const st =
        s.status === 'running'
          ? mod.status(s.state, g.id, ctx)
          : { text: 'En la sala de espera', responded: false };
      return {
        id: g.id,
        status: st.text,
        responded: st.responded,
        summary: mod.summarize(s.state, g.id, ctx),
      };
    });
    return {
      role: 'host',
      meta: this.meta(s, ctx),
      view: mod.hostView(s.state, ctx),
      groups,
      rows: this.rows(s, ctx),
      seed: s.seed,
    };
  }

  screenPayload(s: SessionData): StatePayload {
    const ctx = this.makeCtx(s);
    return {
      role: 'screen',
      meta: this.meta(s, ctx),
      view: this.module(s).publicView(s.state, ctx),
    };
  }

  groupPayload(s: SessionData, groupId: string): StatePayload | null {
    const ctx = this.makeCtx(s);
    const me = ctx.groups.find((g) => g.id === groupId);
    if (!me) return null;
    return {
      role: 'group',
      meta: this.meta(s, ctx),
      view: this.module(s).groupView(s.state, groupId, ctx),
      me,
    };
  }

  markDirty(code: string) {
    this.dirty.add(code);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 25);
  }

  private flush() {
    this.flushTimer = null;
    const codes = [...this.dirty];
    this.dirty.clear();
    for (const code of codes) {
      const s = this.sessions.get(code);
      if (!s) continue;
      try {
        this.broadcast(s);
      } catch (err) {
        console.error(`[broadcast ${code}]`, err);
      }
      this.storage.scheduleSave(s);
    }
  }

  private broadcast(s: SessionData) {
    const io = this.io;
    if (!io) return;
    const code = s.code;
    if (io.sockets.adapter.rooms.get(rooms.host(code))?.size)
      io.to(rooms.host(code)).emit('state', this.hostPayload(s));
    if (io.sockets.adapter.rooms.get(rooms.screen(code))?.size)
      io.to(rooms.screen(code)).emit('state', this.screenPayload(s));
    for (const g of s.groups) {
      if (g.removed || !io.sockets.adapter.rooms.get(rooms.group(code, g.id))?.size) continue;
      const p = this.groupPayload(s, g.id);
      if (p) io.to(rooms.group(code, g.id)).emit('state', p);
    }
  }

  // ------------------------------------------------------------ exportación

  exportJson(code: string) {
    const s = this.get(code);
    const ctx = this.makeCtx(s);
    return {
      app: 'CiberJunta',
      exportedAt: new Date().toISOString(),
      code: s.code,
      gameId: s.gameId,
      gameTitle: catalogEntry(s.gameId).title,
      createdAt: new Date(s.createdAt).toISOString(),
      seed: s.seed,
      config: s.config,
      phases: this.phases(s),
      phaseIndex: s.phaseIndex,
      groups: s.groups.map((g) => ({
        id: g.id,
        name: g.name,
        startup: g.startup,
        roles: g.roles,
        removed: g.removed,
      })),
      rows: this.rows(s, ctx),
      state: s.state,
    };
  }

  exportCsv(code: string): string {
    const s = this.get(code);
    return toCsv(this.rows(s, this.makeCtx(s)), { sesion: s.code, dinamica: s.gameId });
  }
}

export const rooms = {
  host: (code: string) => `${code}:host`,
  screen: (code: string) => `${code}:screen`,
  group: (code: string, id: string) => `${code}:g:${id}`,
  all: (code: string) => `${code}:all`,
};
