import { z } from 'zod';
import { countWords, crisis as K, type SummaryItem } from '@ciberjunta/shared';
import { GameError, type Ctx, type GameModule, type ModuleRow } from '../engine/types.js';
import { connectedIds, parseAction, parseContent, requirePhase, signed } from './util.js';

const contentSchema = z.object({
  startTrust: z.number().int(),
  noDecisionPoints: z.number().int(),
  maxWords: z.number().int().min(10),
  injects: z
    .array(
      z.object({
        minute: z.number(),
        title: z.string(),
        text: z.string(),
        debatable: z.boolean().optional(),
        options: z
          .array(z.object({ id: z.string().max(10), text: z.string(), points: z.number().int() }))
          .min(2),
      }),
    )
    .min(1),
  paymentArgs: z.object({
    against: z.array(z.string()),
    favor: z.array(z.string()),
    lesson: z.string(),
  }),
  finalQuestion: z.string(),
});
type Content = z.infer<typeof contentSchema>;
type C = Ctx<Content>;

interface Decision {
  option: string;
  justification: string;
  at: number;
}

interface Run {
  index: number;
  startedAt: number;
  endsAt: number;
  closed: boolean;
  decisions: Record<string, Decision>;
}

export interface CrisisState {
  runs: Run[];
  autoMode: boolean;
  showImmediate: boolean;
  nextAutoAt: number | null;
  closings: Record<string, { statement: string; prep: string[] }>;
}

// ---------------------------------------------------------------- puntaje (puro)

export function decisionPoints(content: Content, run: Run, gid: string): number | null {
  const d = run.decisions[gid];
  if (d) return content.injects[run.index].options.find((o) => o.id === d.option)?.points ?? 0;
  return run.closed ? content.noDecisionPoints : null;
}

export function trustOf(content: Content, runs: Run[], gid: string): number {
  return runs.reduce((acc, r) => acc + (decisionPoints(content, r, gid) ?? 0), content.startTrust);
}

function current(s: CrisisState): Run | null {
  const r = s.runs[s.runs.length - 1];
  return r ?? null;
}

function launch(s: CrisisState, ctx: C) {
  const cur = current(s);
  if (cur && !cur.closed) cur.closed = true;
  const next = cur ? cur.index + 1 : 0;
  if (next >= ctx.content.injects.length) throw new GameError('Ya se lanzaron todos los injects.');
  s.runs.push({
    index: next,
    startedAt: ctx.now,
    endsAt: ctx.now + Number(ctx.config.injectSec) * 1000,
    closed: false,
    decisions: {},
  });
  s.nextAutoAt = s.autoMode ? ctx.now + Number(ctx.config.autoIntervalSec) * 1000 : null;
  ctx.cue('bell');
}

function revealPoints(s: CrisisState, ctx: C) {
  return s.showImmediate || ctx.phaseId === 'debrief';
}

function optionText(ctx: C, index: number, id: string | null) {
  if (!id) return null;
  return ctx.content.injects[index].options.find((o) => o.id === id)?.text ?? id;
}

function publicView(s: CrisisState, ctx: C): K.CrisisView {
  const cur = current(s);
  const content = ctx.content;
  const showRank = revealPoints(s, ctx);
  const inj = cur ? content.injects[cur.index] : null;
  let debrief: K.CrisisDebrief | null = null;
  if (ctx.phaseId === 'debrief') {
    const dIdx = Math.max(
      0,
      content.injects.findIndex((i) => i.debatable),
    );
    const dRun = s.runs.find((r) => r.index === dIdx);
    debrief = {
      injects: content.injects.map((i) => ({
        minute: i.minute,
        title: i.title,
        options: i.options,
        debatable: !!i.debatable,
      })),
      timeline: ctx.groups
        .map((g) => ({
          groupId: g.id,
          name: g.name,
          trust: trustOf(content, s.runs, g.id),
          cells: content.injects.map((_, idx) => {
            const run = s.runs.find((r) => r.index === idx);
            if (!run) return { option: null, points: 0 };
            return {
              option: run.decisions[g.id]?.option ?? null,
              points: decisionPoints(content, run, g.id) ?? 0,
            };
          }),
        }))
        .sort((a, b) => b.trust - a.trust),
      debatableIndex: dIdx,
      debatableCounts: content.injects[dIdx].options.map((o) => ({
        option: o.id,
        text: o.text,
        count: dRun ? Object.values(dRun.decisions).filter((d) => d.option === o.id).length : 0,
      })),
      paymentArgs: content.paymentArgs,
      statements: ctx.groups
        .filter((g) => s.closings[g.id]?.statement)
        .map((g) => ({ name: g.name, statement: s.closings[g.id].statement })),
      prepItems: Object.values(s.closings)
        .flatMap((c) => c.prep)
        .filter(Boolean),
      finalQuestion: content.finalQuestion,
    };
  }
  return {
    phase: ctx.phaseId,
    startTrust: content.startTrust,
    totalInjects: content.injects.length,
    injectIndex: cur ? cur.index : -1,
    current:
      cur && inj
        ? {
            index: cur.index,
            minute: inj.minute,
            title: inj.title,
            text: inj.text,
            options: inj.options.map((o) => ({ id: o.id, text: o.text })),
            endsAt: cur.endsAt,
            closed: cur.closed,
            decidedCount: Object.keys(cur.decisions).length,
          }
        : null,
    autoMode: s.autoMode,
    nextAutoAt: s.nextAutoAt,
    showImmediate: s.showImmediate,
    maxWords: content.maxWords,
    ranking: showRank
      ? ctx.groups
          .map((g) => ({ groupId: g.id, name: g.name, trust: trustOf(content, s.runs, g.id) }))
          .sort((a, b) => b.trust - a.trust)
      : null,
    debrief,
  };
}

