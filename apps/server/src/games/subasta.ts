import { z } from 'zod';
import { subasta as S, type SummaryItem } from '@ciberjunta/shared';
import { GameError, type Ctx, type GameModule, type ModuleRow } from '../engine/types.js';
import { parseAction, parseContent, requirePhase } from './util.js';

const contentSchema = z.object({
  coinsStart: z.number().int().min(1),
  baseScore: z.number().int(),
  affectedMax: z.number().int().min(0).max(6),
  insuranceId: z.string(),
  responsePlanId: z.string(),
  responsePlanBonus: z.number().int(),
  threatExamples: z.array(z.string()),
  controls: z
    .array(
      z.object({
        id: z.string().regex(/^[A-Za-z0-9_-]+$/),
        name: z.string(),
        units: z.number().int().min(1),
        basePrice: z.number().int().min(1),
        protects: z.string(),
      }),
    )
    .min(1),
  incidents: z
    .array(
      z.object({
        id: z.string().regex(/^[A-Za-z0-9_-]+$/),
        name: z.string(),
        damage: z.number().int().min(0),
        nullifiedBy: z.string().nullable(),
        halvedBy: z.string().nullable(),
      }),
    )
    .min(1),
  riskResponses: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      text: z.string(),
      controls: z.array(z.string()),
    }),
  ),
});
type Content = z.infer<typeof contentSchema>;
type Incident = Content['incidents'][number];
type C = Ctx<Content>;

export interface Bid {
  amount: number;
  at: number;
}

export interface Lot {
  controlId: string;
  units: number;
  status: 'open' | 'closed';
  openedAt: number;
  endsAt: number;
  bids: Record<string, Bid>;
  winners: { groupId: string; amount: number }[];
}

export interface SubastaState {
  threats: Record<string, S.Threat[]>;
  lots: Record<string, Lot>;
  currentLot: string | null;
  purchases: Record<string, string[]>;
  spent: Record<string, number>;
  revealed: { id: string; rolls: Record<string, number> }[];
  reflections: Record<string, string>;
}

// ---------------------------------------------------------------- reglas puras

export interface Rules {
  affectedMax: number;
  insuranceId: string;
  responsePlanId: string;
  responsePlanBonus: number;
}

/**
 * Orden: control que anula → control que reduce a la mitad → ciberseguro
 * (mitad del daño restante, redondeando hacia arriba) → plan de respuesta.
 */
export function resolveIncident(
  inc: Pick<Incident, 'damage' | 'nullifiedBy' | 'halvedBy'>,
  owned: readonly string[],
  roll: number,
  rules: Rules,
  name: (controlId: string) => string = (x) => x,
): S.IncidentOutcome {
  const has = (id: string | null) => !!id && owned.includes(id);
  if (roll > rules.affectedMax)
    return {
      roll,
      affected: false,
      base: inc.damage,
      damage: 0,
      bonus: 0,
      notes: ['Se salvaron por los dados'],
    };
  const notes: string[] = [];
  let dmg = inc.damage;
  if (has(inc.nullifiedBy)) {
    dmg = 0;
    notes.push(`Anulado por ${name(inc.nullifiedBy!)}`);
  } else {
    if (has(inc.halvedBy)) {
      dmg = Math.ceil(dmg / 2);
      notes.push(`Mitad por ${name(inc.halvedBy!)}`);
    }
    if (has(rules.insuranceId) && dmg > 0) {
      dmg = Math.ceil(dmg / 2);
      notes.push(`Mitad por ${name(rules.insuranceId)}`);
    }
  }
  let bonus = 0;
  if (dmg > 0 && has(rules.responsePlanId)) {
    bonus = rules.responsePlanBonus;
    notes.push(`+${bonus} de reputación por el plan de respuesta`);
  }
  if (!notes.length) notes.push('Sin protección');
  return { roll, affected: true, base: inc.damage, damage: dmg, bonus, notes };
}

