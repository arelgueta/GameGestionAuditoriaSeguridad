import { z } from 'zod';
import { text, idSchema } from '../text.js';

export const escapeGroupAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), zone: idSchema, option: z.number().int().min(0).max(3) }),
  z.object({ type: z.literal('unlock'), word: z.string().max(20) }),
  z.object({ type: z.literal('final'), text: text(300, 3) }),
]);
export type EscapeGroupAction = z.infer<typeof escapeGroupAction>;

export const escapeHostAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('noop') }),
]);

export type EscapeCategory = 'personas' | 'procesos' | 'tecnologia';

export interface EscapeZoneView {
  id: string;
  object: string;
  scene: string;
  options: string[];
}

export interface EscapeView {
  phase: string;
  startedAt: number | null;
  endsAt: number | null;
  zones: EscapeZoneView[];
  wordLength: number;
  finalQuestion: string;
  ranking: {
    groupId: string;
    name: string;
    letters: number;
    escapedMs: number | null;
    errors: number;
  }[];
  debrief: {
    heat: {
      id: string;
      object: string;
      flaw: string;
      correct: string;
      errors: number;
      solvedBy: number;
      category: EscapeCategory;
    }[];
    finals: { name: string; text: string }[];
    word: string;
  } | null;
  me?: {
    zones: {
      id: string;
      solved: boolean;
      errors: number;
      lockedUntil: number | null;
      letter: string | null;
      correct: string | null;
      flaw: string | null;
    }[];
    letters: string[];
    escapedAt: number | null;
    attempts: number;
    final: string;
  };
}