export const crisisModule: GameModule<CrisisState, Content> = {
  id: 'crisis',
  parseContent: (raw) => parseContent('crisis', contentSchema, raw),
  init: (ctx) => ({
    runs: [],
    autoMode: !!ctx.config.autoMode,
    showImmediate: !!ctx.config.showImmediate,
    nextAutoAt: null,
    closings: {},
  }),

  onPhaseEnter(s, ctx) {
    if (ctx.phaseId === 'comite' && s.autoMode && s.runs.length === 0) launch(s, ctx);
    if (ctx.phaseId !== 'comite') {
      const cur = current(s);
      if (cur) cur.closed = true;
      s.nextAutoAt = null;
    }
  },

  onGroupAction(s, gid, raw, ctx) {
    const a = parseAction(K.crisisGroupAction, raw);
    if (a.type === 'decide') {
      requirePhase(ctx, 'comite');
      const cur = current(s);
      if (!cur || cur.index !== a.inject || cur.closed)
        throw new GameError('Este inject ya está cerrado.');
      if (cur.decisions[gid]) throw new GameError('La decisión ya fue tomada y es irreversible.');
      if (!ctx.content.injects[cur.index].options.some((o) => o.id === a.option))
        throw new GameError('Opción inválida.');
      cur.decisions[gid] = { option: a.option, justification: a.justification, at: ctx.now };
      const ids = connectedIds(ctx);
      if (ids.length && ids.every((id) => cur.decisions[id])) cur.closed = true;
      return;
    }
    requirePhase(ctx, 'cierre');
    if (countWords(a.statement) > ctx.content.maxWords)
      throw new GameError(`El comunicado supera las ${ctx.content.maxWords} palabras.`);
    s.closings[gid] = { statement: a.statement, prep: a.prep };
  },

  onHostAction(s, raw, ctx) {
    const a = parseAction(K.crisisHostAction, raw);
    switch (a.type) {
      case 'nextInject':
        requirePhase(ctx, 'comite');
        launch(s, ctx);
        return;
      case 'closeInject': {
        const cur = current(s);
        if (!cur || cur.closed) throw new GameError('No hay un inject abierto.');
        cur.closed = true;
        return;
      }
      case 'setAuto': {
        s.autoMode = a.on;
        if (!a.on) s.nextAutoAt = null;
        else {
          const cur = current(s);
          const base = cur ? cur.startedAt + Number(ctx.config.autoIntervalSec) * 1000 : ctx.now;
          s.nextAutoAt = Math.max(base, ctx.now);
        }
        return;
      }
      case 'setShowImmediate':
        s.showImmediate = a.on;
        return;
    }
  },

  needsTick: (s) => {
    const cur = current(s);
    return (!!cur && !cur.closed) || (s.autoMode && s.nextAutoAt !== null);
  },

  onTick(s, ctx) {
    if (ctx.phaseId !== 'comite') return false;
    let changed = false;
    const cur = current(s);
    if (cur && !cur.closed && ctx.now >= cur.endsAt) {
      cur.closed = true;
      changed = true;
    }
    if (s.autoMode && s.nextAutoAt !== null && ctx.now >= s.nextAutoAt) {
      const next = cur ? cur.index + 1 : 0;
      if (next < ctx.content.injects.length) launch(s, ctx);
      else s.nextAutoAt = null;
      changed = true;
    }
    return changed;
  },

  publicView,

  groupView(s, gid, ctx) {
    const base = publicView(s, ctx);
    const reveal = revealPoints(s, ctx);
    const cur = current(s);
    const d = cur?.decisions[gid];
    return {
      ...base,
      me: {
        trust: reveal ? trustOf(ctx.content, s.runs, gid) : null,
        log: s.runs.map((r) => {
          const inj = ctx.content.injects[r.index];
          const dec = r.decisions[gid];
          return {
            index: r.index,
            minute: inj.minute,
            title: inj.title,
            option: optionText(ctx, r.index, dec?.option ?? null),
            justification: dec?.justification ?? '',
            points: reveal ? decisionPoints(ctx.content, r, gid) : null,
          };
        }),
        current: d ? { option: d.option, justification: d.justification } : null,
        closing: s.closings[gid] ?? null,
      },
    } satisfies K.CrisisView;
  },

  hostView(s, ctx) {
    const cur = current(s);
    return {
      ...publicView(s, ctx),
      ranking: ctx.groups
        .map((g) => ({ groupId: g.id, name: g.name, trust: trustOf(ctx.content, s.runs, g.id) }))
        .sort((a, b) => b.trust - a.trust),
      host: {
        decisions: ctx.groups.map((g) => ({
          groupId: g.id,
          name: g.name,
          option: cur?.decisions[g.id]?.option ?? null,
          justification: cur?.decisions[g.id]?.justification ?? '',
        })),
      },
    } satisfies K.CrisisView;
  },

  status(s, gid, ctx) {
    if (ctx.phaseId === 'comite') {
      const cur = current(s);
      if (!cur) return { text: 'Esperando el primer inject', responded: false };
      const d = cur.decisions[gid];
      if (d) return { text: `Inject ${cur.index + 1}: eligió ${d.option}`, responded: true };
      return {
        text: cur.closed
          ? `Inject ${cur.index + 1}: sin decisión`
          : `Inject ${cur.index + 1}: deliberando`,
        responded: false,
      };
    }
    return s.closings[gid]
      ? { text: 'Comunicado enviado', responded: true }
      : { text: 'Sin comunicado', responded: false };
  },

  summarize(s, gid, ctx) {
    const items: SummaryItem[] = [
      { label: 'Confianza del mercado', value: String(trustOf(ctx.content, s.runs, gid)) },
    ];
    for (const r of s.runs) {
      const d = r.decisions[gid];
      const p = decisionPoints(ctx.content, r, gid);
      items.push({
        label: `Min ${ctx.content.injects[r.index].minute}: ${ctx.content.injects[r.index].title}`,
        value: d
          ? `${d.option}) ${optionText(ctx, r.index, d.option)}${p !== null ? ` (${signed(p)})` : ''}${d.justification ? ` — “${d.justification}”` : ''}`
          : r.closed
            ? `Sin decisión (${signed(ctx.content.noDecisionPoints)})`
            : 'Deliberando…',
      });
    }
    const c = s.closings[gid];
    if (c) {
      items.push({ label: 'Comunicado público', value: c.statement });
      items.push({
        label: 'Lo que debían tener listo',
        value: c.prep
          .filter(Boolean)
          .map((p, i) => `${i + 1}. ${p}`)
          .join('\n'),
      });
    }
    return items;
  },

  exportRows(s, ctx) {
    const rows: ModuleRow[] = [];
    for (const g of ctx.groups) {
      for (const r of s.runs) {
        const inj = ctx.content.injects[r.index];
        const d = r.decisions[g.id];
        rows.push({
          groupId: g.id,
          fase: 'comite',
          item: `Min ${inj.minute}: ${inj.title}`,
          respuesta: d
            ? `${d.option}) ${optionText(ctx, r.index, d.option)}`
            : r.closed
              ? 'Sin decisión'
              : 'Abierto',
          detalle: d?.justification ?? '',
          puntos: decisionPoints(ctx.content, r, g.id) ?? '',
        });
      }
      const c = s.closings[g.id];
      if (c) {
        rows.push({
          groupId: g.id,
          fase: 'cierre',
          item: 'Comunicado público',
          respuesta: c.statement,
          detalle: `${countWords(c.statement)} palabras`,
          puntos: '',
        });
        c.prep.forEach((p, i) =>
          rows.push({
            groupId: g.id,
            fase: 'cierre',
            item: `Preparación ${i + 1}`,
            respuesta: p,
            detalle: '',
            puntos: '',
          }),
        );
      }
      rows.push({
        groupId: g.id,
        fase: 'total',
        item: 'Confianza final',
        respuesta: '',
        detalle: '',
        puntos: trustOf(ctx.content, s.runs, g.id),
      });
    }
    return rows;
  },
};
