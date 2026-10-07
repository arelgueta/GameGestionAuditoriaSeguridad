import { z } from 'zod';
import { boardroom as B, type SummaryItem } from '@ciberjunta/shared';
import { GameError, type Ctx, type GameModule, type ModuleRow } from '../engine/types.js';
import { parseAction, parseContent, requirePhase } from './util.js';

const option = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]+$/), label: z.string() });
const contentSchema = z.object({
  budget: z.number().int().min(0),
  fundsMinChars: z.number().int().min(0),
  providers: z
    .array(
      z.object({
        id: z.string().regex(/^[A-Za-z0-9_-]+$/),
        name: z.string(),
        price: z.number().min(0),
        priceNote: z.string().optional(),
        methodology: z.string(),
        deliverables: z.string(),
        contract: z.string(),
      }),
    )
    .min(1),
  feedback: z.object({
    red: z.string(),
    yellowOnlyC: z.string(),
    green: z.string(),
    overBudget: z.string(),
    empty: z.string(),
    neutral: z.string(),
  }),
  finding: z.object({ text: z.string(), analogy: z.string() }),
  legalOptions: z.array(option),
  decisionOptions: z.array(option),
  calcDefaults: B.calcSchema,
  twists: z.array(z.object({ text: z.string(), debrief: z.string() })).min(1),
});
type Content = z.infer<typeof contentSchema>;
type C = Ctx<Content>;

export interface BoardroomState {
  baskets: Record<string, { items: string[]; fundsRequest: string; memo: string }>;
  findings: Record<string, B.Finding>;
  twists: Record<string, { card: number; response: string }>;
  rules: Record<string, string>;
  dealt: boolean;
}

// ---------------------------------------------------------------- reglas puras

export function basketTotal(items: readonly string[], providers: Content['providers']): number {
  return items.reduce((a, id) => a + (providers.find((p) => p.id === id)?.price ?? 0), 0);
}

/**
 * Retroalimentación de la fase 1 (se muestra recién en el debriefing).
 * - Incluye A → rojo. - Solo C → amarillo.
 * - B-web, B-web + C o B-full con pedido de fondos justificado → verde.
 */
export function evaluateBasket(
  items: readonly string[],
  fundsRequest: string,
  content: Pick<Content, 'providers' | 'budget' | 'fundsMinChars' | 'feedback'>,
): B.BasketFeedback {
  const set = new Set(items);
  const fb = content.feedback;
  const justified = fundsRequest.trim().length >= content.fundsMinChars;
  const total = basketTotal(items, content.providers);
  const messages: string[] = [];
  if (!items.length) return { level: 'neutral', messages: [fb.empty] };
  if (set.has('A')) return { level: 'red', messages: [fb.red] };
  if (set.size === 1 && set.has('C')) return { level: 'yellow', messages: [fb.yellowOnlyC] };
  const key = [...set].sort().join('+');
  const greenCombos = ['B-web', 'B-web+C'];
  if (greenCombos.includes(key) && (total <= content.budget || justified))
    return { level: 'green', messages: [fb.green] };
  if (key === 'B-full' && justified) return { level: 'green', messages: [fb.green] };
  if (total > content.budget && !justified) messages.push(fb.overBudget);
  else messages.push(fb.neutral);
  return { level: total > content.budget && !justified ? 'yellow' : 'neutral', messages };
}

/** Pérdida anual esperada = clientes × costo × probabilidad; costo de corregir = horas × costo hora. */
export function expectedLoss(c: B.Calc) {
  return {
    loss: Math.round(c.clients * c.costPerClient * (c.probability / 100)),
    fix: Math.round(c.hours * c.hourCost),
  };
}

/**
 * Reparte cartas sin repetir mientras alcancen (empezando por las que nadie
 * recibió todavía); cuando se agotan, se vuelve a barajar el mazo completo.
 */
export function dealCards(
  groupIds: readonly string[],
  deckSize: number,
  used: ReadonlySet<number>,
  shuffle: (a: number[]) => number[],
) {
  const out: Record<string, number> = {};
  let deck = shuffle([...Array(deckSize).keys()].filter((i) => !used.has(i)));
  for (const gid of groupIds) {
    if (!deck.length) deck = shuffle([...Array(deckSize).keys()]);
    out[gid] = deck.pop()!;
  }
  return out;
}

// ---------------------------------------------------------------- vistas

