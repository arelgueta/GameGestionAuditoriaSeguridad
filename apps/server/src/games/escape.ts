import { z } from 'zod';
import { escape as E, type SummaryItem } from '@ciberjunta/shared';
import { GameError, type Ctx, type GameModule, type ModuleRow } from '../engine/types.js';
import { parseAction, parseContent, requirePhase } from './util.js';

const contentSchema = z.object({
  word: z.string().min(1).max(20),
  finalQuestion: z.string(),
  zones: z
    .array(
      z.object({
        id: z.enum([
          'monitor',
          'pendrive',
          'organigrama',
          'factura',
          'accesos',
          'drive',
          'calendario',
          'contrato',
        ]),
        object: z.string(),
        scene: z.string(),
        flaw: z.string(),
        correct: z.string(),
        distractors: z.array(z.string()).length(3),
        letter: z.string().length(1),
        category: z.enum(['personas', 'procesos', 'tecnologia']),
      }),
    )
    .length(8),
});
type Content = z.infer<typeof contentSchema>;
type C = Ctx<Content>;

interface ZoneProgress {
  solved: boolean;
  errors: number;
  lockedUntil: number | null;
}

interface GroupProgress {
  zones: Record<string, ZoneProgress>;
  escapedAt: number | null;
  attempts: number;
  final: string;
}

export interface EscapeState {
  startedAt: number | null;
  zoneOrder: string[];
  optionOrder: Record<string, number[]>;
  groups: Record<string, GroupProgress>;
}

export function normalizeWord(w: string): string {
  return w
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
}

function progress(s: EscapeState, gid: string, ctx: C): GroupProgress {
  if (!s.groups[gid]) {
    s.groups[gid] = {
      zones: Object.fromEntries(
        ctx.content.zones.map((z) => [z.id, { solved: false, errors: 0, lockedUntil: null }]),
      ),
      escapedAt: null,
      attempts: 0,
      final: '',
    };
  }
  return s.groups[gid];
}

function readProgress(s: EscapeState, gid: string): GroupProgress | null {
  return s.groups[gid] ?? null;
}

function timeUp(ctx: C) {
  return ctx.phaseEndsAt !== null && ctx.now > ctx.phaseEndsAt;
}

function zoneOptions(s: EscapeState, ctx: C, zoneId: string) {
  const z = ctx.content.zones.find((x) => x.id === zoneId)!;
  const all = [z.correct, ...z.distractors];
  return s.optionOrder[zoneId].map((i) => all[i]);
}

function lettersOf(p: GroupProgress | null, ctx: C) {
  if (!p) return [];
  return ctx.content.zones
    .filter((z) => p.zones[z.id]?.solved)
    .map((z) => z.letter)
    .sort();
}

function errorsOf(p: GroupProgress | null) {
  return p ? Object.values(p.zones).reduce((a, z) => a + z.errors, 0) : 0;
}

export function rankEscape<T extends { escapedMs: number | null; letters: number; errors: number }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.escapedMs !== null && b.escapedMs !== null) return a.escapedMs - b.escapedMs;
    if (a.escapedMs !== null) return -1;
    if (b.escapedMs !== null) return 1;
    return b.letters - a.letters || a.errors - b.errors;
  });
}

function publicView(s: EscapeState, ctx: C): E.EscapeView {
  const content = ctx.content;
  const zoneById = (id: string) => content.zones.find((z) => z.id === id)!;
  return {
    phase: ctx.phaseId,
    startedAt: s.startedAt,
    endsAt: ctx.phaseId === 'escape' ? ctx.phaseEndsAt : null,
    zones: s.zoneOrder.map((id) => ({
      id,
      object: zoneById(id).object,
      scene: zoneById(id).scene,
      options: zoneOptions(s, ctx, id),
    })),
    wordLength: content.word.length,
    finalQuestion: content.finalQuestion,
    ranking: rankEscape(
      ctx.groups.map((g) => {
        const p = readProgress(s, g.id);
        return {
          groupId: g.id,
          name: g.name,
          letters: lettersOf(p, ctx).length,
          escapedMs:
            p?.escapedAt != null && s.startedAt !== null ? p.escapedAt - s.startedAt : null,
          errors: errorsOf(p),
        };
      }),
    ),
    debrief:
      ctx.phaseId === 'debrief'
        ? {
            heat: content.zones.map((z) => ({
              id: z.id,
              object: z.object,
              flaw: z.flaw,
              correct: z.correct,
              category: z.category,
              errors: Object.values(s.groups).reduce((a, p) => a + (p.zones[z.id]?.errors ?? 0), 0),
              solvedBy: Object.values(s.groups).filter((p) => p.zones[z.id]?.solved).length,
            })),
            finals: ctx.groups
              .filter((g) => s.groups[g.id]?.final)
              .map((g) => ({ name: g.name, text: s.groups[g.id].final })),
            word: content.word,
          }
        : null,
  };
}

