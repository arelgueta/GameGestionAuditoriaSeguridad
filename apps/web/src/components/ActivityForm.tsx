import { useState } from 'react';
import { CATALOG, type ActivityInput, type CatalogEntry, type GameId } from '@ciberjunta/shared';
import { cx } from './ui';

const PRIORITY_LABEL = {
  alta: 'Prioridad alta',
  media: 'Prioridad media',
  baja: 'Soporte para actividad oral',
};

/** Tarjetas del catálogo para elegir una dinámica. */
export function GamePicker({
  onPick,
  compact,
}: {
  onPick: (id: GameId) => void;
  compact?: boolean;
}) {
  return (
    <ul className={cx('grid gap-4', !compact && 'md:grid-cols-2')}>
      {CATALOG.map((g) => (
        <li key={g.id}>
          <button
            type="button"
            onClick={() => onPick(g.id)}
            className="card h-full w-full text-left hover:border-brand-500 hover:bg-brand-50"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-bold text-brand-900">{g.title}</span>
              <span
                className={cx(
                  'chip',
                  g.priority === 'alta'
                    ? 'bg-accent-400 text-slate-900'
                    : 'bg-slate-200 text-slate-800',
                )}
              >
                {PRIORITY_LABEL[g.priority]}
              </span>
            </span>
            {!compact && <span className="mt-2 block text-slate-800">{g.objective}</span>}
            <span className="mt-3 block text-sm text-slate-600">
              <span aria-hidden="true">⏱ </span>~{g.durationMin} min ·{' '}
              {g.phases.map((p) => p.title).join(' → ')}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface ActivityDraft {
  durations: Record<string, number>;
  cfg: Record<string, boolean | number>;
}

/** Estado editable (duraciones en minutos y opciones) con los valores por defecto del catálogo. */
export function useActivityDraft(entry: CatalogEntry) {
  return useState<ActivityDraft>(() => ({
    durations: Object.fromEntries(
      entry.phases.filter((p) => p.durationSec).map((p) => [p.id, Math.round(p.durationSec! / 60)]),
    ),
    cfg: Object.fromEntries(entry.config.map((f) => [f.key, f.default])),
  }));
}

export function toActivityInput(entry: CatalogEntry, d: ActivityDraft): ActivityInput {
  return {
    gameId: entry.id,
    phaseDurations: Object.fromEntries(
      Object.entries(d.durations).map(([k, v]) => [k, Math.max(1, v) * 60]),
    ),
    config: d.cfg,
  };
}

/** Duración de las fases y opciones propias de una dinámica. */
export function ActivityFields({
  entry,
  draft,
  onChange,
}: {
  entry: CatalogEntry;
  draft: ActivityDraft;
  onChange: (d: ActivityDraft) => void;
}) {
  const { durations, cfg } = draft;
  const setDurations = (v: Record<string, number>) => onChange({ ...draft, durations: v });
  const setCfg = (v: Record<string, boolean | number>) => onChange({ ...draft, cfg: v });
  return (
    <>
      {Object.keys(durations).length > 0 && (
        <fieldset className="mb-4">
          <legend className="label">Duración de las fases (minutos)</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {entry.phases
              .filter((p) => p.durationSec)
              .map((p) => (
                <label
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
                >
                  <span>{p.title}</span>
                  <input
                    className="input max-w-[6rem]"
                    type="number"
                    min={1}
                    max={120}
                    value={durations[p.id]}
                    onChange={(e) =>
                      setDurations({ ...durations, [p.id]: Number(e.target.value) || 1 })
                    }
                  />
                </label>
              ))}
          </div>
        </fieldset>
      )}

      {entry.config.length > 0 && (
        <fieldset className="mb-6">
          <legend className="label">Opciones</legend>
          <div className="space-y-3">
            {entry.config.map((f) =>
              f.type === 'boolean' ? (
                <label key={f.key} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-6 w-6"
                    checked={!!cfg[f.key]}
                    onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.checked })}
                  />
                  {f.label}
                </label>
              ) : (
                <label key={f.key} className="flex items-center justify-between gap-3">
                  <span>{f.label}</span>
                  <input
                    className="input max-w-[7rem]"
                    type="number"
                    min={f.min}
                    max={f.max}
                    value={Number(cfg[f.key])}
                    onChange={(e) => setCfg({ ...cfg, [f.key]: Number(e.target.value) })}
                  />
                </label>
              ),
            )}
          </div>
        </fieldset>
      )}
    </>
  );
}
