import { z } from 'zod';
import { text } from './text.js';

export const GAME_IDS = [
  'phish',
  'crisis',
  'subasta',
  'escape',
  'boardroom',
  'shadowit',
  'juicio',
] as const;
export type GameId = (typeof GAME_IDS)[number];

export const ROLE_IDS = ['ceo', 'cfo', 'legales', 'cto', 'comunicacion'] as const;
export type RoleId = (typeof ROLE_IDS)[number];
export const ROLE_LABELS: Record<RoleId, string> = {
  ceo: 'CEO',
  cfo: 'CFO',
  legales: 'Legales',
  cto: 'CTO',
  comunicacion: 'Comunicación',
};

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`), 'Código inválido');

export const pinSchema = z.string().regex(/^\d{4}$/, 'El PIN debe tener 4 dígitos');
export const tokenSchema = z
  .string()
  .min(20)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/);

export interface PhaseInfo {
  id: string;
  title: string;
  durationSec: number | null;
}

export interface GroupInfo {
  id: string;
  name: string;
  startup: string;
  roles: Partial<Record<RoleId, string>>;
  connected: boolean;
}

export interface SummaryItem {
  label: string;
  value: string;
}

export interface Spotlight {
  groupId: string;
  groupName: string;
  startup: string;
  endsAt: number | null;
  items: SummaryItem[];
}

/** Resumen de cada dinámica cargada en la sesión (para elegir cuál mostrar). */
export interface ActivityInfo {
  index: number;
  gameId: GameId;
  title: string;
  status: 'lobby' | 'running';
  phaseIndex: number;
  phaseCount: number;
  /** Título de la fase actual, o null si está en la sala de espera. */
  phaseTitle: string | null;
}

export interface SessionMeta {
  code: string;
  /** Dinámica activa (la que ven los grupos y la pantalla). */
  gameId: GameId;
  gameTitle: string;
  activityIndex: number;
  activities: ActivityInfo[];
  status: 'lobby' | 'running';
  phases: PhaseInfo[];
  /** -1 = sala de espera */
  phaseIndex: number;
  paused: boolean;
  /** Reloj de juego del servidor al momento de enviar (no avanza en pausa). */
  serverNow: number;
  phaseEndsAt: number | null;
  groups: GroupInfo[];
  spotlight: Spotlight | null;
  expectedGroups: number;
}

export interface ExportRow {
  dinamica: string;
  grupo: string;
  startup: string;
  fase: string;
  item: string;
  respuesta: string;
  detalle: string;
  puntos: number | string;
}

export interface HostGroupRow {
  id: string;
  status: string;
  responded: boolean;
  summary: SummaryItem[];
}

export type StatePayload =
  | {
      role: 'host';
      meta: SessionMeta;
      view: unknown;
      groups: HostGroupRow[];
      rows: ExportRow[];
      seed: number;
    }
  | { role: 'screen'; meta: SessionMeta; view: unknown }
  | { role: 'group'; meta: SessionMeta; view: unknown; me: GroupInfo };

// ---------- Esquemas de entrada ----------

export const rolesSchema = z
  .object(
    Object.fromEntries(ROLE_IDS.map((r) => [r, text(30).optional()])) as Record<
      RoleId,
      z.ZodOptional<ReturnType<typeof text>>
    >,
  )
  .partial()
  .default({});

/** Una dinámica con su configuración: se usa al crear la sesión y al agregar otra después. */
export const activitySchema = z.object({
  gameId: z.enum(GAME_IDS),
  phaseDurations: z.record(z.string().max(40), z.number().int().min(30).max(7200)).default({}),
  config: z
    .record(z.string().max(40), z.union([z.boolean(), z.number(), z.string().max(40)]))
    .default({}),
});
export type ActivityInput = z.input<typeof activitySchema>;

export const createSessionSchema = activitySchema.extend({
  pin: pinSchema,
  expectedGroups: z.number().int().min(1).max(40).default(6),
});
export type CreateSessionInput = z.input<typeof createSessionSchema>;

/** Máximo de dinámicas que se pueden cargar en una misma sesión. */
export const MAX_ACTIVITIES = 12;

export const hostLoginSchema = z.object({ pin: pinSchema });

export const hostAttachSchema = z.object({ code: codeSchema, hostToken: tokenSchema });
export const screenAttachSchema = z.object({ code: codeSchema });
export const groupJoinSchema = z.object({
  code: codeSchema,
  name: text(40, 1),
  startup: text(60).default(''),
  roles: rolesSchema,
});
export type GroupJoinInput = z.input<typeof groupJoinSchema>;
export const groupAttachSchema = z.object({ code: codeSchema, groupToken: tokenSchema });

export const hostActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('nextPhase') }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('addTime'), seconds: z.number().int().min(-600).max(1800) }),
  z.object({
    type: z.literal('spotlight'),
    groupId: z.string().max(40),
    seconds: z.number().int().min(0).max(600).default(90),
  }),
  z.object({ type: z.literal('clearSpotlight') }),
  z.object({ type: z.literal('removeGroup'), groupId: z.string().max(40) }),
  z.object({ type: z.literal('game'), action: z.unknown() }),
  activitySchema.extend({ type: z.literal('addActivity') }),
  z.object({
    type: z.literal('switchActivity'),
    index: z
      .number()
      .int()
      .min(0)
      .max(MAX_ACTIVITIES - 1),
  }),
]);
export type HostAction = z.infer<typeof hostActionSchema>;
export type HostActionInput = z.input<typeof hostActionSchema>;

export type Ack<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string };

export type Cue = 'bell' | 'tick' | 'dice' | 'success' | 'alert';

export interface ServerToClient {
  state: (payload: StatePayload) => void;
  toast: (t: { kind: 'info' | 'error' | 'success'; text: string }) => void;
  cue: (c: Cue) => void;
  closed: (reason: string) => void;
}

export interface ClientToServer {
  'host:attach': (input: unknown, ack: (r: Ack) => void) => void;
  'screen:attach': (input: unknown, ack: (r: Ack) => void) => void;
  'group:join': (
    input: unknown,
    ack: (r: Ack<{ groupId: string; groupToken: string }>) => void,
  ) => void;
  'group:attach': (input: unknown, ack: (r: Ack) => void) => void;
  'host:action': (input: unknown, ack: (r: Ack) => void) => void;
  'group:action': (input: unknown, ack: (r: Ack) => void) => void;
}
