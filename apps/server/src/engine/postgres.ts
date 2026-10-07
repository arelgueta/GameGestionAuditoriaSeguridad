import pg from 'pg';
import type { SessionData } from './sessions.js';
import type { Storage } from './storage.js';

const SAVE_DELAY_MS = 2000;

export class PostgresStorage implements Storage {
  private pool: pg.Pool;
  private pending = new Map<string, SessionData>();
  private timer: NodeJS.Timeout | null = null;

  constructor(url: string) {
    this.pool = new pg.Pool({
      connectionString: url,
      max: 3,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ciberjunta_sessions (
        code TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
  }

  async loadAll(): Promise<SessionData[]> {
    const r = await this.pool.query<{ data: SessionData }>('SELECT data FROM ciberjunta_sessions');
    return r.rows.map((x) => x.data);
  }

  scheduleSave(s: SessionData) {
    this.pending.set(s.code, s);
    if (!this.timer) this.timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  private async flush() {
    this.timer = null;
    const items = [...this.pending.values()];
    this.pending.clear();
    for (const s of items) {
      try {
        await this.pool.query(
          `INSERT INTO ciberjunta_sessions (code, data, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [s.code, JSON.stringify(s)],
        );
      } catch (err) {
        console.error('[storage] error al guardar', s.code, err);
      }
    }
  }

  async delete(code: string) {
    this.pending.delete(code);
    await this.pool
      .query('DELETE FROM ciberjunta_sessions WHERE code = $1', [code])
      .catch(() => {});
  }
}
