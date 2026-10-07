import type { Server } from 'socket.io';
import {
  catalogEntry,
  MAX_ACTIVITIES,
  toCsv,
  type ActivityInfo,
  type ActivityInput,
  type ClientToServer,
  type CreateSessionInput,
  type Cue,
  type ExportRow,
  type GameId,
  type GroupInfo,
  type HostActionInput,
  type HostGroupRow,
  type PhaseInfo,
  type RoleId,
  type ServerToClient,
  type SessionMeta,
  type StatePayload,
  activitySchema,
  createSessionSchema,
  hostActionSchema,
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

/**
 * Una dinámica dentro de la sesión. Cada una tiene su propio reloj, fases,
 * semilla y estado; los grupos, el código y el PIN son de la sesión. Así el
 * docente usa un único código para varias dinámicas en la misma clase.
 */
export interface Activity {
  gameId: GameId;
  createdAt: number;
  phaseDurations: Record<string, number>;
  config: Record<string, boolean | number | string>;
  seed: number;
  rngState: number;
  status: 'lobby' | 'running';
  phaseIndex: number;
  paused: boolean;
  pausedAt: number | null;
  pausedTotal: number;
  /** La pausa la puso el motor al cambiar de dinámica: se levanta sola al volver. */
  autoPaused: boolean;
  phaseEndsAt: number | null;
  state: unknown;
  content: unknown;
}

export interface SessionData {
  code: string;
  createdAt: number;
  lastActivity: number;
  pinHash: string;
  pinSalt: string;
  hostTokenHashes: string[];
  failedPins: number;
  lockedUntil: number;
  expectedGroups: number;
  spotlight: { groupId: string; endsAt: number | null } | null;
  groups: StoredGroup[];
  activities: Activity[];
  /** Índice de la dinámica que ven los grupos y la pantalla. */
  current: number;
}

/** Sesiones guardadas antes de soportar varias dinámicas (una sola, en la raíz). */
type LegacySessionData = Omit<SessionData, 'activities' | 'current'> &
  Omit<Activity, 'createdAt' | 'autoPaused'>;

export function migrateSession(raw: SessionData | LegacySessionData): SessionData {
  if ('activities' in raw && Array.isArray(raw.activities)) return raw;
  const old = raw as LegacySessionData;
  const activity: Activity = {
    gameId: old.gameId,
    createdAt: old.createdAt,
    phaseDurations: old.phaseDurations,
    config: old.config,
    seed: old.seed,
    rngState: old.rngState,
    status: old.status,
    phaseIndex: old.phaseIndex,
    paused: old.paused,
    pausedAt: old.pausedAt,
    pausedTotal: old.pausedTotal,
    autoPaused: false,
    phaseEndsAt: old.phaseEndsAt,
    state: old.state,
    content: old.content,
  };
  return {
    code: old.code,
    createdAt: old.createdAt,
    lastActivity: old.lastActivity,
    pinHash: old.pinHash,
    pinSalt: old.pinSalt,
    hostTokenHashes: old.hostTokenHashes,
    failedPins: old.failedPins,
    lockedUntil: old.lockedUntil,
    expectedGroups: old.expectedGroups,
    spotlight: old.spotlight,
    groups: old.groups,
    activities: [activity],
    current: 0,
  };
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
    for (const raw of all) {
      if (now - raw.lastActivity < config.sessionTtlMs)
        this.sessions.set(raw.code, migrateSession(raw));
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

  /** Dinámica activa de la sesión. */
  act(s: SessionData): Activity {
    return s.activities[s.current];
  }

  module(a: Activity): AnyModule {
    return getModule(a.gameId);
  }

  gameNow(a: Activity, real = Date.now()): number {
    const pausedNow = a.paused && a.pausedAt !== null ? real - a.pausedAt : 0;
    return real - a.pausedTotal - pausedNow;
  }

  phases(a: Activity): PhaseInfo[] {
    return catalogEntry(a.gameId).phases.map((p) => ({
      ...p,
      durationSec: a.phaseDurations[p.id] ?? p.durationSec,
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

  makeCtx(
    s: SessionData,
    effects?: { cues: Cue[]; toasts: string[] },
    a: Activity = this.act(s),
  ): Ctx<unknown> {
    const groups = this.activeGroups(s);
    const phases = this.phases(a);
    return {
      now: this.gameNow(a),
      rng: makeRng(a),
      content: a.content,
      config: a.config,
      groups,
      phaseId: a.phaseIndex >= 0 ? phases[a.phaseIndex].id : 'lobby',
      phaseEndsAt: a.phaseEndsAt,
      groupName: (id) => s.groups.find((g) => g.id === id)?.name ?? '¿?',
      cue: (c) => effects?.cues.push(c),
      toast: (t) => effects?.toasts.push(t),
    };
  }

  /** Ejecuta una modificación del estado de la dinámica activa de forma transaccional. */
  private mutate(s: SessionData, fn: (draft: unknown, ctx: Ctx<unknown>) => void) {
    const effects = { cues: [] as Cue[], toasts: [] as string[] };
    const a = this.act(s);
    const draft = structuredClone(a.state);
    const ctx = this.makeCtx(s, effects);
    fn(draft, ctx);
    a.state = draft;
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
    const salt = newSalt();
    const hostToken = newToken();
    const now = Date.now();
    const s: SessionData = {
      code,
      createdAt: now,
      lastActivity: now,
      pinHash: hashPin(parsed.pin, salt),
      pinSalt: salt,
      hostTokenHashes: [hashToken(hostToken)],
      failedPins: 0,
      lockedUntil: 0,
      expectedGroups: parsed.expectedGroups,
      spotlight: null,
      groups: [],
      activities: [],
      current: 0,
    };
    s.activities.push(this.newActivity(s, parsed));
    this.sessions.set(code, s);
    this.markDirty(code);
    return { code, hostToken };
  }

  /** Arma una dinámica nueva (en sala de espera) con su configuración validada. */
  private newActivity(s: SessionData, input: ActivityInput): Activity {
    const parsed = activitySchema.parse(input);
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
    const seed = newSeed();
    const a: Activity = {
      gameId: parsed.gameId,
      createdAt: Date.now(),
      phaseDurations: durations,
      config: cfg,
      seed,
      rngState: seed,
      status: 'lobby',
      phaseIndex: -1,
      paused: false,
      pausedAt: null,
      pausedTotal: 0,
      autoPaused: false,
      phaseEndsAt: null,
      state: null,
      content: mod.parseContent(loadContent(parsed.gameId)),
    };
    a.state = mod.init(this.makeCtx(s, undefined, a));
    return a;
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

  hostAction(code: string, input: HostActionInput) {
    const action = hostActionSchema.parse(input);
    const s = this.get(code);
    const a = this.act(s);
    const mod = this.module(a);
    const phases = this.phases(a);
    const now = this.gameNow(a);
    const enterPhase = (index: number) => {
      a.phaseIndex = index;
      const d = phases[index].durationSec;
      a.phaseEndsAt = d ? this.gameNow(a) + d * 1000 : null;
      s.spotlight = null;
      if (mod.onPhaseEnter) this.mutate(s, (st, ctx) => mod.onPhaseEnter!(st, ctx));
      this.io?.to(rooms.all(code)).emit('cue', 'bell');
    };
    switch (action.type) {
      case 'start':
        if (a.status !== 'lobby') throw new GameError('La dinámica ya empezó.');
        a.status = 'running';
        enterPhase(0);
        break;
      case 'nextPhase':
        if (a.status === 'lobby') throw new GameError('Primero inicien la dinámica.');
        if (a.phaseIndex >= phases.length - 1) throw new GameError('Ya están en la última fase.');
        if (a.paused) this.resume(a);
        enterPhase(a.phaseIndex + 1);
        break;
      case 'pause':
        if (!a.paused) {
          a.paused = true;
          a.pausedAt = Date.now();
        }
        a.autoPaused = false;
        break;
      case 'resume':
        this.resume(a);
        break;
      case 'addTime': {
        const base = a.phaseEndsAt && a.phaseEndsAt > now ? a.phaseEndsAt : now;
        const next = base + action.seconds * 1000;
        a.phaseEndsAt = next > now ? next : now;
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
        if (a.status !== 'running') throw new GameError('Primero inicien la dinámica.');
        this.mutate(s, (st, ctx) => mod.onHostAction!(st, action.action, ctx));
        break;
      case 'addActivity': {
        if (s.activities.length >= MAX_ACTIVITIES)
          throw new GameError(`Una sesión admite hasta ${MAX_ACTIVITIES} dinámicas.`);
        s.activities.push(this.newActivity(s, action));
        this.switchTo(s, s.activities.length - 1);
        break;
      }
      case 'switchActivity':
        if (!s.activities[action.index]) throw new GameError('Esa dinámica no existe.');
        if (action.index === s.current) throw new GameError('Ya están en esa dinámica.');
        this.switchTo(s, action.index);
        break;
    }
    s.lastActivity = Date.now();
    this.markDirty(code);
  }

  /**
   * Cambia la dinámica que ven los grupos. La que queda atrás se pausa (sus
   * plazos se congelan) y se reanuda sola al volver, salvo que el docente la
   * hubiera pausado a mano.
   */
  private switchTo(s: SessionData, index: number) {
    const prev = this.act(s);
    if (prev.status === 'running' && !prev.paused) {
      prev.paused = true;
      prev.pausedAt = Date.now();
      prev.autoPaused = true;
    }
    s.current = index;
    s.spotlight = null;
    const next = this.act(s);
    if (next.autoPaused) this.resume(next);
    this.io?.to(rooms.all(s.code)).emit('cue', 'bell');
    this.io
      ?.to(rooms.all(s.code))
      .emit('toast', { kind: 'info', text: `Dinámica: ${catalogEntry(next.gameId).title}` });
  }

  private resume(a: Activity) {
    if (a.paused && a.pausedAt !== null) a.pausedTotal += Date.now() - a.pausedAt;
    a.paused = false;
    a.pausedAt = null;
    a.autoPaused = false;
  }

  groupAction(code: string, groupId: string, action: unknown) {
    const s = this.get(code);
    const a = this.act(s);
    if (a.status !== 'running') throw new GameError('La dinámica todavía no empezó.');
    if (a.paused) throw new GameError('La sesión está en pausa.');
    const mod = this.module(a);
    this.mutate(s, (st, ctx) => mod.onGroupAction(st, groupId, action, ctx));
  }

  /** Solo avanza la dinámica activa: las demás están en sala de espera o en pausa. */
  tick() {
    for (const s of this.sessions.values()) {
      const a = this.act(s);
      if (a.status !== 'running' || a.paused) continue;
      const mod = this.module(a);
      if (!mod.onTick) continue;
      try {
        const ctx = this.makeCtx(s);
        if (mod.needsTick && !mod.needsTick(a.state, ctx)) continue;
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
    const a = this.act(s);
    const draft = structuredClone(a.state);
    fn(draft, this.makeCtx(s, effects));
    a.state = draft;
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

  activities(s: SessionData): ActivityInfo[] {
    return s.activities.map((a, index) => {
      const phases = catalogEntry(a.gameId).phases;
      return {
        index,
        gameId: a.gameId,
        title: catalogEntry(a.gameId).title,
        status: a.status,
        phaseIndex: a.phaseIndex,
        phaseCount: phases.length,
        phaseTitle: phases[a.phaseIndex]?.title ?? null,
      };
    });
  }

  meta(s: SessionData, ctx: Ctx<unknown>): SessionMeta {
    const a = this.act(s);
    const mod = this.module(a);
    let spotlight: SessionMeta['spotlight'] = null;
    if (s.spotlight) {
      const g = s.groups.find((x) => x.id === s.spotlight!.groupId);
      if (g)
        spotlight = {
          groupId: g.id,
          groupName: g.name,
          startup: g.startup,
          endsAt: s.spotlight.endsAt,
          items: mod.summarize(a.state, g.id, ctx),
        };
    }
    return {
      code: s.code,
      gameId: a.gameId,
      gameTitle: catalogEntry(a.gameId).title,
      activityIndex: s.current,
      activities: this.activities(s),
      status: a.status,
      phases: this.phases(a),
      phaseIndex: a.phaseIndex,
      paused: a.paused,
      serverNow: ctx.now,
      phaseEndsAt: a.phaseEndsAt,
      groups: ctx.groups,
      spotlight,
      expectedGroups: s.expectedGroups,
    };
  }

  /**
   * Nombre de la dinámica en la exportación. Si se jugó dos veces la misma, la
   * segunda queda como "phish #2" para poder separarlas en la planilla.
   */
  private activityLabel(s: SessionData, index: number): string {
    const id = s.activities[index].gameId;
    const n = s.activities.slice(0, index + 1).filter((a) => a.gameId === id).length;
    return n > 1 ? `${id} #${n}` : id;
  }

  /** Filas de exportación de una dinámica (por defecto, de todas las de la sesión). */
  rows(s: SessionData, only?: number): ExportRow[] {
    const out: ExportRow[] = [];
    s.activities.forEach((a, index) => {
      if (only !== undefined && only !== index) return;
      const dinamica = this.activityLabel(s, index);
      const ctx = this.makeCtx(s, undefined, a);
      for (const { groupId, ...r } of this.module(a).exportRows(a.state, ctx)) {
        const g = groupId ? s.groups.find((x) => x.id === groupId) : null;
        out.push({ dinamica, grupo: g ? g.name : '(sesión)', startup: g ? g.startup : '', ...r });
      }
    });
    return out;
  }

  hostPayload(s: SessionData): StatePayload {
    const a = this.act(s);
    const ctx = this.makeCtx(s);
    const mod = this.module(a);
    const groups: HostGroupRow[] = ctx.groups.map((g) => {
      const st =
        a.status === 'running'
          ? mod.status(a.state, g.id, ctx)
          : { text: 'En la sala de espera', responded: false };
      return {
        id: g.id,
        status: st.text,
        responded: st.responded,
        summary: mod.summarize(a.state, g.id, ctx),
      };
    });
    return {
      role: 'host',
      meta: this.meta(s, ctx),
      view: mod.hostView(a.state, ctx),
      groups,
      rows: this.rows(s),
      seed: a.seed,
    };
  }

  screenPayload(s: SessionData): StatePayload {
    const a = this.act(s);
    const ctx = this.makeCtx(s);
    return {
      role: 'screen',
      meta: this.meta(s, ctx),
      view: this.module(a).publicView(a.state, ctx),
    };
  }

  groupPayload(s: SessionData, groupId: string): StatePayload | null {
    const a = this.act(s);
    const ctx = this.makeCtx(s);
    const me = ctx.groups.find((g) => g.id === groupId);
    if (!me) return null;
    return {
      role: 'group',
      meta: this.meta(s, ctx),
      view: this.module(a).groupView(a.state, groupId, ctx),
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
    return {
      app: 'CiberJunta',
      exportedAt: new Date().toISOString(),
      code: s.code,
      createdAt: new Date(s.createdAt).toISOString(),
      groups: s.groups.map((g) => ({
        id: g.id,
        name: g.name,
        startup: g.startup,
        roles: g.roles,
        removed: g.removed,
      })),
      activities: s.activities.map((a, index) => ({
        dinamica: this.activityLabel(s, index),
        gameId: a.gameId,
        gameTitle: catalogEntry(a.gameId).title,
        createdAt: new Date(a.createdAt).toISOString(),
        seed: a.seed,
        config: a.config,
        phases: this.phases(a),
        phaseIndex: a.phaseIndex,
        rows: this.rows(s, index),
        state: a.state,
      })),
      rows: this.rows(s),
    };
  }

  exportCsv(code: string): string {
    const s = this.get(code);
    return toCsv(this.rows(s), { sesion: s.code });
  }
}

export const rooms = {
  host: (code: string) => `${code}:host`,
  screen: (code: string) => `${code}:screen`,
  group: (code: string, id: string) => `${code}:g:${id}`,
  all: (code: string) => `${code}:all`,
};