function publicView(s: BoardroomState, ctx: C): B.BoardroomView {
  const content = ctx.content;
  return {
    phase: ctx.phaseId,
    budget: content.budget,
    fundsMinChars: content.fundsMinChars,
    providers: content.providers,
    finding: content.finding,
    legalOptions: content.legalOptions,
    decisionOptions: content.decisionOptions,
    calcDefaults: content.calcDefaults,
    twistsDealt: s.dealt,
    submitted: {
      basket: Object.keys(s.baskets).length,
      finding: Object.keys(s.findings).length,
      twist: Object.values(s.twists).filter((t) => t.response).length,
      rule: Object.keys(s.rules).length,
    },
    debrief:
      ctx.phaseId === 'debrief'
        ? {
            groups: ctx.groups.map((g) => {
              const b = s.baskets[g.id];
              const t = s.twists[g.id];
              return {
                groupId: g.id,
                name: g.name,
                startup: g.startup,
                basket: b?.items ?? [],
                total: basketTotal(b?.items ?? [], content.providers),
                feedback: evaluateBasket(b?.items ?? [], b?.fundsRequest ?? '', content),
                urgency: s.findings[g.id]?.urgency ?? null,
                rule: s.rules[g.id] ?? '',
                twist: t
                  ? {
                      text: content.twists[t.card].text,
                      response: t.response,
                      debrief: content.twists[t.card].debrief,
                    }
                  : null,
              };
            }),
          }
        : null,
  };
}

