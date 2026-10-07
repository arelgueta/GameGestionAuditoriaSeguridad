import type { SessionData } from './sessions.js';

/**
 * Persistencia opcional. Por defecto todo vive en memoria (un reinicio borra
 * las sesiones). Si se define DATABASE_URL, las sesiones se guardan también en
 * PostgreSQL y se restauran al reiniciar.
 */
export interface Storage {
  loadAll(): Promise<SessionData[]>;
  scheduleSave(s: SessionData): void;
  delete(code: string): Promise<void>;
}

export class MemoryStorage implements Storage {
  async loadAll() {
    return [];
  }
  scheduleSave() {}
  async delete() {}
}

export async function createStorage(databaseUrl: string): Promise<Storage> {
  if (!databaseUrl) return new MemoryStorage();
  const { PostgresStorage } = await import('./postgres.js');
  const pg = new PostgresStorage(databaseUrl);
  await pg.init();
  console.log('[storage] usando PostgreSQL');
  return pg;
}
