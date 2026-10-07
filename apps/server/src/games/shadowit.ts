import { z } from 'zod';
import { shadowit as SH, type SummaryItem } from '@ciberjunta/shared';
import { GameError, type Ctx, type GameModule, type ModuleRow } from '../engine/types.js';
import { parseAction, parseContent, requirePhase } from './util.js';

const idRe = /^[A-Za-z0-9_-]+$/;
const contentSchema = z.object({
  situation: z.string(),
  columns: z.array(z.object({ id: z.enum(SH.INVENTORY_COLUMNS), label: z.string() })).length(3),
  inventoryItems: z.array(z.object({ id: z.string().regex(idRe), text: z.string() })).min(1),
  products: z
    .array(
      z.object({
        id: z.enum(SH.AI_OPTIONS),
        name: z.string(),
        setupCost: z.number().min(0),
        perUserMonth: z.number().min(0),
        yearlyFixed: z.number().min(0),
        priceLabel: z.string(),
      }),
    )
    .length(3),
  criteria: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      tooltip: z.string(),
      values: z.object({ gratis: z.string(), pro: z.string(), onprem: z.string() }),
    }),
  ),
  cards: z
    .array(z.object({ id: z.string().regex(idRe), text: z.string(), reference: z.enum(SH.LIGHTS) }))
    .min(1),
  defaultRule: z.string(),
  debriefMessage: z.string(),
});
type Content = z.infer<typeof contentSchema>;
type C = Ctx<Content>;

export interface ShadowitState {
  inventory: Record<string, Record<string, { column: SH.InventoryColumn | null; why: string }>>;
  diligence: Record<string, { option: SH.AiOption; users: number; questions: string[] }>;
  semaforo: Record<string, { cards: Record<string, SH.Light | null>; rule: string }>;
}

/** Costo total a N años de una opción de IA. */
export function aiCost(p: Content['products'][number], users: number, years: number): number {
  return p.setupCost + years * (p.yearlyFixed + p.perUserMonth * users * 12);
}

/** Cuántas tarjetas coinciden con la referencia (no es "correcto/incorrecto"). */
export function referenceMatch(
  cards: Record<string, SH.Light | null>,
  content: Pick<Content, 'cards'>,
) {
  const match = content.cards.filter((c) => cards[c.id] === c.reference).length;
  return { match, total: content.cards.length };
}

function publicView(s: ShadowitState, ctx: C): SH.ShadowitView {
  const content = ctx.content;
  const zeroCols = (): Record<SH.InventoryColumn, number> => ({
    prohibir: 0,
    reemplazar: 0,
    permitir: 0,
  });
  const zeroLights = (): Record<SH.Light, number> => ({ verde: 0, amarillo: 0, rojo: 0 });
  const groupsWith = <T>(rec: Record<string, T>) => ctx.groups.filter((g) => rec[g.id]);
  return {
    phase: ctx.phaseId,
    situation: content.situation,
    inventoryItems: content.inventoryItems,
    columns: content.columns,
    products: content.products,
    criteria: content.criteria,
    cards: content.cards.map(({ id, text }) => ({ id, text })),
    defaultRule: content.defaultRule,
    submitted: {
      inventory: Object.keys(s.inventory).length,
      diligence: Object.keys(s.diligence).length,
      semaforo: Object.keys(s.semaforo).length,
    },
    debrief:
      ctx.phaseId === 'debrief'
        ? {
            message: content.debriefMessage,
            inventory: content.inventoryItems.map((it) => {
              const counts = zeroCols();
              const why: string[] = [];
              for (const g of groupsWith(s.inventory)) {
                const v = s.inventory[g.id][it.id];
                if (v?.column) counts[v.column]++;
                if (v?.why) why.push(`${g.name}: ${v.why}`);
              }
              return { id: it.id, text: it.text, counts, why };
            }),
            options: (() => {
              const o: Record<SH.AiOption, number> = { gratis: 0, pro: 0, onprem: 0 };
              for (const d of Object.values(s.diligence)) o[d.option]++;
              return o;
            })(),
            questions: groupsWith(s.diligence).map((g) => ({
              name: g.name,
              option: s.diligence[g.id].option,
              questions: s.diligence[g.id].questions,
            })),
            cards: content.cards.map((c) => {
              const counts = zeroLights();
              for (const sem of Object.values(s.semaforo)) {
                const v = sem.cards[c.id];
                if (v) counts[v]++;
              }
              return { id: c.id, text: c.text, reference: c.reference, counts };
            }),
            matches: groupsWith(s.semaforo).map((g) => ({
              name: g.name,
              ...referenceMatch(s.semaforo[g.id].cards, content),
            })),
            rules: groupsWith(s.semaforo)
              .filter((g) => s.semaforo[g.id].rule)
              .map((g) => ({ name: g.name, rule: s.semaforo[g.id].rule })),
          }
        : null,
  };
}

