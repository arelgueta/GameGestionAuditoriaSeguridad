import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { CODE_ALPHABET, CODE_LENGTH } from '@ciberjunta/shared';
import { config } from '../config.js';

export function newToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt + config.pinSalt, 32).toString('hex');
}

export function newSalt(): string {
  return randomBytes(16).toString('hex');
}

export function newCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

export function newSeed(): number {
  return randomBytes(4).readUInt32BE(0);
}

/** Limitador de eventos por conexión (token bucket). */
export class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(
    private readonly ratePerSec: number,
    private readonly burst: number,
  ) {
    this.tokens = burst;
  }
  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.ratePerSec);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Ventana fija simple por clave (por ejemplo, IP). */
export class KeyedLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}
  allow(key: string): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || h.resetAt < now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.prune(now);
      return true;
    }
    h.count++;
    return h.count <= this.max;
  }
  private prune(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt < now) this.hits.delete(k);
  }
}
