import type { ExportRow } from './session.js';

const HEADER: (keyof ExportRow)[] = [
  'grupo',
  'startup',
  'fase',
  'item',
  'respuesta',
  'detalle',
  'puntos',
];

/**
 * Evita la "inyección de fórmulas" en planillas: si una celda empieza con
 * = + - @ o tabulación, Excel/Sheets podría ejecutarla como fórmula.
 */
function safeCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  if (/[",\n;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: ExportRow[], extra: Record<string, string> = {}): string {
  const extraKeys = Object.keys(extra);
  const head = [...extraKeys, ...HEADER].join(',');
  const lines = rows.map((r) =>
    [...extraKeys.map((k) => extra[k]), ...HEADER.map((k) => r[k])].map(safeCell).join(','),
  );
  // BOM para que Excel abra bien los acentos.
  return '\uFEFF' + [head, ...lines].join('\r\n') + '\r\n';
}
