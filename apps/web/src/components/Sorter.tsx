import { useState } from 'react';
import { cx } from './ui';

export interface Bucket {
  id: string;
  label: string;
  tone?: string;
}

/**
 * Clasificador accesible: cada tarjeta se puede arrastrar (mouse) o ubicar
 * con botones (teclado, lectores de pantalla y pantallas táctiles).
 */
export function Sorter({
  items,
  buckets,
  value,
  onChange,
  renderExtra,
}: {
  items: { id: string; text: string }[];
  buckets: Bucket[];
  value: Record<string, string | null>;
  onChange: (next: Record<string, string | null>) => void;
  renderExtra?: (itemId: string) => React.ReactNode;
}) {
  const [over, setOver] = useState<string | null>(null);
  const place = (itemId: string, bucket: string | null) => onChange({ ...value, [itemId]: bucket });
  const zones: (Bucket | { id: null; label: string; tone?: string })[] = [
    { id: null, label: 'Sin clasificar', tone: 'border-slate-300 bg-slate-100' },
    ...buckets,
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-4">
      {zones.map((z) => {
        const list = items.filter((it) => (value[it.id] ?? null) === z.id);
        const key = z.id ?? '__none';
        return (
          <section
            key={key}
            aria-label={z.label}
            className={cx(
              'min-h-[120px] rounded-2xl border-2 p-3 transition-colors',
              z.tone ?? 'border-slate-300 bg-white',
              over === key && 'ring-4 ring-accent-400',
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(key);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData('text/plain');
              if (items.some((i) => i.id === id)) place(id, z.id);
            }}
          >
            <h3 className="mb-2 text-lg">
              {z.label} <span className="font-normal text-slate-600">({list.length})</span>
            </h3>
            <ul className="space-y-2">
              {list.map((it) => (
                <li
                  key={it.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', it.id)}
                  className="cursor-grab rounded-xl border border-slate-300 bg-white p-3 shadow-sm"
                >
                  <p className="mb-2 font-medium">{it.text}</p>
                  <div
                    className="flex flex-wrap gap-1"
                    role="group"
                    aria-label={`Mover “${it.text}” a`}
                  >
                    {buckets.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className={cx(
                          'rounded-lg border px-2 py-1 text-sm font-semibold',
                          value[it.id] === b.id
                            ? 'border-brand-700 bg-brand-700 text-white'
                            : 'border-slate-300 bg-slate-50 hover:bg-brand-50',
                        )}
                        aria-pressed={value[it.id] === b.id}
                        onClick={() => place(it.id, value[it.id] === b.id ? null : b.id)}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  {renderExtra?.(it.id)}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