export function sortedBids(lot: Pick<Lot, 'bids'>) {
  return Object.entries(lot.bids)
    .map(([groupId, b]) => ({ groupId, ...b }))
    .sort((a, b) => b.amount - a.amount || a.at - b.at);
}

/** Ganan las N ofertas más altas; ante empate gana la que llegó primero. */
export function lotWinners(lot: Pick<Lot, 'bids' | 'units'>) {
  return sortedBids(lot)
    .slice(0, lot.units)
    .map((b) => ({ groupId: b.groupId, amount: b.amount }));
}

export function minBid(lot: Pick<Lot, 'bids' | 'units'>, gid: string, basePrice: number): number {
  let min = basePrice;
  const own = lot.bids[gid]?.amount;
  if (own !== undefined) min = Math.max(min, own + 1);
  const others = sortedBids(lot).filter((b) => b.groupId !== gid);
  if (others.length >= lot.units) min = Math.max(min, others[lot.units - 1].amount + 1);
  return min;
}

export function placeBid(
  lot: Lot,
  gid: string,
  amount: number,
  coins: number,
  basePrice: number,
  now: number,
) {
  if (lot.status !== 'open') throw new GameError('El lote está cerrado.');
  if (amount > coins) throw new GameError(`No pueden ofertar más de lo que les queda (${coins}).`);
  const min = minBid(lot, gid, basePrice);
  if (amount < min) throw new GameError(`La oferta mínima es ${min}.`);
  lot.bids[gid] = { amount, at: now };
}

// ---------------------------------------------------------------- helpers

function rules(ctx: C): Rules {
  return ctx.content;
}

function coins(s: SubastaState, gid: string, ctx: C) {
  return ctx.content.coinsStart - (s.spent[gid] ?? 0);
}

function controlName(ctx: C, id: string) {
  return ctx.content.controls.find((c) => c.id === id)?.name ?? id;
}

function outcomes(s: SubastaState, gid: string, ctx: C) {
  return s.revealed.map((r) => {
    const inc = ctx.content.incidents.find((i) => i.id === r.id)!;
    const roll = r.rolls[gid] ?? 6;
    return {
      inc,
      out: resolveIncident(inc, s.purchases[gid] ?? [], roll, rules(ctx), (id) =>
        controlName(ctx, id),
      ),
    };
  });
}

export function scoreOf(s: SubastaState, gid: string, ctx: C) {
  const outs = outcomes(s, gid, ctx);
  const damage = outs.reduce((a, o) => a + o.out.damage, 0);
  const bonus = outs.reduce((a, o) => a + o.out.bonus, 0);
  const c = coins(s, gid, ctx);
  return { coins: c, damage, bonus, score: c + ctx.content.baseScore - damage + bonus };
}

function closeLot(s: SubastaState, ctx: C) {
  if (!s.currentLot) return;
  const lot = s.lots[s.currentLot];
  lot.status = 'closed';
  lot.winners = lotWinners(lot);
  for (const w of lot.winners) {
    s.purchases[w.groupId] = [...(s.purchases[w.groupId] ?? []), lot.controlId];
    s.spent[w.groupId] = (s.spent[w.groupId] ?? 0) + w.amount;
  }
  s.currentLot = null;
  ctx.cue('success');
}

function luckyGroup(s: SubastaState, ctx: C) {
  if (!s.revealed.length) return null;
  let best: { groupId: string; name: string; dodged: number; controls: number } | null = null;
  for (const g of ctx.groups) {
    const owned = s.purchases[g.id] ?? [];
    let dodged = 0;
    for (const r of s.revealed) {
      const inc = ctx.content.incidents.find((i) => i.id === r.id)!;
      const protectedBy = inc.nullifiedBy ?? inc.halvedBy;
      if (
        (r.rolls[g.id] ?? 6) > ctx.content.affectedMax &&
        !(protectedBy && owned.includes(protectedBy))
      )
        dodged++;
    }
    const cand = { groupId: g.id, name: g.name, dodged, controls: owned.length };
    if (
      !best ||
      cand.dodged > best.dodged ||
      (cand.dodged === best.dodged && cand.controls < best.controls)
    )
      best = cand;
  }
  return best && best.dodged >= 2 ? best : null;
}

