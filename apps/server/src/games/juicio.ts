import { z } from 'zod';
import { juicio as J, type SummaryItem } from '@ciberjunta/shared';
import { GameError, type Ctx, type GameModule, type ModuleRow } from '../engine/types.js';
import { parseAction, parseContent, requirePhase } from './util.js';

const idRe = /^[A-Za-z0-9_-]+$/;
const contentSchema = z.object({
  caseFile: z.object({
    title: z.string(),
    tabs: z.array(z.object({ title: z.string(), body: z.string() })).min(1),
  }),
  evidence: z
    .array(
      z.object({
        id: z.string().regex(idRe),
        title: z.string(),
        body: z.string(),
        surprise: z.boolean().optional(),
      }),
    )
    .min(1),
  teams: z
    .array(z.object({ id: z.enum(J.JUICIO_TEAMS), label: z.string(), mission: z.string() }))
    .length(5),
  parties: z.array(z.object({ id: z.string().regex(idRe), label: z.string() })).min(1),
  presets: z
    .array(
      z.object({ id: z.string().regex(idRe), label: z.string(), sec: z.number().int().min(10) }),
    )
    .min(1),
  keyPoints: z.array(z.string()),
  closingPrompt: z.string(),
});
type Content = z.infer<typeof contentSchema>;
type C = Ctx<Content>;

const MAX_QUESTIONS = 2;

interface Question {
  id: string;
  from: string;
  fromTeam: J.JuicioTeam;
  to: J.JuicioTeam;
  text: string;
  status: (typeof J.QUESTION_STATUS)[number];
  trial: 1 | 2;
}

export interface JuicioState {
  assignments: Record<string, { team: J.JuicioTeam | null; trial: 1 | 2 }>;
  surpriseReleased: boolean;
  speaker: { team: J.JuicioTeam; label: string; endsAt: number; trial: 1 | 2 } | null;
  questions: Question[];
  alegatos: Record<string, string>;
  votes: Record<
    string,
    { principal: string; responsibility: Record<string, number>; sanction: string }
  >;
  headlines: Record<string, string>;
  clauses: Record<string, string[]>;
}

/** Agrega los votos del jurado de un juicio (puro). */
export function aggregateVerdict(
  trial: 1 | 2,
  votes: { principal: string; responsibility: Record<string, number>; sanction: string }[],
  headlines: string[],
  parties: Content['parties'],
): J.JuicioVerdict {
  return {
    trial,
    votes: votes.length,
    principal: parties
      .map((p) => ({
        party: p.id,
        label: p.label,
        count: votes.filter((v) => v.principal === p.id).length,
      }))
      .sort((a, b) => b.count - a.count),
    responsibility: parties.map((p) => ({
      party: p.id,
      label: p.label,
      avg: votes.length
        ? Math.round(votes.reduce((a, v) => a + (v.responsibility[p.id] ?? 0), 0) / votes.length)
        : 0,
    })),
    sanctions: votes.map((v) => v.sanction),
    headlines,
  };
}

function assignment(s: JuicioState, gid: string) {
  return s.assignments[gid] ?? { team: null, trial: 1 as const };
}

function teamLabel(ctx: C, t: J.JuicioTeam) {
  return ctx.content.teams.find((x) => x.id === t)?.label ?? t;
}

function publicView(s: JuicioState, ctx: C): J.JuicioView {
  const content = ctx.content;
  const showVerdict = ctx.phaseId === 'veredicto' || ctx.phaseId === 'cierre';
  const parallel = !!ctx.config.parallel;
  const trials: (1 | 2)[] = parallel ? [1, 2] : [1];
  return {
    phase: ctx.phaseId,
    parallel,
    caseFile: content.caseFile,
    evidence: content.evidence
      .filter((e) => !e.surprise || s.surpriseReleased)
      .map((e) => ({ id: e.id, title: e.title, body: e.body, surprise: !!e.surprise })),
    surpriseReleased: s.surpriseReleased,
    teams: content.teams,
    parties: content.parties,
    presets: content.presets,
    speaker: s.speaker,
    assignments: ctx.groups.map((g) => ({ groupId: g.id, name: g.name, ...assignment(s, g.id) })),
    questions: s.questions.map((q) => ({
      id: q.id,
      fromName: ctx.groupName(q.from),
      fromTeam: q.fromTeam,
      to: q.to,
      text: q.text,
      status: q.status,
      trial: q.trial,
    })),
    verdicts: showVerdict
      ? trials.map((t) => {
          const gids = ctx.groups.filter((g) => assignment(s, g.id).trial === t).map((g) => g.id);
          return aggregateVerdict(
            t,
            gids.filter((id) => s.votes[id]).map((id) => s.votes[id]),
            gids.filter((id) => s.headlines[id]).map((id) => s.headlines[id]),
            content.parties,
          );
        })
      : null,
    closing:
      ctx.phaseId === 'cierre'
        ? {
            keyPoints: content.keyPoints,
            prompt: content.closingPrompt,
            clauses: ctx.groups
              .filter((g) => s.clauses[g.id])
              .map((g) => ({ name: g.name, items: s.clauses[g.id] })),
          }
        : null,
  };
}

