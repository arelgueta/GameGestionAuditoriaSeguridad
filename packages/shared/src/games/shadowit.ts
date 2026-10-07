import { z } from 'zod';
import { text, idSchema } from '../text.js';

export const INVENTORY_COLUMNS = ['prohibir', 'reemplazar', 'permitir'] as const;
export type InventoryColumn = (typeof INVENTORY_COLUMNS)[number];
export const LIGHTS = ['verde', 'amarillo', 'rojo'] as const;
export type Light = (typeof LIGHTS)[number];
export const AI_OPTIONS = ['gratis', 'pro', 'onprem'] as const;
export type AiOption = (typeof AI_OPTIONS)[number];

export const shadowitGroupAction = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('inventory'),
    items: z.record(
      idSchema,
      z.object({ column: z.enum(INVENTORY_COLUMNS).nullable(), why: text(300).default('') }),
    ),
  }),
  z.object({
    type: z.literal('diligence'),
    option: z.enum(AI_OPTIONS),
    users: z.number().int().min(1).max(100000),
    questions: z.array(text(300)).length(3),
  }),
  z.object({
    type: z.literal('semaforo'),
    cards: z.record(idSchema, z.enum(LIGHTS).nullable()),
    rule: text(300).default(''),
  }),
]);
export type ShadowitGroupAction = z.infer<typeof shadowitGroupAction>;

export const shadowitHostAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('noop') }),
]);

export interface AiProduct {
  id: AiOption;
  name: string;
  setupCost: number;
  perUserMonth: number;
  yearlyFixed: number;
  priceLabel: string;
}

export interface ShadowitView {
  phase: string;
  situation: string;
  inventoryItems: { id: string; text: string }[];
  columns: { id: InventoryColumn; label: string }[];
  products: AiProduct[];
  criteria: { id: string; label: string; tooltip: string; values: Record<AiOption, string> }[];
  cards: { id: string; text: string }[];
  defaultRule: string;
  submitted: { inventory: number; diligence: number; semaforo: number };
  debrief: {
    message: string;
    inventory: {
      id: string;
      text: string;
      counts: Record<InventoryColumn, number>;
      why: string[];
    }[];
    options: Record<AiOption, number>;
    questions: { name: string; option: AiOption; questions: string[] }[];
    cards: { id: string; text: string; reference: Light; counts: Record<Light, number> }[];
    matches: { name: string; match: number; total: number }[];
    rules: { name: string; rule: string }[];
  } | null;
  me?: {
    inventory: Record<string, { column: InventoryColumn | null; why: string }> | null;
    diligence: { option: AiOption; users: number; questions: string[] } | null;
    semaforo: { cards: Record<string, Light | null>; rule: string } | null;
  };
}
