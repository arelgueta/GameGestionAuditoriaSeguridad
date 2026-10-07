import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Busca la raíz del repo (donde está /content) subiendo desde este archivo. */
function findRoot(): string {
  let dir = here;
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'content')) && existsSync(path.join(dir, 'package.json')))
      return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const root = findRoot();
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.HOST_PIN_SALT) {
  console.warn('[config] HOST_PIN_SALT no está definido: usando un valor temporal.');
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 3001,
  pinSalt: process.env.HOST_PIN_SALT || 'dev-salt-solo-para-desarrollo',
  sessionTtlMs: (Number(process.env.SESSION_TTL_MINUTES) || 240) * 60_000,
  databaseUrl: process.env.DATABASE_URL || '',
  contentDir: process.env.CONTENT_DIR || path.join(root, 'content'),
  webDist: path.join(root, 'apps', 'web', 'dist'),
  maxSessions: 300,
  maxGroupsPerSession: 40,
};