function publicView(s: SubastaState, ctx: C): S.SubastaView {
  const content = ctx.content;
  const lot = s.currentLot ? s.lots[s.currentLot] : null;
  const lastLot = lot ?? Object.values(s.lots).sort((a, b) => b.openedAt - a.openedAt)[0] ?? null;
  const showLot =
    lastLot && (lastLot.status === 'open' || ctx.phaseId === 'subasta') ? lastLot : null;
  const ctl = (id: string) => content.controls.find((c) => c.id === id)!;
  return {
    phase: ctx.phaseId,
    coinsStart: content.coinsStart,
    controls: content.controls.map((c) => {
      const l = s.lots[c.id];
      return {
        ...c,
        status: !l ? 'pendiente' : l.status === 'open' ? 'abierto' : 'vendido',
        winners:
          l && l.status === 'closed'
            ? l.winners.map((w) => ({ name: ctx.groupName(w.groupId), amount: w.amount }))
            : [],
      };
    }),
    lot: showLot
      ? {
          controlId: showLot.controlId,
          name: ctl(showLot.controlId).name,
          units: showLot.units,
          basePrice: ctl(showLot.controlId).basePrice,
          endsAt: showLot.endsAt,
          status: showLot.status,
          bids: sortedBids(showLot).map((b) => ({
            groupId: b.groupId,
            name: ctx.groupName(b.groupId),
            amount: b.amount,
          })),
          winners: showLot.winners.map((w) => w.groupId),
        }
      : null,
    maxIncidents: Number(ctx.config.incidentCount),
    incidentsTotal: content.incidents.length,
    unrevealed: null,
    revealed: s.revealed.map((r) => {
      const inc = content.incidents.find((i) => i.id === r.id)!;
      return {
        id: inc.id,
        name: inc.name,
        damage: inc.damage,
        nullifiedBy: inc.nullifiedBy ? controlName(ctx, inc.nullifiedBy) : null,
        halvedBy: inc.halvedBy ? controlName(ctx, inc.halvedBy) : null,
        results: ctx.groups.map((g) => ({
          groupId: g.id,
          name: g.name,
          ...resolveIncident(inc, s.purchases[g.id] ?? [], r.rolls[g.id] ?? 6, rules(ctx), (id) =>
            controlName(ctx, id),
          ),
        })),
      };
    }),
    standings: ctx.groups
      .map((g) => ({
        groupId: g.id,
        name: g.name,
        controls: s.purchases[g.id] ?? [],
        ...scoreOf(s, g.id, ctx),
      }))
      .sort((a, b) => b.score - a.score),
    debrief:
      ctx.phaseId === 'cierre'
        ? {
            lucky: luckyGroup(s, ctx),
            riskResponses: content.riskResponses.map((r) => ({
              ...r,
              controls: r.controls.map((c) => controlName(ctx, c)),
            })),
            reflections: ctx.groups
              .filter((g) => s.reflections[g.id])
              .map((g) => ({ name: g.name, text: s.reflections[g.id] })),
            matrices: ctx.groups
              .filter((g) => s.threats[g.id]?.length)
              .map((g) => ({ name: g.name, threats: s.threats[g.id] })),
          }
        : null,
  };
}

