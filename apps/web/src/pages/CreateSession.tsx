import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CATALOG, type CatalogEntry, type GameId } from '@ciberjunta/shared';
import { createSession, hostLogin } from '../lib/api';
import { keys, save } from '../lib/storage';
import { toast } from '../lib/toast';
import { unlockAudio } from '../lib/sound';
import { cx, Field } from '../components/ui';
import { Disclaimer } from '../components/chrome';

const PRIORITY_LABEL = {
  alta: 'Prioridad alta',
  media: 'Prioridad media',
  baja: 'Soporte para actividad oral',
};

export function CreateSession() {
  const [gameId, setGameId] = useState<GameId | null>(null);
  const entry = CATALOG.find((c) => c.id === gameId) ?? null;
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-6">
        <Link to="/" className="underline">
          ← Inicio
        </Link>
      </nav>
      <h1 className="mb-2 text-4xl text-brand-900">Crear sesión</h1>
      <p className="mb-6 text-slate-700">
        Elijan la dinámica, configúrenla y compartan el código con los grupos.
      </p>

      {!entry ? (
        <>
          <ul className="grid gap-4 md:grid-cols-2">
            {CATALOG.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setGameId(g.id)}
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
                  <span className="mt-2 block text-slate-800">{g.objective}</span>
                  <span className="mt-3 block text-sm text-slate-600">
                    <span aria-hidden="true">⏱ </span>~{g.durationMin} min ·{' '}
                    {g.phases.map((p) => p.title).join(' → ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <RecoverSession />
        </>
      ) : (
        <ConfigForm entry={entry} onBack={() => setGameId(null)} />
      )}
      <Disclaimer className="mt-10 text-center text-slate-700" />
    </main>
  );
}

function ConfigForm({ entry, onBack }: { entry: CatalogEntry; onBack: () => void }) {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [expected, setExpected] = useState(6);
  const [durations, setDurations] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      entry.phases.filter((p) => p.durationSec).map((p) => [p.id, Math.round(p.durationSec! / 60)]),
    ),
  );
  const [cfg, setCfg] = useState<Record<string, boolean | number>>(() =>
    Object.fromEntries(entry.config.map((f) => [f.key, f.default])),
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    unlockAudio();
    if (!/^\d{4}$/.test(pin)) return toast('El PIN debe tener 4 dígitos.', 'error');
    setBusy(true);
    try {
      const r = await createSession({
        gameId: entry.id,
        pin,
        expectedGroups: expected,
        phaseDurations: Object.fromEntries(
          Object.entries(durations).map(([k, v]) => [k, Math.max(1, v) * 60]),
        ),
        config: cfg,
      });
      save(keys.host(r.code), r.hostToken);
      save(keys.lastCode, r.code);
      navigate(`/docente/${r.code}`);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card max-w-2xl">
      <button type="button" className="btn-ghost btn-sm mb-2" onClick={onBack}>
        ← Elegir otra dinámica
      </button>
      <h2 className="mb-1 text-2xl">{entry.title}</h2>
      <p className="mb-6 text-slate-700">{entry.objective}</p>

      <Field
        label="PIN docente (4 dígitos)"
        hint="Solo quien tenga el PIN puede controlar la sesión. No lo compartan con los grupos."
        htmlFor="pin"
      >
        <input
          id="pin"
          className="input max-w-[12rem] text-2xl tracking-[0.5em]"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{4}"
          maxLength={4}
          required
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
      </Field>

      <Field label="Cantidad de grupos esperada" htmlFor="exp">
        <input
          id="exp"
          className="input max-w-[8rem]"
          type="number"
          min={1}
          max={40}
          value={expected}
          onChange={(e) => setExpected(Number(e.target.value) || 1)}
        />
      </Field>

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

      <button type="submit" className="btn-primary w-full text-lg" disabled={busy}>
        {busy ? 'Creando…' : 'Crear sesión y obtener código'}
      </button>
    </form>
  );
}

function RecoverSession() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    try {
      const r = await hostLogin(c, pin);
      save(keys.host(c), r.hostToken);
      navigate(`/docente/${c}`);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }
  return (
    <form onSubmit={submit} className="card mt-8 max-w-2xl">
      <h2 className="mb-2 text-xl">Retomar una sesión existente</h2>
      <p className="mb-4 text-slate-700">
        Si cerraron la pestaña o cambiaron de computadora, ingresen el código y el PIN.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1">
          <span className="label">Código</span>
          <input
            className="input uppercase"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        <label>
          <span className="label">PIN</span>
          <input
            className="input max-w-[8rem]"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            required
          />
        </label>
        <button className="btn-secondary" type="submit">
          Retomar
        </button>
      </div>
    </form>
  );
}
