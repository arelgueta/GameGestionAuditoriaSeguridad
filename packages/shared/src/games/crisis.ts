import { z } from 'zod';
import { text } from '../text.js';

export const crisisGroupAction = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('decide'),
    inject: z.number().int().min(0),
    option: z.string().max(10),
    justification: text(300).default(''),
  }),
  z.object({
    type: z.literal('closing'),
    statement: text(1200),
    prep: z.array(text(200)).max(5),
  }),
]);
export type CrisisGroupAction = z.infer<typeof crisisGroupAction>;

export const crisisHostAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('nextInject') }),
  z.object({ type: z.literal('closeInject') }),
  z.object({ type: z.literal('setAuto'), on: z.boolean() }),
  z.object({ type: z.literal('setShowImmediate'), on: z.boolean() }),
]);
export type CrisisHostAction = z.infer<typeof crisisHostAction>;

export interface CrisisOptionView {
  id: string;
  text: string;
  points?: number;
}

export interface CrisisDebrief {
  injects: {
    minute: number;
    title: string;
    options: Required<CrisisOptionView>[];
    debatable: boolean;
  }[];
  timeline: {
    groupId: string;
    name: string;
    trust: number;
    cells: { option: string | null; points: number }[];
  }[];
  debatableIndex: number;
  debatableCounts: { option: string; text: string; count: number }[];
  paymentArgs: { against: string[]; favor: string[]; lesson: string };
  statements: { name: string; statement: string }[];
  prepItems: string[];
  finalQuestion: string;
}

export interface CrisisView {
  phase: string;
  startTrust: number;
  totalInjects: number;
  injectIndex: number;
  current: {
    index: number;
    minute: number;
    title: string;
    text: string;
    options: CrisisOptionView[];
    endsAt: number;
    closed: boolean;
    decidedCount: number;
  } | null;
  autoMode: boolean;
  nextAutoAt: number | null;
  showImmediate: boolean;
  maxWords: number;
  ranking: { groupId: string; name: string; trust: number }[] | null;
  debrief: CrisisDebrief | null;
  me?: {
    trust: number | null;
    log: {
      index: number;
      minute: number;
      title: string;
      option: string | null;
      justification: string;
      points: number | null;
    }[];
    current: { option: string; justification: string } | null;
    closing: { statement: string; prep: string[] } | null;
  };
  host?: {
    decisions: { groupId: string; name: string; option: string | null; justification: string }[];
  };
}