export const subastaModule: GameModule<SubastaState, Content> = {
  id: 'subasta',
  parseContent: (raw) => {
    const c = parseContent('subasta', contentSchema, raw);
    const ids = new Set(c.controls.map((x) => x.id));
    for (const i of c.incidents)
      for (const ref of [i.nullifiedBy, i.halvedBy])
        if (ref && !ids.has(ref))
          throw new Error(
            `content/subasta.json: el incidente ${i.id} menciona el control inexistente "${ref}"`,
          );
    return c;
  },
  init: () => ({
    threats: {},
    lots: {},
    currentLot: null,
    purchases: {},
    spent: {},
    revealed: [],
    reflections: {},
  }),

  onPhaseEnter(s, ctx) {
    if (ctx.phaseId !== 'subasta' && s.currentLot) closeLot(s, ctx);
  },

  onGroupAction(s, gid, raw, ctx) {
    const a = parseAction(S.subastaGroupAction, raw);
    switch (a.type) {
      case 'matrix':
        requirePhase(ctx, 'matriz');
        s.threats[gid] = a.threats;
        return;
      case 'bid': {
        requirePhase(ctx, 'subasta');
        if (!s.currentLot || s.currentLot !== a.lot)
          throw new GameError('Ese lote no está abierto.');
        const lot = s.lots[s.currentLot];
        const ctl = ctx.content.controls.find((c) => c.id === lot.controlId)!;
        placeBid(lot, gid, a.amount, coins(s, gid, ctx), ctl.basePrice, ctx.now);
        lot.endsAt = Math.max(lot.endsAt, ctx.now + Number(ctx.config.bidResetSec) * 1000);
        return;
      }
      case 'reflection':
        requirePhase(ctx, 'cierre');
        s.reflections[gid] = a.text;
        return;
    }
  },

  onHostAction(s, raw, ctx) {
    const a = parseAction(S.subastaHostAction, raw);
    switch (a.type) {
      case 'openLot': {
        requirePhase(ctx, 'subasta');
        if (s.currentLot) throw new GameError('Cierren primero el lote abierto.');
        const ctl = ctx.content.controls.find((c) => c.id === a.controlId);
        if (!ctl) throw new GameError('Control inexistente.');
        if (s.lots[ctl.id]) throw new GameError('Ese control ya fue subastado.');
        s.lots[ctl.id] = {
          controlId: ctl.id,
          units: ctl.units,
          status: 'open',
          openedAt: ctx.now,
          endsAt: ctx.now + Number(ctx.config.lotSec) * 1000,
          bids: {},
          winners: [],
        };
        s.currentLot = ctl.id;
        ctx.cue('bell');
        return;
      }
      case 'closeLot':
        if (!s.currentLot) throw new GameError('No hay un lote abierto.');
        closeLot(s, ctx);
        return;
      case 'revealIncident': {
        requirePhase(ctx, 'incidentes');
        if (s.revealed.length >= Number(ctx.config.incidentCount))
          throw new GameError('Ya se revelaron todos los incidentes de esta partida.');
        const pending = ctx.content.incidents.filter((i) => !s.revealed.some((r) => r.id === i.id));
        const inc = a.incidentId
          ? pending.find((i) => i.id === a.incidentId)
          : pending[ctx.rng.int(0, pending.length - 1)];
        if (!inc) throw new GameError('Ese incidente ya fue revelado.');
        const rolls: Record<string, number> = {};
        for (const g of ctx.groups) rolls[g.id] = ctx.rng.int(1, 6);
        s.revealed.push({ id: inc.id, rolls });
        ctx.cue('dice');
        return;
      }
    }
  },

  needsTick: (s) => !!s.currentLot,

  onTick(s, ctx) {
    if (!s.currentLot) return false;
    if (ctx.now >= s.lots[s.currentLot].endsAt) {
      closeLot(s, ctx);
      return true;
    }
    return false;
  },

  publicView,

  groupView(s, gid, ctx) {
    const base = publicView(s, ctx);
    const lot = s.currentLot ? s.lots[s.currentLot] : null;
    const ctl = lot ? ctx.content.controls.find((c) => c.id === lot.controlId)! : null;
    const sc = scoreOf(s, gid, ctx);
    return {
      ...base,
      me: {
        coins: sc.coins,
        controls: s.purchases[gid] ?? [],
        myBid: lot?.bids[gid]?.amount ?? null,
        minBid: lot && ctl ? minBid(lot, gid, ctl.basePrice) : null,
        winning: lot ? lotWinners(lot).some((w) => w.groupId === gid) : false,
        threats: s.threats[gid] ?? [],
        reflection: s.reflections[gid] ?? '',
        score: sc.score,
        damage: sc.damage,
        bonus: sc.bonus,
      },
    } satisfies S.SubastaView;
  },

  hostView(s, ctx) {
    return {
      ...publicView(s, ctx),
      unrevealed: ctx.content.incidents
        .filter((i) => !s.revealed.some((r) => r.id === i.id))
        .map((i) => ({ id: i.id, name: i.name })),
    } satisfies S.SubastaView;
  },

  status(s, gid, ctx) {
    switch (ctx.phaseId) {
      case 'matriz': {
        const n = s.threats[gid]?.length ?? 0;
        return { text: `${n}/5 amenazas`, responded: n >= 5 };
      }
      case 'subasta': {
        const lot = s.currentLot ? s.lots[s.currentLot] : null;
        const c = coins(s, gid, ctx);
        if (lot?.bids[gid])
          return { text: `Ofertó ${lot.bids[gid].amount} · le quedan ${c}`, responded: true };
        return { text: `Le quedan ${c} cibercoins`, responded: false };
      }
      case 'incidentes':
        return { text: `Puntaje ${scoreOf(s, gid, ctx).score}`, responded: true };
      default:
        return s.reflections[gid]
          ? { text: 'Reflexión enviada', responded: true }
          : { text: 'Sin reflexión', responded: false };
    }
  },

  summarize(s, gid, ctx) {
    const sc = scoreOf(s, gid, ctx);
    const items: SummaryItem[] = [
      {
        label: 'Puntaje',
        value: `${sc.score} (quedan ${sc.coins} + 100 − ${sc.damage} de daño + ${sc.bonus} de reputación)`,
      },
      {
        label: 'Controles comprados',
        value: (s.purchases[gid] ?? []).map((id) => controlName(ctx, id)).join(', ') || 'Ninguno',
      },
    ];
    const t = s.threats[gid];
    if (t?.length)
      items.push({
        label: 'Matriz de riesgos',
        value: t.map((x) => `• ${x.text} (prob. ${x.prob}, impacto ${x.impact})`).join('\n'),
      });
    if (s.reflections[gid])
      items.push({ label: '¿Qué comprarían distinto?', value: s.reflections[gid] });
    return items;
  },

  exportRows(s, ctx) {
    const rows: ModuleRow[] = [];
    for (const g of ctx.groups) {
      for (const t of s.threats[g.id] ?? [])
        rows.push({
          groupId: g.id,
          fase: 'matriz',
          item: 'Amenaza',
          respuesta: t.text,
          detalle: `Probabilidad ${t.prob} / impacto ${t.impact}`,
          puntos: '',
        });
      for (const lot of Object.values(s.lots)) {
        const b = lot.bids[g.id];
        if (!b) continue;
        const won = lot.winners.some((w) => w.groupId === g.id);
        rows.push({
          groupId: g.id,
          fase: 'subasta',
          item: controlName(ctx, lot.controlId),
          respuesta: `Oferta ${b.amount}`,
          detalle: lot.status === 'closed' ? (won ? 'Ganó' : 'No ganó') : 'Abierto',
          puntos: won ? -b.amount : '',
        });
      }
      for (const { inc, out } of outcomes(s, g.id, ctx))
        rows.push({
          groupId: g.id,
          fase: 'incidentes',
          item: inc.name,
          respuesta: `Dado ${out.roll}${out.affected ? ' (afectado)' : ' (se salvó)'}`,
          detalle: out.notes.join('; '),
          puntos: -out.damage + out.bonus,
        });
      if (s.reflections[g.id])
        rows.push({
          groupId: g.id,
          fase: 'cierre',
          item: 'Reflexión',
          respuesta: s.reflections[g.id],
          detalle: '',
          puntos: '',
        });
      const sc = scoreOf(s, g.id, ctx);
      rows.push({
        groupId: g.id,
        fase: 'total',
        item: 'Puntaje final',
        respuesta: `Coins ${sc.coins}, daño ${sc.damage}, bonus ${sc.bonus}`,
        detalle: '',
        puntos: sc.score,
      });
    }
    return rows;
  },
};
