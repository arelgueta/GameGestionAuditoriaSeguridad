/** Acceso seguro a localStorage (puede fallar en modo privado). Sin datos personales. */
export function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin espacio o bloqueado: no es crítico */
  }
}

export function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignorar */
  }
}

export const keys = {
  host: (code: string) => `cj:host:${code}`,
  group: (code: string) => `cj:group:${code}`,
  lastHostState: (code: string) => `cj:last:${code}`,
  muted: 'cj:muted',
  lastCode: 'cj:lastCode',
};
