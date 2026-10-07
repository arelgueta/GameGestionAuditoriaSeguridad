import { z } from 'zod';
import { text, idSchema } from '../text.js';

export const JUICIO_TEAMS = ['aaip', 'defensa', 'proveedor', 'clientes', 'jurado'] as const;
export type JuicioTeam = (typeof JUICIO_TEAMS)[number];
export const QUESTION_STATUS = ['pendiente', 'en_pantalla', 'respondida'] as const;

export const juicioGroupAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('alegato'), text: text(1500, 1) }),
  z.object({ type: z.literal('question'), to: z.enum(JUICIO_TEAMS), text: text(300, 3) }),
  z.object({
    type: z.literal('vote'),
    principal: idSchema,
    responsibility: z.record(idSchema, z.number().int().min(0).max(100)),
    sanction: text(500, 1),
  }),
  z.object({ type: z.literal('headline'), text: text(100, 3) }),
  z.object({ type: z.literal('clauses'), items: z.array(text(300)).length(3) }),
]);
export type JuicioGroupAction = z.infer<typeof juicioGroupAction>;

export const juicioHostAction = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('assign'),
    groupId: z.string().max(40),
    team: z.enum(JUICIO_TEAMS).nullable(),
    trial: z.union([z.literal(1), z.literal(2)]).default(1),
  }),
  z.object({
    type: z.literal('speaker'),
    team: z.enum(JUICIO_TEAMS),
    preset: idSchema,
    trial: z.union([z.literal(1), z.literal(2)]).default(1),
  }),
  z.object({ type: z.literal('stopSpeaker') }),
  z.object({ type: z.literal('releaseSurprise') }),
  z.object({ type: z.literal('questionStatus'), id: idSchema, status: z.enum(QUESTION_STATUS) }),
]);
export type JuicioHostAction = z.infer<typeof juicioHostAction>;

export interface JuicioVerdict {
  trial: 1 | 2;
  votes: number;
  principal: { party: string; label: string; count: number }[];
  responsibility: { party: string; label: string; avg: number }[];
  sanctions: string[];
  headlines: string[];
}

export interface JuicioView {
  phase: string;
  parallel: boolean;
  caseFile: { title: string; tabs: { title: string; body: string }[] };
  evidence: { id: string; title: string; body: string; surprise: boolean }[];
  surpriseReleased: boolean;
  teams: { id: JuicioTeam; label: string; mission: string }[];
  parties: { id: string; label: string }[];
  presets: { id: string; label: string; sec: number }[];
  speaker: { team: JuicioTeam; label: string; endsAt: number; trial: 1 | 2 } | null;
  assignments: { groupId: string; name: string; team: JuicioTeam | null; trial: 1 | 2 }[];
  questions: {
    id: string;
    fromName: string;
    fromTeam: JuicioTeam;
    to: JuicioTeam;
    text: string;
    status: (typeof QUESTION_STATUS)[number];
    trial: 1 | 2;
  }[];
  verdicts: JuicioVerdict[] | null;
  closing: {
    keyPoints: string[];
    prompt: string;
    clauses: { name: string; items: string[] }[];
  } | null;
  me?: {
    team: JuicioTeam | null;
    trial: 1 | 2;
    alegato: string;
    questionsSent: number;
    vote: { principal: string; responsibility: Record<string, number>; sanction: string } | null;
    headline: string;
    clauses: string[];
  };
}
