import { z } from 'zod';
import { phish as P, type SummaryItem } from '@ciberjunta/shared';
import { GameError, type Ctx, type GameModule, type ModuleRow } from '../engine/types.js';
import { connectedIds, parseAction, parseContent, requirePhase, snippet } from './util.js';

const contentSchema = z.object({
  osint: z.object({
    name: z.string(),
    role: z.string(),
    company: z.string(),
    location: z.string(),
    about: z.string(),
    posts: z.array(z.object({ date: z.string(), text: z.string() })),
  }),
  rounds: z
    .array(
      z.object({
        message: z.object({
          channel: z.enum(P.PHISH_CHANNELS),
          sender: z.string(),
          senderDetail: z.string().optional(),
          subject: z.string().optional(),
          body: z.string(),
          attachment: z.string().optional(),
          link: z.string().optional(),
          time: z.string().optional(),
        }),
        answer: z.enum(['PHISH', 'FISH']),
        signal: z.string(),
        distractors: z.array(z.string()).length(3),
        explanation: z.string(),
      }),
    )
    .min(1)
    .max(40),
  campaign: z.object({ indicators: z.array(z.string()).min(1) }),
  closingMessage: z.string(),
});
type Content = z.infer<typeof contentSchema>;
type C = Ctx<Content>;

interface Answer {
  choice: P.PhishAnswer;
  at: number;
  signal: number | null;
}

interface Round {
  index: number;
  stage: P.PhishStage;
  startedAt: number;
  stageEndsAt: number | null;
  /** Orden mostrado: signalOrder[k] = índice en [correcta, ...distractores]. */
  signalOrder: number[];
  answers: Record<string, Answer>;
}

export interface PhishState {
  notes: Record<string, string>;
  rounds: Round[];
  campaigns: Record<string, P.Campaign>;
  votes: Record<string, string>;
  rules: Record<string, string>;
}

// ---------------------------------------------------------------- puntaje (puro)

export const POINTS = { correct: 100, signal: 50, speedMax: 50 };

export function scoreAnswer(
  answer: Answer | undefined,
  correct: P.PhishAnswer,
  correctSignal: number,
  startedAt: number,
  answerSec: number,
): { points: number; correct: boolean; signalCorrect: boolean; bonus: number } {
  if (!answer) return { points: 0, correct: false, signalCorrect: false, bonus: 0 };
  const ok = answer.choice === correct;
  if (!ok) return { points: 0, correct: false, signalCorrect: false, bonus: 0 };
  const elapsed = Math.max(0, answer.at - startedAt);
  const ratio = Math.min(1, Math.max(0, 1 - elapsed / (answerSec * 1000)));
  const bonus = Math.round(POINTS.speedMax * ratio);
  const signalCorrect = answer.signal === correctSignal;
  return {
    points: POINTS.correct + (signalCorrect ? POINTS.signal : 0) + bonus,
    correct: true,
    signalCorrect,
    bonus,
  };
}

function correctSignalIndex(r: Round) {
  return r.signalOrder.indexOf(0);
}

function roundScore(s: PhishState, r: Round, gid: string, ctx: C) {
  const c = ctx.content.rounds[r.index];
  return scoreAnswer(
    r.answers[gid],
    c.answer,
    correctSignalIndex(r),
    r.startedAt,
    Number(ctx.config.answerSec),
  );
}

export function totals(s: PhishState, ctx: C): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of ctx.groups) out[g.id] = 0;
  for (const r of s.rounds) {
    if (r.stage !== 'reveal') continue;
    for (const g of ctx.groups) out[g.id] += roundScore(s, r, g.id, ctx).points;
  }
  return out;
}