export const juicioModule: GameModule<JuicioState, Content> = {
  id: 'juicio',
  parseContent: (raw) => parseContent('juicio', contentSchema, raw),
  init: () => ({
    assignments: {},
    surpriseReleased: false,
    speaker: null,
    questions: [],
    alegatos: {},
    votes: {},
    headlines: {},
    clauses: {},
  }),

  onGroupAction(s, gid, raw, ctx) {
    const a = parseAction(J.juicioGroupAction, raw);
    const me = assignment(s, gid);
    switch (a.type) {
      case 'alegato':
        requirePhase(ctx, 'expediente', 'alegatos', 'preguntas', 'veredicto');
        s.alegatos[gid] = a.text;
        return;
      case 'question': {
        requirePhase(ctx, 'alegatos', 'preguntas');
        if (!me.team) throw new GameError('El docente todavía no les asignó un equipo.');
        if (a.to === me.team) throw new GameError('Las preguntas van dirigidas a otro equipo.');
        if (s.questions.filter((q) => q.from === gid).length >= MAX_QUESTIONS)
          throw new GameError(`Cada grupo puede enviar hasta ${MAX_QUESTIONS} preguntas.`);
        s.questions.push({
          id: `q${s.questions.length + 1}`,
          from: gid,
          fromTeam: me.team,
          to: a.to,
          text: a.text,
          status: 'pendiente',
          trial: me.trial,
        });
        return;
      }
      case 'vote': {
        requirePhase(ctx, 'veredicto');
        if (me.team !== 'jurado') throw new GameError('Solo el jurado vota.');
        const parties = new Set(ctx.content.parties.map((p) => p.id));
        if (!parties.has(a.principal) || Object.keys(a.responsibility).some((k) => !parties.has(k)))
          throw new GameError('Parte inválida.');
        s.votes[gid] = {
          principal: a.principal,
          responsibility: a.responsibility,
          sanction: a.sanction,
        };
        return;
      }
      case 'headline':
        requirePhase(ctx, 'veredicto', 'cierre');
        if (me.team !== 'jurado')
          throw new GameError('El titular lo escribe el equipo de jurado y prensa.');
        s.headlines[gid] = a.text;
        return;
      case 'clauses':
        requirePhase(ctx, 'cierre');
        s.clauses[gid] = a.items;
        return;
    }
  },

  onHostAction(s, raw, ctx) {
    const a = parseAction(J.juicioHostAction, raw);
    switch (a.type) {
      case 'assign':
        if (!ctx.groups.some((g) => g.id === a.groupId)) throw new GameError('Grupo inexistente.');
        s.assignments[a.groupId] = { team: a.team, trial: ctx.config.parallel ? a.trial : 1 };
        return;
      case 'speaker': {
        const p = ctx.content.presets.find((x) => x.id === a.preset);
        if (!p) throw new GameError('Tipo de intervención inválido.');
        s.speaker = {
          team: a.team,
          label: p.label,
          endsAt: ctx.now + p.sec * 1000,
          trial: ctx.config.parallel ? a.trial : 1,
        };
        ctx.cue('bell');
        return;
      }
      case 'stopSpeaker':
        s.speaker = null;
        return;
      case 'releaseSurprise':
        if (s.surpriseReleased) throw new GameError('La prueba sorpresa ya fue liberada.');
        s.surpriseReleased = true;
        ctx.cue('alert');
        ctx.toast('¡Nueva prueba en el expediente!');
        return;
      case 'questionStatus': {
        const q = s.questions.find((x) => x.id === a.id);
        if (!q) throw new GameError('Pregunta inexistente.');
        if (a.status === 'en_pantalla')
          for (const o of s.questions)
            if (o.status === 'en_pantalla' && o.trial === q.trial) o.status = 'pendiente';
        q.status = a.status;
        return;
      }
    }
  },

  publicView,

  groupView(s, gid, ctx) {
    const me = assignment(s, gid);
    return {
      ...publicView(s, ctx),
      me: {
        team: me.team,
        trial: me.trial,
        alegato: s.alegatos[gid] ?? '',
        questionsSent: s.questions.filter((q) => q.from === gid).length,
        vote: s.votes[gid] ?? null,
        headline: s.headlines[gid] ?? '',
        clauses: s.clauses[gid] ?? [],
      },
    } satisfies J.JuicioView;
  },

  hostView: publicView,

  status(s, gid, ctx) {
    const me = assignment(s, gid);
    const team = me.team ? teamLabel(ctx, me.team) : 'Sin equipo';
    const done: string[] = [];
    if (s.alegatos[gid]) done.push('alegato');
    if (s.votes[gid]) done.push('voto');
    if (s.headlines[gid]) done.push('titular');
    if (s.clauses[gid]) done.push('cláusulas');
    return {
      text: `${team}${done.length ? ' · ' + done.join(', ') : ''}`,
      responded: done.length > 0,
    };
  },

  summarize(s, gid, ctx) {
    const me = assignment(s, gid);
    const items: SummaryItem[] = [
      {
        label: 'Equipo',
        value: `${me.team ? teamLabel(ctx, me.team) : 'Sin equipo'}${ctx.config.parallel ? ` (juicio ${me.trial})` : ''}`,
      },
    ];
    if (s.alegatos[gid]) items.push({ label: 'Alegato escrito', value: s.alegatos[gid] });
    const v = s.votes[gid];
    if (v) {
      const pl = (id: string) => ctx.content.parties.find((p) => p.id === id)?.label ?? id;
      items.push({ label: 'Responsable principal', value: pl(v.principal) });
      items.push({
        label: 'Grado de responsabilidad',
        value: Object.entries(v.responsibility)
          .map(([k, n]) => `${pl(k)}: ${n}%`)
          .join(' · '),
      });
      items.push({ label: 'Sanción o reparación', value: v.sanction });
    }
    if (s.headlines[gid]) items.push({ label: 'Titular', value: s.headlines[gid] });
    if (s.clauses[gid])
      items.push({
        label: 'Cláusulas',
        value: s.clauses[gid].map((c, i) => `${i + 1}. ${c}`).join('\n'),
      });
    return items;
  },

  exportRows(s, ctx) {
    const rows: ModuleRow[] = [];
    for (const g of ctx.groups) {
      const me = assignment(s, g.id);
      rows.push({
        groupId: g.id,
        fase: 'asignacion',
        item: 'Equipo',
        respuesta: me.team ? teamLabel(ctx, me.team) : '',
        detalle: `Juicio ${me.trial}`,
        puntos: '',
      });
      if (s.alegatos[g.id])
        rows.push({
          groupId: g.id,
          fase: 'alegatos',
          item: 'Alegato escrito',
          respuesta: s.alegatos[g.id],
          detalle: '',
          puntos: '',
        });
      for (const q of s.questions.filter((x) => x.from === g.id))
        rows.push({
          groupId: g.id,
          fase: 'preguntas',
          item: `Pregunta a ${teamLabel(ctx, q.to)}`,
          respuesta: q.text,
          detalle: q.status,
          puntos: '',
        });
      const v = s.votes[g.id];
      if (v)
        rows.push({
          groupId: g.id,
          fase: 'veredicto',
          item: 'Voto del jurado',
          respuesta: v.principal,
          detalle: `${JSON.stringify(v.responsibility)} | ${v.sanction}`,
          puntos: '',
        });
      if (s.headlines[g.id])
        rows.push({
          groupId: g.id,
          fase: 'veredicto',
          item: 'Titular',
          respuesta: s.headlines[g.id],
          detalle: '',
          puntos: '',
        });
      (s.clauses[g.id] ?? []).forEach((c, i) =>
        rows.push({
          groupId: g.id,
          fase: 'cierre',
          item: `Cláusula ${i + 1}`,
          respuesta: c,
          detalle: '',
          puntos: '',
        }),
      );
    }
    return rows;
  },
};
