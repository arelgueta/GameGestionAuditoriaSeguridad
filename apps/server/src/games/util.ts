import type { z } from 'zod';
import { GameError, type Ctx } from '../engine/types.js';

/** Valida una acción entrante; si es inválida, la descarta con un mensaje genérico. */
export function parseAction<T extends z.ZodTypeAny>(schema: T, action: unknown): z.infer<T> {
  const r = schema.safeParse(action);
  if (!r.success) {
    const first = r.error.issues[0];
    const detail =
      first?.code === 'too_big'
        ? ' (texto demasiado largo)'
        : first?.code === 'too_small'
          ? ' (falta completar)'
          : '';
    throw new GameError(`Acción inválida${detail}.`);
  }
  return r.data;
}

/** Valida el JSON de /content con mensajes claros para el docente. */
export function parseContent<T extends z.ZodTypeAny>(
  id: string,
  schema: T,
  raw: unknown,
): z.infer<T> {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const msg = r.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)
      .join('; ');
    throw new Error(`content/${id}.json tiene errores → ${msg}`);
  }
  return r.data;
}

export function requirePhase(ctx: Ctx<unknown>, ...phases: string[]) {
  if (!phases.includes(ctx.phaseId))
    throw new GameError('Esa acción no está disponible en esta fase.');
}

export function connectedIds(ctx: Ctx<unknown>): string[] {
  return ctx.groups.filter((g) => g.connected).map((g) => g.id);
}

export function snippet(text: string | undefined | null, max = 140): string {
  if (!text) return '—';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
