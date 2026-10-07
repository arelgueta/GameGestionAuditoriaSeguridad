import { z } from 'zod';
import { text } from '../text.js';

export const PHISH_CHANNELS = [
  'sms',
  'mail',
  'whatsapp',
  'linkedin',
  'llamada',
  'qr',
  'audio',
] as const;
export type PhishChannel = (typeof PHISH_CHANNELS)[number];
export type PhishAnswer = 'PHISH' | 'FISH';

export interface PhishMessage {
  channel: PhishChannel;
  sender: string;
  senderDetail?: string;
  subject?: string;
  body: string;
  attachment?: string;
  link?: string;
  time?: string;
}

export interface OsintProfile {
  name: string;
  role: string;
  company: string;
  location: string;
  about: string;
  posts: { date: string; text: string }[];
}

export const CAMPAIGN_PIECES = ['afiche', 'sticker', 'video'] as const;
export const CAMPAIGN_ACTIONS = ['simulacro', 'boton', 'premio', 'otra'] as const;

export const campaignSchema = z.object({
  message: text(60, 3),
  piece: z.enum(CAMPAIGN_PIECES),
  pieceText: text(1000).default(''),
  action: z.enum(CAMPAIGN_ACTIONS),
  actionOther: text(200).default(''),
  indicator: z.string().max(80),
  target: z.number().min(0).max(100000),
});
export type Campaign = z.infer<typeof campaignSchema>;

export const phishGroupAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('osint'), notes: text(1500) }),
  z.object({
    type: z.literal('answer'),
    round: z.number().int().min(0),
    choice: z.enum(['PHISH', 'FISH']),
  }),
  z.object({
    type: z.literal('signal'),
    round: z.number().int().min(0),
    signal: z.number().int().min(0).max(3),
  }),
  z.object({ type: z.literal('campaign'), campaign: campaignSchema }),
  z.object({ type: z.literal('vote'), target: z.string().max(40) }),
  z.object({ type: z.literal('rule'), rule: text(200, 3) }),
]);
export type PhishGroupAction = z.infer<typeof phishGroupAction>;

export const phishHostAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('nextRound') }),
  z.object({ type: z.literal('skipStage') }),
]);
export type PhishHostAction = z.infer<typeof phishHostAction>;

export type PhishStage = 'answer' | 'signal' | 'reveal';

export interface PhishRoundView {
  index: number;
  total: number;
  stage: PhishStage;
  stageEndsAt: number | null;
  message: PhishMessage;
  signals: string[] | null;
  answeredCount: number;
  signaledCount: number;
  reveal: {
    answer: PhishAnswer;
    correctSignal: number;
    explanation: string;
    counts: { PHISH: number; FISH: number; none: number };
    signalCounts: number[];
  } | null;
}

export interface PhishView {
  phase: string;
  osint: OsintProfile;
  roundsTotal: number;
  round: PhishRoundView | null;
  ranking: { groupId: string; name: string; score: number }[];
  campaignOptions: { indicators: string[] };
  campaignsSubmitted: number;
  gallery: { groupId: string; name: string; campaign: Campaign; votes: number | null }[] | null;
  closing: { message: string; rules: { name: string; rule: string }[] } | null;
  me?: {
    notes: string;
    answer: { choice: PhishAnswer | null; signal: number | null } | null;
    lastResult: { points: number; correct: boolean; signalCorrect: boolean; bonus: number } | null;
    score: number;
    rank: number;
    campaign: Campaign | null;
    vote: string | null;
    rule: string;
  };
  host?: {
    answers: { groupId: string; name: string; choice: PhishAnswer | null; signal: number | null }[];
    osintNotes: { name: string; notes: string }[];
  };
}