function ranking(s: PhishState, ctx: C) {
  const t = totals(s, ctx);
  return ctx.groups
    .map((g) => ({ groupId: g.id, name: g.name, score: t[g.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
}

function current(s: PhishState): Round | null {
  return s.rounds.length ? s.rounds[s.rounds.length - 1] : null;
}

function signalsFor(r: Round, ctx: C): string[] {
  const c = ctx.content.rounds[r.index];
  const all = [c.signal, ...c.distractors];
  return r.signalOrder.map((i) => all[i]);
}

function advance(r: Round, ctx: C) {
  if (r.stage === 'answer') {
    r.stage = 'signal';
    r.stageEndsAt = ctx.now + Number(ctx.config.signalSec) * 1000;
  } else if (r.stage === 'signal') {
    r.stage = 'reveal';
    r.stageEndsAt = null;
    ctx.cue('success');
  }
}

function maybeAdvanceEarly(r: Round, ctx: C) {
  const ids = connectedIds(ctx);
  if (!ids.length) return;
  if (r.stage === 'answer' && ids.every((id) => r.answers[id])) advance(r, ctx);
  else if (
    r.stage === 'signal' &&
    ids.every((id) => !r.answers[id] || r.answers[id].signal !== null)
  )
    advance(r, ctx);
}

// ---------------------------------------------------------------- vistas

function roundView(s: PhishState, ctx: C): P.PhishRoundView | null {
  const r = current(s);
  if (!r) return null;
  const c = ctx.content.rounds[r.index];
  const answers = Object.values(r.answers);
  return {
    index: r.index,
    total: ctx.content.rounds.length,
    stage: r.stage,
    stageEndsAt: r.stageEndsAt,
    message: c.message,
    signals: r.stage === 'answer' ? null : signalsFor(r, ctx),
    answeredCount: answers.length,
    signaledCount: answers.filter((a) => a.signal !== null).length,
    reveal:
      r.stage === 'reveal'
        ? {
            answer: c.answer,
            correctSignal: correctSignalIndex(r),
            explanation: c.explanation,
            counts: {
              PHISH: answers.filter((a) => a.choice === 'PHISH').length,
              FISH: answers.filter((a) => a.choice === 'FISH').length,
              none: Math.max(0, ctx.groups.length - answers.length),
            },
            signalCounts: [0, 1, 2, 3].map((k) => answers.filter((a) => a.signal === k).length),
          }
        : null,
  };
}

function publicView(s: PhishState, ctx: C): P.PhishView {
  const phase = ctx.phaseId;
  const showGallery = phase === 'galeria' || phase === 'cierre';
  const votes: Record<string, number> = {};
  for (const t of Object.values(s.votes)) votes[t] = (votes[t] ?? 0) + 1;
  return {
    phase,
    osint: ctx.content.osint,
    roundsTotal: ctx.content.rounds.length,
    round: roundView(s, ctx),
    ranking: ranking(s, ctx),
    campaignOptions: { indicators: ctx.content.campaign.indicators },
    campaignsSubmitted: Object.keys(s.campaigns).length,
    gallery: showGallery
      ? ctx.groups
          .filter((g) => s.campaigns[g.id])
          .map((g) => ({
            groupId: g.id,
            name: g.name,
            campaign: s.campaigns[g.id],
            votes: phase === 'cierre' ? (votes[g.id] ?? 0) : null,
          }))
      : null,
    closing:
      phase === 'cierre'
        ? {
            message: ctx.content.closingMessage,
            rules: ctx.groups
              .filter((g) => s.rules[g.id])
              .map((g) => ({ name: g.name, rule: s.rules[g.id] })),
          }
        : null,
  };
}

export const phishModule: GameModule<PhishState, Content> = {
  id: 'phish',
  parseContent: (raw) => parseContent('phish', contentSchema, raw),
  init: () => ({ notes: {}, rounds: [], campaigns: {}, votes: {}, rules: {} }),

  onGroupAction(s, gid, raw, ctx) {
    const a = parseAction(P.phishGroupAction, raw);
    switch (a.type) {
      case 'osint':
        requirePhase(ctx, 'osint', 'concurso');
        s.notes[gid] = a.notes;
        return;
      case 'answer': {
        requirePhase(ctx, 'concurso');
        const r = current(s);
        if (!r || r.index !== a.round || r.stage !== 'answer')
          throw new GameError('El tiempo para responder esta ronda terminó.');
        if (r.answers[gid]) throw new GameError('Ya respondieron esta ronda.');
        r.answers[gid] = { choice: a.choice, at: ctx.now, signal: null };
        maybeAdvanceEarly(r, ctx);
        return;
      }
      case 'signal': {
        requirePhase(ctx, 'concurso');
        const r = current(s);
        if (!r || r.index !== a.round || r.stage !== 'signal')
          throw new GameError('No es momento de elegir la señal.');
        const ans = r.answers[gid];
        if (!ans) throw new GameError('No respondieron PHISH/FISH en esta ronda.');
        if (ans.signal !== null) throw new GameError('Ya eligieron la señal.');
        ans.signal = a.signal;
        maybeAdvanceEarly(r, ctx);
        return;
      }
      case 'campaign':
        requirePhase(ctx, 'campana');
        if (!ctx.content.campaign.indicators.includes(a.campaign.indicator))
          throw new GameError('Indicador inválido.');
        s.campaigns[gid] = a.campaign;
        return;
      case 'vote':
        requirePhase(ctx, 'galeria');
        if (a.target === gid) throw new GameError('No pueden votar su propia campaña.');
        if (!s.campaigns[a.target]) throw new GameError('Ese grupo no tiene campaña.');
        s.votes[gid] = a.target;
        return;
      case 'rule':
        requirePhase(ctx, 'cierre');
        s.rules[gid] = a.rule;
        return;
    }
  },

  onHostAction(s, raw, ctx) {
    const a = parseAction(P.phishHostAction, raw);
    requirePhase(ctx, 'concurso');
    const r = current(s);
    if (a.type === 'skipStage') {
      if (!r || r.stage === 'reveal') throw new GameError('No hay una ronda en curso.');
      advance(r, ctx);
      return;
    }
    if (r && r.stage !== 'reveal') throw new GameError('Terminen primero la ronda actual.');
    const next = r ? r.index + 1 : 0;
    if (next >= ctx.content.rounds.length) throw new GameError('Ya se jugaron todas las rondas.');
    s.rounds.push({
      index: next,
      stage: 'answer',
      startedAt: ctx.now,
      stageEndsAt: ctx.now + Number(ctx.config.answerSec) * 1000,
      signalOrder: ctx.rng.shuffle([0, 1, 2, 3]),
      answers: {},
    });
    ctx.cue('bell');
  },

  needsTick: (s) => {
    const r = current(s);
    return !!r && r.stage !== 'reveal';
  },

  onTick(s, ctx) {
    const r = current(s);
    if (!r || r.stage === 'reveal' || r.stageEndsAt === null) return false;
    if (ctx.now >= r.stageEndsAt) {
      advance(r, ctx);
      return true;
    }
    return false;
  },

  publicView,

  groupView(s, gid, ctx) {
    const base = publicView(s, ctx);
    const r = current(s);
    const rank = base.ranking.findIndex((x) => x.groupId === gid) + 1;
    const ans = r?.answers[gid];
    return {
      ...base,
      me: {
        notes: s.notes[gid] ?? '',
        answer: ans ? { choice: ans.choice, signal: ans.signal } : null,
        lastResult: r && r.stage === 'reveal' ? roundScore(s, r, gid, ctx) : null,
        score: base.ranking.find((x) => x.groupId === gid)?.score ?? 0,
        rank,
        campaign: s.campaigns[gid] ?? null,
        vote: s.votes[gid] ?? null,
        rule: s.rules[gid] ?? '',
      },
    } satisfies P.PhishView;
  },

  hostView(s, ctx) {
    const r = current(s);
    return {
      ...publicView(s, ctx),
      host: {
        answers: ctx.groups.map((g) => ({
          groupId: g.id,
          name: g.name,
          choice: r?.answers[g.id]?.choice ?? null,
          signal: r?.answers[g.id]?.signal ?? null,
        })),
        osintNotes: ctx.groups
          .filter((g) => s.notes[g.id])
          .map((g) => ({ name: g.name, notes: s.notes[g.id] })),
      },
    } satisfies P.PhishView;
  },

  status(s, gid, ctx) {
    switch (ctx.phaseId) {
      case 'osint':
        return s.notes[gid]
          ? { text: 'Anotó datos', responded: true }
          : { text: 'Analizando el perfil', responded: false };
      case 'concurso': {
        const r = current(s);
        if (!r) return { text: 'Esperando la primera ronda', responded: false };
        const a = r.answers[gid];
        if (!a) return { text: `Ronda ${r.index + 1}: sin responder`, responded: false };
        return {
          text: `Ronda ${r.index + 1}: ${a.choice}${a.signal !== null ? ' + señal' : ''}`,
          responded: true,
        };
      }
      case 'campana':
        return s.campaigns[gid]
          ? { text: 'Campaña enviada', responded: true }
          : { text: 'Diseñando', responded: false };
      case 'galeria':
        return s.votes[gid]
          ? { text: 'Votó', responded: true }
          : { text: 'Sin votar', responded: false };
      default:
        return s.rules[gid]
          ? { text: 'Regla enviada', responded: true }
          : { text: 'Sin regla', responded: false };
    }
  },

  summarize(s, gid, ctx) {
    const items: SummaryItem[] = [{ label: 'Puntaje', value: String(totals(s, ctx)[gid] ?? 0) }];
    if (s.notes[gid]) items.push({ label: 'Datos que usaría un atacante', value: s.notes[gid] });
    const c = s.campaigns[gid];
    if (c) {
      items.push({ label: 'Mensaje central', value: c.message });
      items.push({
        label: 'Pieza',
        value: `${c.piece}${c.pieceText ? ': ' + snippet(c.pieceText, 300) : ''}`,
      });
      items.push({ label: 'Acción', value: c.action === 'otra' ? c.actionOther : c.action });
      items.push({ label: 'Indicador', value: `${c.indicator} (meta: ${c.target})` });
    }
    if (s.rules[gid]) items.push({ label: 'Regla de oro', value: s.rules[gid] });
    return items;
  },

  exportRows(s, ctx) {
    const rows: ModuleRow[] = [];
    for (const g of ctx.groups) {
      if (s.notes[g.id])
        rows.push({
          groupId: g.id,
          fase: 'osint',
          item: 'Notas OSINT',
          respuesta: s.notes[g.id],
          detalle: '',
          puntos: '',
        });
      for (const r of s.rounds) {
        const a = r.answers[g.id];
        const sc = roundScore(s, r, g.id, ctx);
        const sig = a?.signal != null ? signalsFor(r, ctx)[a.signal] : '';
        rows.push({
          groupId: g.id,
          fase: 'concurso',
          item: `Ronda ${r.index + 1}`,
          respuesta: a?.choice ?? 'Sin respuesta',
          detalle: `Señal: ${sig || '—'} | Correcta: ${ctx.content.rounds[r.index].answer} / ${ctx.content.rounds[r.index].signal}`,
          puntos: r.stage === 'reveal' ? sc.points : '',
        });
      }
      const c = s.campaigns[g.id];
      if (c)
        rows.push({
          groupId: g.id,
          fase: 'campana',
          item: 'Campaña',
          respuesta: c.message,
          detalle: `Pieza: ${c.piece} ${c.pieceText} | Acción: ${c.action} ${c.actionOther} | Indicador: ${c.indicator} meta ${c.target}`,
          puntos: '',
        });
      if (s.votes[g.id])
        rows.push({
          groupId: g.id,
          fase: 'galeria',
          item: 'Voto',
          respuesta: ctx.groupName(s.votes[g.id]),
          detalle: '',
          puntos: '',
        });
      if (s.rules[g.id])
        rows.push({
          groupId: g.id,
          fase: 'cierre',
          item: 'Regla de oro',
          respuesta: s.rules[g.id],
          detalle: '',
          puntos: '',
        });
      rows.push({
        groupId: g.id,
        fase: 'total',
        item: 'Puntaje total',
        respuesta: '',
        detalle: '',
        puntos: totals(s, ctx)[g.id] ?? 0,
      });
    }
    return rows;
  },
};
