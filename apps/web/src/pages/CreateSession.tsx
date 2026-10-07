import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CATALOG, type CatalogEntry, type GameId } from '@ciberjunta/shared';
import { createSession, hostLogin } from '../lib/api';
import { keys, save } from '../lib/storage';
import { toast } from '../lib/toast';
import { unlockAudio } from '../lib/sound';
import { Field } from '../components/ui';
import { Disclaimer } from '../components/chrome';
import {
  ActivityFields,
  GamePicker,
  toActivityInput,
  useActivityDraft,
} from '../components/ActivityForm';

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
        Elijan la primera dinámica, configúrenla y compartan el código con los grupos. Durante la
        clase pueden sumar otras dinámicas desde el panel docente con el mismo código: los grupos no
        tienen que volver a unirse.
      </p>

      {!entry ? (
        <>
          <GamePicker onPick={setGameId} />
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
  const [draft, setDraft] = useActivityDraft(entry);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    unlockAudio();
    if (!/^\d{4}$/.test(pin)) return toast('El PIN debe tener 4 dígitos.', 'error');
    setBusy(true);
    try {
      const r = await createSession({
        ...toActivityInput(entry, draft),
        pin,
        expectedGroups: expected,
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

      <ActivityFields entry={entry} draft={draft} onChange={setDraft} />

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
