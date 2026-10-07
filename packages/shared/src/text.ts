import { z } from 'zod';

/** Límite general para cualquier texto libre (sección 5 de la SPEC). */
export const MAX_FREE_TEXT = 1500;

// Caracteres de control salvo salto de línea y tabulación.
const CONTROL_CHARS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Normaliza un texto ingresado por un usuario. Nunca se interpreta como HTML. */
export function cleanText(value: string): string {
  return value.normalize('NFC').replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').trim();
}

/** Esquema zod para texto libre: limpia y limita la longitud. */
export function text(max: number = MAX_FREE_TEXT, min = 0) {
  return z
    .string()
    .max(max * 2) // corte previo grueso antes de limpiar
    .transform(cleanText)
    .pipe(z.string().min(min).max(Math.min(max, MAX_FREE_TEXT)));
}

export function countWords(value: string): number {
  const t = value.trim();
  return t ? t.split(/\s+/).length : 0;
}

export const idSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/);