export const shadowitModule: GameModule<ShadowitState, Content> = {
  id: 'shadowit',
  parseContent: (raw) => parseContent('shadowit', contentSchema, raw),
  init: () => ({ inventory: {}, diligence: {}, semaforo: {} }),

  onGroupAction(s, gid, raw, ctx) {
    const a = parseAction(SH.shadowitGroupAction, raw);
    switch (a.type) {
      case 'inventory': {
        requirePhase(ctx, 'inventario');
        const ids = new Set(ctx.content.inventoryItems.map((i) => i.id));
        if (Object.keys(a.items).some((k) => !ids.has(k))) throw new GameError('Tarjeta inválida.');
        s.inventory[gid] = a.items;
        return;
      }
      case 'diligence':
        requirePhase(ctx, 'diligencia');
        s.diligence[gid] = { option: a.option, users: a.users, questions: a.questions };
        return;
      case 'semaforo': {
        requirePhase(ctx, 'semaforo');
        const ids = new Set(ctx.content.cards.map((c) => c.id));
        if (Object.keys(a.cards).some((k) => !ids.has(k))) throw new GameError('Tarjeta inválida.');
        s.semaforo[gid] = { cards: a.cards, rule: a.rule };
        return;
      }
    }
  },

  publicView,

  groupView(s, gid, ctx) {
    return {
      ...publicView(s, ctx),
      me: {
        inventory: s.inventory[gid] ?? null,
        diligence: s.diligence[gid] ?? null,
        semaforo: s.semaforo[gid] ?? null,
      },
    } satisfies SH.ShadowitView;
  },

  hostView: publicView,

  status(s, gid, ctx) {
    const done = (ok: boolean, yes: string, no: string) =>
      ok ? { text: yes, responded: true } : { text: no, responded: false };
    switch (ctx.phaseId) {
      case 'inventario':
        return done(!!s.inventory[gid], 'Inventario enviado', 'Clasificando');
      case 'diligencia':
        return done(
          !!s.diligence[gid],
          `Eligió ${s.diligence[gid]?.option ?? ''}`,
          'Comparando opciones',
        );
      case 'semaforo':
        return done(!!s.semaforo[gid], 'Semáforo enviado', 'Armando la política');
      default:
        return { text: 'Debriefing', responded: true };
    }
  },

  summarize(s, gid, ctx) {
    const items: SummaryItem[] = [];
    const inv = s.inventory[gid];
    const colLabel = (c: string | null) =>
      ctx.content.columns.find((x) => x.id === c)?.label ?? 'Sin clasificar';
    if (inv)
      items.push({
        label: 'Inventario',
        value: ctx.content.inventoryItems
          .map(
            (it) =>
              `• ${it.text} → ${colLabel(inv[it.id]?.column ?? null)}${inv[it.id]?.why ? ` (¿por qué la usan? ${inv[it.id].why})` : ''}`,
          )
          .join('\n'),
      });
    const d = s.diligence[gid];
    if (d) {
      const p = ctx.content.products.find((x) => x.id === d.option)!;
      items.push({
        label: 'Opción elegida',
        value: `${p.name} para ${d.users} usuarios: USD ${aiCost(p, d.users, 1).toLocaleString('es-AR')} el 1.er año, USD ${aiCost(p, d.users, 3).toLocaleString('es-AR')} a 3 años`,
      });
      items.push({
        label: 'Preguntas al proveedor',
        value: d.questions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
      });
    }
    const sem = s.semaforo[gid];
    if (sem) {
      const m = referenceMatch(sem.cards, ctx.content);
      items.push({ label: 'Semáforo', value: `${m.match}/${m.total} coinciden con la referencia` });
      if (sem.rule) items.push({ label: 'Regla de responsabilidad', value: sem.rule });
    }
    return items;
  },

  exportRows(s, ctx) {
    const rows: ModuleRow[] = [];
    for (const g of ctx.groups) {
      const inv = s.inventory[g.id];
      if (inv)
        for (const it of ctx.content.inventoryItems)
          rows.push({
            groupId: g.id,
            fase: 'inventario',
            item: it.text,
            respuesta: inv[it.id]?.column ?? '',
            detalle: inv[it.id]?.why ?? '',
            puntos: '',
          });
      const d = s.diligence[g.id];
      if (d) {
        const p = ctx.content.products.find((x) => x.id === d.option)!;
        rows.push({
          groupId: g.id,
          fase: 'diligencia',
          item: 'Opción elegida',
          respuesta: p.name,
          detalle: `${d.users} usuarios; 1 año USD ${aiCost(p, d.users, 1)}; 3 años USD ${aiCost(p, d.users, 3)}`,
          puntos: '',
        });
        d.questions.forEach((q, i) =>
          rows.push({
            groupId: g.id,
            fase: 'diligencia',
            item: `Pregunta ${i + 1}`,
            respuesta: q,
            detalle: '',
            puntos: '',
          }),
        );
      }
      const sem = s.semaforo[g.id];
      if (sem) {
        for (const c of ctx.content.cards)
          rows.push({
            groupId: g.id,
            fase: 'semaforo',
            item: c.text,
            respuesta: sem.cards[c.id] ?? '',
            detalle: `Referencia: ${c.reference}`,
            puntos: sem.cards[c.id] === c.reference ? 1 : 0,
          });
        rows.push({
          groupId: g.id,
          fase: 'semaforo',
          item: 'Regla de responsabilidad',
          respuesta: sem.rule,
          detalle: '',
          puntos: '',
        });
      }
    }
    return rows;
  },
};
