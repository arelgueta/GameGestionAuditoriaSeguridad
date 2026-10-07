import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { GameId } from '@ciberjunta/shared';
import { config } from './config.js';

/**
 * Lee /content/<id>.json en cada creación de sesión: así el docente puede
 * editar el contenido sin reiniciar el servidor. Cada módulo valida la forma
 * con zod (parseContent) y devuelve errores entendibles.
 */
export function loadContent(id: GameId): unknown {
  const file = path.join(config.contentDir, `${id}.json`);
  const raw = readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `El archivo content/${id}.json no es un JSON válido: ${(err as Error).message}`,
      { cause: err },
    );
  }
}
