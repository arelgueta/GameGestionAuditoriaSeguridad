import { z } from 'zod';
import { text, idSchema } from '../text.js';

export const URGENCIES = ['Crítico', 'Alto', 'Medio', 'Bajo'] as const;

export const calcSchema = z.object({
  clients: z.number().min(0).max(10_000_000),
  costPerClient: z.number().min(0).max(100_000),
  probability: z.number().min(0).max(100),
  hours: z.number().min(0).max(100_000),
  hourCost: z.number().min(0).max(100_000),
});
export type Calc = z.infer<typeof calcSchema>;

export const findingSchema = z.object({
  impact: text(1500),
  legal: z.array(idSchema).max(10),
  legalText: text(1000).default(''),
  urgency: z.enum(URGENCIES),
  urgencyWhy: text(600).default(''),
  decisions: z.array(idSchema).max(10),
  decisionText: text(1000).default(''),
  calc: calcSchema,
});
export type Finding = z.infer<typeof findingSchema>;

export const boardroomGroupAction = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('basket'),
    items: z.array(idSchema).max(6),
    fundsRequest: text(1500).default(''),
    memo: text(600, 1),
  }),
  z.object({ type: z.literal('finding'), finding: findingSchema }),
  z.object({ type: z.literal('twist'), response: text(400, 1) }),
  z.object({ type: z.literal('rule'), rule: text(200, 3) }),
]);
export type BoardroomGroupAction = z.infer<typeof boardroomGroupAction>;

export const boardroomHostAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('dealTwists') }),
]);

export type FeedbackLevel = 'red' | 'yellow' | 'green' | 'neutral';
export interface BasketFeedback {
  level: FeedbackLevel;
  messages: string[];
}

export interface Provider {
  id: string;
  name: string;
  price: number;
  priceNote?: string;
  methodology: string;
  deliverables: string;
  contract: string;
}

export interface BoardroomView {
  phase: string;
  budget: number;
  fundsMinChars: number;
  providers: Provider[];
  finding: { text: string; analogy: string };
  legalOptions: { id: string; label: string }[];
  decisionOptions: { id: string; label: string }[];
  calcDefaults: Calc;
  twistsDealt: boolean;
  submitted: { basket: number; finding: number; twist: number; rule: number };
  debrief: {
    groups: {
      groupId: string;
      name: string;
      startup: string;
      basket: string[];
      total: number;
      feedback: BasketFeedback;
      urgency: string | null;
      rule: string;
      twist: { text: string; response: string; debrief: string } | null;
    }[];
  } | null;
  me?: {
    basket: { items: string[]; fundsRequest: string; memo: string } | null;
    finding: Finding | null;
    twist: { text: string; response: string } | null;
    rule: string;
    feedback: BasketFeedback | null;
  };
}
