export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
}

let items: Toast[] = [];
let next = 1;
const listeners = new Set<(t: Toast[]) => void>();

export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t = { id: next++, kind, text };
  items = [...items.slice(-3), t];
  listeners.forEach((l) => l(items));
  setTimeout(() => dismiss(t.id), kind === 'error' ? 6000 : 4000);
}

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  listeners.forEach((l) => l(items));
}

export function subscribe(fn: (t: Toast[]) => void) {
  listeners.add(fn);
  fn(items);
  return () => void listeners.delete(fn);
}
