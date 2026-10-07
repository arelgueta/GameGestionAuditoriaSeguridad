import type { Cue, ExportRow, GameId, GroupInfo, SummaryItem } from '@ciberjunta/shared';
import type { Rng } from './rng.js';

/** Error esperable de juego: el mensaje se muestra tal cual al usuario. */
export class GameError extends Error {}

export interface Ctx<C> {
  /** Reloj de juego en ms (no avanza mientras la sesión está en pausa). */
  now: number;
  rng: Rng;
  content: C;
  config: Record<string, boolean | number | string>;
  /** Grupos activos (no eliminados), en orden de llegada. */
  groups: GroupInfo[];
  phaseId: string;
  /** Fin del temporizador general de la fase (reloj de juego) o null. */
  phaseEndsAt: number | null;
  groupName(id: string): string;
  cue(c: Cue): void;
  toast(text: string): void;
}

export type ModuleRow = Omit<ExportRow, 'dinamica' | 'grupo' | 'startup'> & {
  groupId: string | null;
};

/**
 * Contrato de cada dinámica. El motor clona el estado antes de llamar a
 * cualquier función que lo modifique, de modo que si la función lanza un
 * error el estado anterior queda intacto (transacción). Así la lógica de
 * puntaje puede escribirse como funciones puras y testearse aislada.
 */
export interface GameModule<S, C> {
  id: GameId;
  parseContent(raw: unknown): C;
  init(ctx: Ctx<C>): S;
  onPhaseEnter?(s: S, ctx: Ctx<C>): void;
  onGroupAction(s: S, groupId: string, action: unknown, ctx: Ctx<C>): void;
  onHostAction?(s: S, action: unknown, ctx: Ctx<C>): void;
  /** Devuelve true si cambió algo (para retransmitir). */
  onTick?(s: S, ctx: Ctx<C>): boolean;
  /** true si el módulo tiene un temporizador propio en curso (evita clonar en cada tick). */
  needsTick?(s: S, ctx: Ctx<C>): boolean;
  publicView(s: S, ctx: Ctx<C>): unknown;
  groupView(s: S, groupId: string, ctx: Ctx<C>): unknown;
  hostView(s: S, ctx: Ctx<C>): unknown;
  status(s: S, groupId: string, ctx: Ctx<C>): { text: string; responded: boolean };
  summarize(s: S, groupId: string, ctx: Ctx<C>): SummaryItem[];
  exportRows(s: S, ctx: Ctx<C>): ModuleRow[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModule = GameModule<any, any>;