export const boardroomModule: GameModule<BoardroomState, Content> = {
  id: 'boardroom',
  parseContent: (raw) => parseContent('boardroom', contentSchema, raw),
  init: () => ({ baskets: {}, findings: {}, twists: {}, rules: {}, dealt: false }),

  onGroupAction(s, gid, raw, ctx) {
    const a = parseAction(B.boardroomGroupAction, raw);
    switch (a.type) {
      case 'basket': {
        requirePhase(ctx, 'seleccion');
        const ids = new Set(ctx.content.providers.map((p) => p.id));
        const items = [...new Set(a.items)];
        if (items.some((i) => !ids.has(i))) throw new GameError('Proveedor inválido.');
        const total = basketTotal(items, ctx.content.providers);
        if (a.fundsRequest && a.fundsRequest.length < ctx.content.fundsMinChars)
          throw new GameError(
            `El pedido de fondos necesita al menos ${ctx.content.fundsMinChars} caracteres.`,
          );
        if (total > ctx.content.budget && !a.fundsRequest)
          throw new GameError(
            'Se pasan del presupuesto: ajusten la canasta o pidan más fondos al inversor.',
          );
        s.baskets[gid] = { items, fundsRequest: a.fundsRequest, memo: a.memo };
        return;
      }
      case 'finding': {
        requirePhase(ctx, 'hallazgo', 'giro');
        const legal = new Set(ctx.content.legalOptions.map((o) => o.id));
        const dec = new Set(ctx.content.decisionOptions.map((o) => o.id));
        if (
          a.finding.legal.some((x) => !legal.has(x)) ||
          a.finding.decisions.some((x) => !dec.has(x))
        )
          throw new GameError('Opción inválida.');
        s.findings[gid] = a.finding;
        return;
      }
      case 'twist': {
        requirePhase(ctx, 'giro', 'regla');
        const t = s.twists[gid];
        if (!t) throw new GameError('Todavía no recibieron un giro de trama.');
        t.response = a.response;
        return;
      }
      case 'rule':
        requirePhase(ctx, 'regla');
        s.rules[gid] = a.rule;
        return;
    }
  },

  onHostAction(s, raw, ctx) {
    parseAction(B.boardroomHostAction, raw);
    requirePhase(ctx, 'giro');
    const pending = ctx.groups.filter((g) => !s.twists[g.id]).map((g) => g.id);
    if (!pending.length) throw new GameError('Todos los grupos ya tienen su giro.');
    const used = new Set(Object.values(s.twists).map((t) => t.card));
    const dealt = dealCards(pending, ctx.content.twists.length, used, (d) => ctx.rng.shuffle(d));
    for (const gid of pending) s.twists[gid] = { card: dealt[gid], response: '' };
    s.dealt = true;
    ctx.cue('bell');
  },

  publicView,

  groupView(s, gid, ctx) {
    const b = s.baskets[gid];
    const t = s.twists[gid];
    return {
      ...publicView(s, ctx),
      me: {
        basket: b ?? null,
        finding: s.findings[gid] ?? null,
        twist: t ? { text: ctx.content.twists[t.card].text, response: t.response } : null,
        rule: s.rules[gid] ?? '',
        feedback:
          ctx.phaseId === 'debrief'
            ? evaluateBasket(b?.items ?? [], b?.fundsRequest ?? '', ctx.content)
            : null,
      },
    } satisfies B.BoardroomView;
  },

  hostView: publicView,

  status(s, gid, ctx) {
    const done = (ok: boolean, yes: string, no: string) =>
      ok ? { text: yes, responded: true } : { text: no, responded: false };
    switch (ctx.phaseId) {
      case 'seleccion':
        return done(!!s.baskets[gid], 'Canasta y memo enviados', 'Eligiendo proveedor');
      case 'hallazgo':
        return done(!!s.findings[gid], 'Análisis enviado', 'Analizando el hallazgo');
      case 'giro':
        return done(
          !!s.twists[gid]?.response,
          'Respondió el giro',
          s.twists[gid] ? 'Respondiendo el giro' : 'Sin giro asignado',
        );
      case 'regla':
        return done(!!s.rules[gid], 'Regla enviada', 'Escribiendo la regla');
      default:
        return { text: 'Debriefing', responded: true };
    }
  },

  summarize(s, gid, ctx) {
    const items: SummaryItem[] = [];
    const b = s.baskets[gid];
    const label = (id: string) => ctx.content.providers.find((p) => p.id === id)?.name ?? id;
    if (b) {
      items.push({
        label: 'Canasta',
        value: `${b.items.map(label).join(' + ') || 'Vacía'} (USD ${basketTotal(b.items, ctx.content.providers).toLocaleString('es-AR')})`,
      });
      items.push({ label: 'Memo al inversor', value: b.memo });
      if (b.fundsRequest) items.push({ label: 'Pedido de fondos', value: b.fundsRequest });
    }
    const f = s.findings[gid];
    if (f) {
      const { loss, fix } = expectedLoss(f.calc);
      items.push({ label: 'Impacto en el negocio', value: f.impact });
      items.push({
        label: 'Urgencia',
        value: `${f.urgency}${f.urgencyWhy ? ` — ${f.urgencyWhy}` : ''}`,
      });
      items.push({
        label: 'Marco legal',
        value:
          [
            ...f.legal.map((x) => ctx.content.legalOptions.find((o) => o.id === x)?.label ?? x),
            f.legalText,
          ]
            .filter(Boolean)
            .join('; ') || '—',
      });
      items.push({
        label: 'Decisión gerencial',
        value:
          [
            ...f.decisions.map(
              (x) => ctx.content.decisionOptions.find((o) => o.id === x)?.label ?? x,
            ),
            f.decisionText,
          ]
            .filter(Boolean)
            .join('; ') || '—',
      });
      items.push({
        label: 'Pérdida esperada vs. corrección',
        value: `USD ${loss.toLocaleString('es-AR')} vs. USD ${fix.toLocaleString('es-AR')}`,
      });
    }
    const t = s.twists[gid];
    if (t)
      items.push({
        label: `Giro: ${ctx.content.twists[t.card].text}`,
        value: t.response || '(sin respuesta)',
      });
    if (s.rules[gid]) items.push({ label: 'Regla de oro', value: s.rules[gid] });
    return items;
  },

  exportRows(s, ctx) {
    const rows: ModuleRow[] = [];
    for (const g of ctx.groups) {
      const b = s.baskets[g.id];
      if (b) {
        const fb = evaluateBasket(b.items, b.fundsRequest, ctx.content);
        rows.push({
          groupId: g.id,
          fase: 'seleccion',
          item: 'Canasta',
          respuesta: b.items.join(' + '),
          detalle: `Total USD ${basketTotal(b.items, ctx.content.providers)} | Semáforo: ${fb.level} | ${fb.messages.join(' ')}`,
          puntos: '',
        });
        rows.push({
          groupId: g.id,
          fase: 'seleccion',
          item: 'Memo al inversor',
          respuesta: b.memo,
          detalle: '',
          puntos: '',
        });
        if (b.fundsRequest)
          rows.push({
            groupId: g.id,
            fase: 'seleccion',
            item: 'Pedido de fondos',
            respuesta: b.fundsRequest,
            detalle: '',
            puntos: '',
          });
      }
      const f = s.findings[g.id];
      if (f) {
        const { loss, fix } = expectedLoss(f.calc);
        rows.push({
          groupId: g.id,
          fase: 'hallazgo',
          item: 'Impacto en el negocio',
          respuesta: f.impact,
          detalle: '',
          puntos: '',
        });
        rows.push({
          groupId: g.id,
          fase: 'hallazgo',
          item: 'Marco legal',
          respuesta: f.legal.join(', '),
          detalle: f.legalText,
          puntos: '',
        });
        rows.push({
          groupId: g.id,
          fase: 'hallazgo',
          item: 'Urgencia',
          respuesta: f.urgency,
          detalle: f.urgencyWhy,
          puntos: '',
        });
        rows.push({
          groupId: g.id,
          fase: 'hallazgo',
          item: 'Decisión gerencial',
          respuesta: f.decisions.join(', '),
          detalle: f.decisionText,
          puntos: '',
        });
        rows.push({
          groupId: g.id,
          fase: 'hallazgo',
          item: 'Calculadora',
          respuesta: `Pérdida esperada USD ${loss} vs. corrección USD ${fix}`,
          detalle: JSON.stringify(f.calc),
          puntos: '',
        });
      }
      const t = s.twists[g.id];
      if (t)
        rows.push({
          groupId: g.id,
          fase: 'giro',
          item: ctx.content.twists[t.card].text,
          respuesta: t.response,
          detalle: '',
          puntos: '',
        });
      if (s.rules[g.id])
        rows.push({
          groupId: g.id,
          fase: 'regla',
          item: 'Regla de oro',
          respuesta: s.rules[g.id],
          detalle: '',
          puntos: '',
        });
    }
    return rows;
  },
};
