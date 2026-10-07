import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ROLE_IDS, ROLE_LABELS, type RoleId } from '@ciberjunta/shared';
import { SessionProvider, useSocketSession } from '../lib/session';
import { keys, load, remove, save } from '../lib/storage';
import { toast } from '../lib/toast';
import { unlockAudio } from '../lib/sound';
import { Countdown, TextInput } from '../components/ui';
import { ConnectionBadge, Disclaimer, SoundToggle } from '../components/chrome';
import { GAMES } from '../games';

interface Stored {
  groupId: string;
  groupToken: string;
}

export function GroupPage() {
  const params = useParams();
  const [search] = useSearchParams();
  const code = (params.code ?? search.get('c') ?? '').toUpperCase();
  const [, setVersion] = useState(0);
  const stored = params.code ? load<Stored>(keys.group(code)) : null;

  if (params.code && stored)
    return (
      <GroupSession
        key={code}
        code={code}
        token={stored.groupToken}
        onLost={() => {
          remove(keys.group(code));
          setVersion((v) => v + 1);
        }}
      />
    );
  return (
    <JoinForm
      initialCode={code}
      onJoined={(c, s) => {
        save(keys.group(c), s);
        setVersion((v) => v + 1);
      }}
    />
  );
}

function JoinForm({
  initialCode,
  onJoined,
}: {
  initialCode: string;
  onJoined: (code: string, s: Stored) => void;
}) {
  const navigate = useNavigate();
  const session = useSocketSession({ role: 'group', code: '', token: null });
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [startup, setStartup] = useState('');
  const [roles, setRoles] = useState<Partial<Record<RoleId, string>>>({});
  const [showRoles, setShowRoles] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    unlockAudio();
    const c = code.trim().toUpperCase();
    const existing = load<Stored>(keys.group(c));
    if (existing) {
      navigate(`/grupo/${c}`);
      return;
    }
    if (!name.trim()) return toast('Escriban el nombre del grupo.', 'error');
    setBusy(true);
    const r = await session.join({ code: c, name, startup, roles });
    setBusy(false);
    if (r) {
      onJoined(c, r);
      navigate(`/grupo/${c}`);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <nav className="mb-4">
        <Link to="/" className="underline">
          ← Inicio
        </Link>
      </nav>
      <form className="card" onSubmit={submit}>
        <h1 className="mb-1 text-3xl text-brand-900">Unirse a la sesión</h1>
        <p className="mb-6 text-slate-700">
          Un dispositivo por grupo. No hace falta registrarse ni dar datos personales.
        </p>
        <label className="mb-4 block">
          <span className="label">Código de la sesión</span>
          <input
            className="input font-mono text-2xl uppercase tracking-[0.3em]"
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <TextInput
          label="Nombre del grupo"
          value={name}
          onChange={setName}
          max={40}
          placeholder="Ej.: Los Firewall"
        />
        <TextInput
          label="Nombre de su startup (del TP Integrador)"
          value={startup}
          onChange={setStartup}
          max={60}
          placeholder="Ej.: PagaFácil"
        />
        <button
          type="button"
          className="btn-ghost btn-sm mb-2"
          aria-expanded={showRoles}
          onClick={() => setShowRoles(!showRoles)}
        >
          {showRoles ? '− Ocultar roles' : '+ Asignar roles (opcional)'}
        </button>
        {showRoles && (
          <fieldset className="mb-4 rounded-xl bg-slate-50 p-3">
            <legend className="sr-only">Roles</legend>
            <p className="mb-3 text-sm text-slate-700">Solo nombres de pila o apodos.</p>
            {ROLE_IDS.map((r) => (
              <label key={r} className="mb-2 flex items-center gap-3">
                <span className="w-32 font-semibold">{ROLE_LABELS[r]}</span>
                <input
                  className="input"
                  maxLength={30}
                  value={roles[r] ?? ''}
                  onChange={(e) => setRoles({ ...roles, [r]: e.target.value })}
                />
              </label>
            ))}
          </fieldset>
        )}
        <button
          className="btn-primary w-full text-lg"
          type="submit"
          disabled={busy || !session.connected}
        >
          {session.connected ? (busy ? 'Entrando…' : 'Entrar a la sala') : 'Conectando…'}
        </button>
        <Disclaimer className="mt-4 text-center text-slate-600" />
      </form>
    </main>
  );
}

function GroupSession({
  code,
  token,
  onLost,
}: {
  code: string;
  token: string;
  onLost: () => void;
}) {
  const session = useSocketSession({ role: 'group', code, token, onUnauthorized: onLost });
  const { payload } = session;

  if (session.closed)
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <div className="card text-center">
          <p className="mb-4 text-lg">{session.closed}</p>
          <Link className="btn-primary" to="/" onClick={onLost}>
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  if (!payload || payload.role !== 'group')
    return <main className="px-4 py-12 text-center text-lg">{session.error ?? 'Conectando…'}</main>;

  const { meta, me } = payload;
  const game = GAMES[meta.gameId];
  const phase = meta.phases[meta.phaseIndex];
  return (
    <SessionProvider value={session}>
      <div className="min-h-screen pb-24" onClick={unlockAudio}>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-2">
            <div className="mr-auto min-w-0">
              <p className="truncate font-bold">{me.name}</p>
              <p className="truncate text-sm text-slate-600">{me.startup || meta.gameTitle}</p>
            </div>
            {meta.status === 'running' && (
              <Countdown endsAt={meta.phaseEndsAt} className="text-xl" />
            )}
            <ConnectionBadge connected={session.connected} />
          </div>
          {phase && (
            <p className="mx-auto max-w-3xl px-4 pb-2 text-sm font-semibold text-brand-800">
              Fase {meta.phaseIndex + 1}/{meta.phases.length}: {phase.title}
              {meta.paused && <span className="ml-2 text-warn-700">· En pausa</span>}
            </p>
          )}
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">
          {meta.status === 'lobby' ? (
            <div className="card text-center">
              <p className="text-5xl" aria-hidden="true">
                ⏳
              </p>
              <h1 className="mt-2 text-2xl">¡Listo, {me.name}!</h1>
              {me.startup && (
                <p className="mt-2 text-lg">
                  Junta directiva de <strong>{me.startup}</strong>
                </p>
              )}
              {Object.keys(me.roles).length > 0 && (
                <ul className="mt-4 flex flex-wrap justify-center gap-2">
                  {Object.entries(me.roles).map(([k, v]) => (
                    <li key={k} className="chip bg-brand-50 text-brand-800">
                      {ROLE_LABELS[k as RoleId]}: {v}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-6 text-slate-700">
                Esperen a que el docente inicie la dinámica: {meta.gameTitle}.
              </p>
            </div>
          ) : (
            <game.Group view={payload.view} meta={meta} />
          )}
        </main>
        <footer className="mx-auto max-w-3xl px-4">
          <SoundToggle />
        </footer>
      </div>
    </SessionProvider>
  );
}
