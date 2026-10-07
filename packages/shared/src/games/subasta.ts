import { z } from 'zod';
import { text, idSchema } from '../text.js';

export const LEVELS = ['alta', 'baja'] as const;

export const threatSchema = z.object({
  text: text(120, 1),
  prob: z.enum(LEVELS),
  impact: z.enum(LEVELS),
});
export type Threat = z.infer<typeof threatSchema>;

export const subastaGroupAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('matrix'), threats: z.array(threatSchema).max(5) }),
  z.object({ type: z.literal('bid'), lot: idSchema, amount: z.number().int().min(1).max(10000) }),
  z.object({ type: z.literal('reflection'), text: text(500) }),
]);
export type SubastaGroupAction = z.infer<typeof subastaGroupAction>;

export const subastaHostAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('openLot'), controlId: idSchema }),
  z.object({ type: z.literal('closeLot') }),
  z.object({ type: z.literal('revealIncident'), incidentId: idSchema.optional() }),
]);
export type SubastaHostAction = z.infer<typeof subastaHostAction>;

export interface IncidentOutcome {
  roll: number;
  affected: boolean;
  base: number;
  damage: number;
  bonus: number;
  notes: string[];
}

export interface SubastaView {
  phase: string;
  coinsStart: number;
  controls: {
    id: string;
    name: string;
    units: number;
    basePrice: number;
    protects: string;
    status: 'pendiente' | 'abierto' | 'vendido';
    winners: { name: string; amount: number }[];
  }[];
  lot: {
    controlId: string;
    name: string;
    units: number;
    basePrice: number;
    endsAt: number;
    status: 'open' | 'closed';
    bids: { groupId: string; name: string; amount: number }[];
    winners: string[];
  } | null;
  maxIncidents: number;
  incidentsTotal: number;
  unrevealed: { id: string; name: string }[] | null;
  revealed: {
    id: string;
    name: string;
    damage: number;
    nullifiedBy: string | null;
    halvedBy: string | null;
    results: ({ groupId: string; name: string } & IncidentOutcome)[];
  }[];
  standings: {
    groupId: string;
    name: string;
    coins: number;
    controls: string[];
    damage: number;
    bonus: number;
    score: number;
  }[];
  debrief: {
    lucky: { groupId: string; name: string; dodged: number; controls: number } | null;
    riskResponses: { id: string; title: string; text: string; controls: string[] }[];
    reflections: { name: string; text: string }[];
    matrices: { name: string; threats: Threat[] }[];
  } | null;
  me?: {
    coins: number;
    controls: string[];
    myBid: number | null;
    minBid: number | null;
    winning: boolean;
    threats: Threat[];
    reflection: string;
    score: number;
    damage: number;
    bonus: number;
  };
}