export const escapeModule: GameModule<EscapeState, Content> = {
  id: 'escape',
  parseContent: (raw) => {
    const c = parseContent('escape', contentSchema, raw);
    const letters = c.zones
      .map((z) => z.letter.toUpperCase())
      .sort()
      .join('');
    if (letters !== normalizeWord(c.word).split('').sort().join(''))
      throw new Error(
        'content/escape.json: las letras de las zonas deben formar exactamente la palabra final.',
      );
    return c;
  },
  init: (ctx) => ({
    startedAt: null,
    zoneOrder: ctx.rng.shuffle(ctx.content.zones.map((z) => z.id)),
    optionOrder: Object.fromEntries(
      ctx.content.zones.map((z) => [z.id, ctx.rng.shuffle([0, 1, 2, 3])]),
    ),
    groups: {},
  }),

  onPhaseEnter(s, ctx) {
    if (ctx.phaseId === 'escape' && s.startedAt === null) s.startedAt = ctx.now;
  },

  onGroupAction(s, gid, raw, ctx) {
    const a = parseAction(E.escapeGroupAction, raw);
    const p = progress(s, gid, ctx);
    if (a.type === 'final') {
      requirePhase(ctx, 'escape', 'debrief');
      if (p.escapedAt === null) throw new GameError('Primero abran el candado.');
      p.final = a.text;
      return;
    }
    requirePhase(ctx, 'escape');
    if (timeUp(ctx)) throw new GameError('Se terminó el tiempo.');
    if (p.escapedAt !== null) throw new GameError('Ya escaparon.');
    if (a.type === 'answer') {
      const zp = p.zones[a.zone];
      if (!zp) throw new GameError('Zona inexistente.');
      if (zp.solved) throw new GameError('Esa zona ya está resuelta.');
      if (zp.lockedUntil !== null && zp.lockedUntil > ctx.now)
        throw new GameError(
          `Esperen ${Math.ceil((zp.lockedUntil - ctx.now) / 1000)} s para reintentar esta zona.`,
        );
      if (s.optionOrder[a.zone][a.option] === 0) {
        zp.solved = true;
        zp.lockedUntil = null;
      } else {
        zp.errors++;
        zp.lockedUntil = ctx.now + Number(ctx.config.penaltySec) * 1000;
      }
      return;
    }
    if (!Object.values(p.zones).every((z) => z.solved)) throw new GameError('Les faltan letras.');
    p.attempts++;
    if (normalizeWord(a.word) !== normalizeWord(ctx.content.word))
      throw new GameError('El candado no abre: prueben otro orden.');
    p.escapedAt = ctx.now;
  },

  publicView,

  groupView(s, gid, ctx) {
    const p = readProgress(s, gid);
    return {
      ...publicView(s, ctx),
      me: {
        zones: s.zoneOrder.map((id) => {
          const z = ctx.content.zones.find((x) => x.id === id)!;
          const zp = p?.zones[id];
          return {
            id,
            solved: !!zp?.solved,
            errors: zp?.errors ?? 0,
            lockedUntil: zp?.lockedUntil ?? null,
            letter: zp?.solved ? z.letter : null,
            correct: zp?.solved ? z.correct : null,
            flaw: zp?.solved ? z.flaw : null,
          };
        }),
        letters: lettersOf(p, ctx),
        escapedAt: p?.escapedAt ?? null,
        attempts: p?.attempts ?? 0,
        final: p?.final ?? '',
      },
    } satisfies E.EscapeView;
  },

  hostView: publicView,

  status(s, gid, ctx) {
    const p = readProgress(s, gid);
    if (p?.escapedAt != null && s.startedAt !== null) {
      const sec = Math.round((p.escapedAt - s.startedAt) / 1000);
      return {
        text: `Escapó en ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`,
        responded: true,
      };
    }
    return {
      text: `${lettersOf(p, ctx).length}/8 letras · ${errorsOf(p)} errores`,
      responded: false,
    };
  },

  summarize(s, gid, ctx) {
    const p = readProgress(s, gid);
    const items: SummaryItem[] = [
      { label: 'Letras', value: lettersOf(p, ctx).join(' ') || '—' },
      { label: 'Errores', value: String(errorsOf(p)) },
    ];
    if (p?.escapedAt != null && s.startedAt !== null)
      items.push({
        label: 'Tiempo de escape',
        value: `${Math.round((p.escapedAt - s.startedAt) / 1000)} s`,
      });
    if (p?.final) items.push({ label: 'La falla más urgente', value: p.final });
    return items;
  },

  exportRows(s, ctx) {
    const rows: ModuleRow[] = [];
    for (const g of ctx.groups) {
      const p = readProgress(s, g.id);
      for (const z of ctx.content.zones) {
        const zp = p?.zones[z.id];
        rows.push({
          groupId: g.id,
          fase: 'escape',
          item: z.object,
          respuesta: zp?.solved ? 'Resuelta' : 'Sin resolver',
          detalle: `Errores: ${zp?.errors ?? 0}`,
          puntos: '',
        });
      }
      rows.push({
        groupId: g.id,
        fase: 'escape',
        item: 'Tiempo de escape (s)',
        respuesta:
          p?.escapedAt != null && s.startedAt !== null
            ? String(Math.round((p.escapedAt - s.startedAt) / 1000))
            : 'No escapó',
        detalle: `Intentos de candado: ${p?.attempts ?? 0}`,
        puntos: '',
      });
      if (p?.final)
        rows.push({
          groupId: g.id,
          fase: 'desafio',
          item: 'Falla más urgente',
          respuesta: p.final,
          detalle: '',
          puntos: '',
        });
    }
    return rows;
  },
};
