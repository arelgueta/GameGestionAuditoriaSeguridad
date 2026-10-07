import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  CATALOG,
  MAX_ACTIVITIES,
  ROLE_LABELS,
  toCsv,
  type CatalogEntry,
  type GameId,
  type RoleId,
  type StatePayload,
} from '@ciberjunta/shared';
import { downloadBlob, downloadExport, hostLogin } from '../lib/api';
import { SessionProvider, useSession, useSocketSession } from '../lib/session';
import { keys, load, remove, save } from '../lib/storage';
import { toast } from '../lib/toast';
import { unlockAudio } from '../lib/sound';
import { AsyncButton, Countdown, cx } from '../components/ui';
import { ConnectionBadge, JoinQr, joinUrl, PhaseSteps, SoundToggle } from '../components/chrome';
import {
  ActivityFields,
  GamePicker,
  toActivityInput,
  useActivityDraft,
} from '../components/ActivityForm';
import { GAMES } from '../games';

type HostPayload = Extract<StatePayload, { role: 'host' }>;

export function HostPage() {
  const code = (useParams().code ?? '').toUpperCase();
  const [token, setToken] = useState<string | null>(() => load<string>(keys.host(code)));
  if (!token) return <PinPrompt code={code} onToken={setToken} />;
  return (
    <HostConsole
      code={code}
      token={token}
      onUnauthorized={() => {
        remove(keys.host(code));
        setToken(null);
      }}
    />
  );
}

function PinPrompt({ code, onToken }: { code: string; onToken: (t: string) => void }) {
  const [pin, setPin] = useState('');
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await hostLogin(code, pin);
            save(keys.host(code), r.hostToken);
            onToken(r.hostToken);
          } catch (err) {
            toast((err as Error).message, 'error');
          }
        }}
      >
        <h1 className="mb-2 text-2xl">Panel docente · {code}</h1>
        <p className="mb-4 text-slate-700">
          Ingresen el PIN de 4 dígitos con el que crearon la sesión.
        </p>
        <input
          className="input mb-4 text-2xl tracking-[0.5em]"
          type="password"
          inputMode="numeric"
          maxLength={4}
          aria-label="PIN docente"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
        <button className="btn-primary w-full" type="submit">
          Entrar
        </button>
        <LocalBackupExport code={code} />
      </form>
    </main>
  );
}

/** Reexporta la última copia guardada en este navegador (por si el servidor se reinició). */
function LocalBackupExport({ code }: { code: string }) {
  const last = load<HostPayload & { savedAt: number }>(keys.lastHostState(code));
  if (!last) return null;
  return (
    <div className="mt-6 rounded-xl bg-slate-100 p-4">
      <p className="mb-2 text-sm text-slate-700">
        Hay una copia local de esta sesión guardada el{' '}
        {new Date(last.savedAt).toLocaleString('es-AR')}.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => exportLocal(code, last, 'csv')}
        >
          Descargar CSV (copia local)
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => exportLocal(code, last, 'json')}
        >
          Descargar JSON (copia local)
        </button>
      </div>
    </div>
  );
}

function exportLocal(code: string, p: HostPayload, format: 'csv' | 'json') {
  if (format === 'csv')
    downloadBlob(toCsv(p.rows, { sesion: code }), `ciberjunta-${code}-local.csv`, 'text/csv');
  else
    downloadBlob(
      JSON.stringify(
        {
          app: 'CiberJunta',
          origen: 'copia local del navegador',
          exportedAt: new Date().toISOString(),
          seed: p.seed,
          meta: p.meta,
          rows: p.rows,
          view: p.view,
        },
        null,
        2,
      ),
      `ciberjunta-${code}-local.json`,
      'application/json',
    );
}

function HostConsole({
  code,
  token,
  onUnauthorized,
}: {
  code: string;
  token: string;
  onUnauthorized: () => void;
}) {
  const session = useSocketSession({ role: 'host', code, token, onUnauthorized });
  const { payload, connected, error, hostAct } = session;

  if (session.closed)
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <div className="card">
          <h1 className="mb-2 text-2xl">La sesión terminó</h1>
          <p className="mb-4">{session.closed}</p>
          <LocalBackupExport code={code} />
        </div>
      </main>
    );

  if (!payload || payload.role !== 'host')
    return (
      <main className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-lg">{error ?? 'Conectando con el servidor…'}</p>
        <LocalBackupExport code={code} />
      </main>
    );

  const { meta } = payload;
  const game = GAMES[meta.gameId];
  const phase = meta.phases[meta.phaseIndex];
  const nextPhase = meta.phases[meta.phaseIndex + 1];

  return (
    <SessionProvider value={session}>
      <div className="min-h-screen" onClick={unlockAudio}>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
            <div className="mr-auto">
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
                Panel docente
              </p>
              <h1 className="text-xl">{meta.gameTitle}</h1>
            </div>
            <span
              className="rounded-xl bg-brand-900 px-4 py-2 font-mono text-2xl font-bold tracking-widest text-white"
              aria-label={`Código de sesión ${code.split('').join(' ')}`}
            >
              {code}
            </span>
            <a
              className="btn-secondary btn-sm"
              href={`/pantalla/${code}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span aria-hidden="true">📽</span> Abrir pantalla proyectada
            </a>
            <ConnectionBadge connected={connected} />
            <SoundToggle />
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">
          <section className="card mb-6" aria-label="Control de la sesión">
            <div className="mb-4">
              <PhaseSteps meta={meta} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {meta.status === 'lobby' ? (
                <AsyncButton
                  className="btn-primary text-lg"
                  onClick={() => hostAct({ type: 'start' })}
                >
                  ▶ Iniciar dinámica
                </AsyncButton>
              ) : (
                <>
                  <span className="text-lg font-semibold">
                    Fase actual: <span className="text-brand-800">{phase?.title}</span>
                  </span>
                  <Countdown endsAt={meta.phaseEndsAt} className="text-2xl" />
                  {meta.paused ? (
                    <AsyncButton
                      className="btn-primary btn-sm"
                      onClick={() => hostAct({ type: 'resume' })}
                    >
                      ▶ Reanudar
                    </AsyncButton>
                  ) : (
                    <AsyncButton
                      className="btn-secondary btn-sm"
                      onClick={() => hostAct({ type: 'pause' })}
                    >
                      ⏸ Pausar
                    </AsyncButton>
                  )}
                  <AsyncButton
                    className="btn-secondary btn-sm"
                    onClick={() => hostAct({ type: 'addTime', seconds: 60 })}
                  >
                    +1 min
                  </AsyncButton>
                  {meta.phaseEndsAt && (
                    <AsyncButton
                      className="btn-secondary btn-sm"
                      onClick={() => hostAct({ type: 'addTime', seconds: -60 })}
                    >
                      −1 min
                    </AsyncButton>
                  )}
                  {nextPhase && (
                    <AsyncButton
                      className="btn-primary btn-sm ml-auto"
                      onClick={() => hostAct({ type: 'nextPhase' })}
                    >
                      Siguiente fase: {nextPhase.title} →
                    </AsyncButton>
                  )}
                </>
              )}
            </div>
            {meta.spotlight && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-accent-400/30 px-4 py-3">
                <span>
                  <span aria-hidden="true">📽 </span>
                  Proyectando a <strong>{meta.spotlight.groupName}</strong>
                </span>
                <Countdown endsAt={meta.spotlight.endsAt} />
                <AsyncButton
                  className="btn-secondary btn-sm ml-auto"
                  onClick={() => hostAct({ type: 'clearSpotlight' })}
                >
                  Dejar de proyectar
                </AsyncButton>
              </div>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="min-w-0">
              {meta.status === 'lobby' ? (
                <LobbyHost code={code} payload={payload} />
              ) : (
                <game.Host key={meta.activityIndex} view={payload.view} meta={meta} />
              )}
            </div>
            <aside className="space-y-6">
              <ActivitiesPanel payload={payload} />
              <GroupsPanel payload={payload} />
              <ExportPanel code={code} token={token} payload={payload} />
            </aside>
          </div>
        </main>
      </div>
    </SessionProvider>
  );
}

function LobbyHost({ code, payload }: { code: string; payload: HostPayload }) {
  return (
    <section className="card">
      <h2 className="mb-4 text-2xl">Sala de espera</h2>
      <div className="flex flex-wrap items-center gap-6">
        <JoinQr code={code} size={180} />
        <div>
          <p className="text-slate-700">Los grupos entran en</p>
          <p className="break-all font-mono text-lg font-semibold">{joinUrl(code)}</p>
          <p className="mt-3 text-slate-700">con el código</p>
          <p className="font-mono text-5xl font-bold tracking-widest text-brand-900">{code}</p>
        </div>
      </div>
      <p className="mt-6 text-lg">
        Grupos conectados: <strong>{payload.meta.groups.length}</strong> de{' '}
        {payload.meta.expectedGroups} esperados.
      </p>
    </section>
  );
}

/** Dinámicas cargadas en la sesión: el docente elige cuál ven los grupos o suma otra. */
function ActivitiesPanel({ payload }: { payload: HostPayload }) {
  const { hostAct } = useSession();
  const { meta } = payload;
  const [adding, setAdding] = useState(false);
  const [gameId, setGameId] = useState<GameId | null>(null);
  const entry = CATALOG.find((c) => c.id === gameId) ?? null;
  const close = () => {
    setAdding(false);
    setGameId(null);
  };
  return (
    <section className="card" aria-labelledby="dinamicas-title">
      <h2 id="dinamicas-title" className="mb-1 text-xl">
        Dinámicas de esta clase
      </h2>
      <p className="mb-3 text-sm text-slate-700">
        Mismo código para todas. Al cambiar, la dinámica anterior queda en pausa y conserva sus
        respuestas.
      </p>
      <ol className="mb-3 space-y-2">
        {meta.activities.map((a) => {
          const current = a.index === meta.activityIndex;
          return (
            <li
              key={a.index}
              aria-current={current ? 'true' : undefined}
              className={cx(
                'rounded-xl border p-3',
                current ? 'border-brand-500 bg-brand-50' : 'border-slate-200',
              )}
            >
              <p className="font-bold">
                {a.index + 1}. {a.title}
              </p>
              <p className="text-sm text-slate-600">
                {a.status === 'lobby'
                  ? 'Sin iniciar'
                  : `Fase ${a.phaseIndex + 1}/${a.phaseCount}: ${a.phaseTitle}`}
              </p>
              {current ? (
                <p className="mt-1 text-sm font-semibold text-brand-800">
                  <span aria-hidden="true">● </span>En curso: la ven los grupos
                </p>
              ) : (
                <AsyncButton
                  className="btn-secondary btn-sm mt-2"
                  onClick={() => hostAct({ type: 'switchActivity', index: a.index })}
                >
                  Mostrar a los grupos
                </AsyncButton>
              )}
            </li>
          );
        })}
      </ol>
      {!adding ? (
        meta.activities.length < MAX_ACTIVITIES && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setAdding(true)}>
            + Agregar otra dinámica
          </button>
        )
      ) : (
        <div className="rounded-xl bg-slate-50 p-3">
          {!entry ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-semibold">Elijan la dinámica</p>
                <button type="button" className="btn-ghost btn-sm" onClick={close}>
                  Cancelar
                </button>
              </div>
              <GamePicker onPick={setGameId} compact />
            </>
          ) : (
            <AddActivityForm
              key={entry.id}
              entry={entry}
              onBack={() => setGameId(null)}
              onDone={close}
            />
          )}
        </div>
      )}
    </section>
  );
}

function AddActivityForm({
  entry,
  onBack,
  onDone,
}: {
  entry: CatalogEntry;
  onBack: () => void;
  onDone: () => void;
}) {
  const { hostAct } = useSession();
  const [draft, setDraft] = useActivityDraft(entry);
  return (
    <div>
      <button type="button" className="btn-ghost btn-sm mb-2" onClick={onBack}>
        ← Elegir otra
      </button>
      <h3 className="mb-3 text-lg font-bold">{entry.title}</h3>
      <ActivityFields entry={entry} draft={draft} onChange={setDraft} />
      <AsyncButton
        className="btn-primary w-full"
        onClick={async () => {
          if (await hostAct({ type: 'addActivity', ...toActivityInput(entry, draft) })) onDone();
        }}
      >
        Cargar y mostrar a los grupos
      </AsyncButton>
    </div>
  );
}

function GroupsPanel({ payload }: { payload: HostPayload }) {
  const { hostAct } = useSession();
  const [open, setOpen] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const rows = new Map(payload.groups.map((g) => [g.id, g]));
  const responded = payload.groups.filter((g) => g.responded).length;
  return (
    <section className="card" aria-labelledby="grupos-title">
      <h2 id="grupos-title" className="mb-1 text-xl">
        Grupos ({payload.meta.groups.length})
      </h2>
      {payload.meta.status === 'running' && (
        <p className="mb-3 text-sm text-slate-700">
          Respondieron en esta fase: {responded}/{payload.groups.length}
        </p>
      )}
      {!payload.meta.groups.length && (
        <p className="text-slate-600">Todavía no se unió ningún grupo.</p>
      )}
      <ul className="space-y-2">
        {payload.meta.groups.map((g) => {
          const row = rows.get(g.id);
          return (
            <li key={g.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start gap-2">
                <span
                  className={cx(
                    'mt-1 inline-block h-3 w-3 shrink-0 rounded-full',
                    g.connected ? 'bg-ok-600' : 'bg-slate-400',
                  )}
                  aria-label={g.connected ? 'Conectado' : 'Desconectado'}
                  role="img"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {g.name}
                    {g.startup && (
                      <span className="font-normal text-slate-600"> · {g.startup}</span>
                    )}
                  </p>
                  {row && (
                    <p className={cx('text-sm', row.responded ? 'text-ok-700' : 'text-slate-600')}>
                      <span aria-hidden="true">{row.responded ? '✓ ' : '… '}</span>
                      {row.status}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  aria-expanded={open === g.id}
                  onClick={() => setOpen(open === g.id ? null : g.id)}
                >
                  {open === g.id ? 'Ocultar' : 'Ver respuestas'}
                </button>
                <AsyncButton
                  className="btn-ghost btn-sm"
                  onClick={() => hostAct({ type: 'spotlight', groupId: g.id, seconds: 90 })}
                >
                  📽 Proyectar 90 s
                </AsyncButton>
                {confirmRemove === g.id ? (
                  <>
                    <AsyncButton
                      className="btn-danger btn-sm"
                      onClick={() => hostAct({ type: 'removeGroup', groupId: g.id })}
                    >
                      Confirmar quitar
                    </AsyncButton>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setConfirmRemove(null)}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost btn-sm text-danger-700"
                    onClick={() => setConfirmRemove(g.id)}
                  >
                    Quitar
                  </button>
                )}
              </div>
              {open === g.id && (
                <dl className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
                  {Object.entries(g.roles).length > 0 && (
                    <div>
                      <dt className="font-semibold">Roles</dt>
                      <dd>
                        {Object.entries(g.roles)
                          .map(([k, v]) => `${ROLE_LABELS[k as RoleId]}: ${v}`)
                          .join(' · ')}
                      </dd>
                    </div>
                  )}
                  {(row?.summary ?? []).map((it, i) => (
                    <div key={i}>
                      <dt className="font-semibold">{it.label}</dt>
                      <dd className="whitespace-pre-wrap break-words">{it.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ExportPanel({
  code,
  token,
  payload,
}: {
  code: string;
  token: string;
  payload: HostPayload;
}) {
  return (
    <section className="card">
      <h2 className="mb-2 text-xl">Exportar resultados</h2>
      <p className="mb-3 text-sm text-slate-700">
        Exporten en cualquier momento: si el servidor se reinicia, las sesiones en memoria se
        pierden. Semilla de azar: <code>{payload.seed}</code>.
      </p>
      <div className="flex flex-wrap gap-2">
        <AsyncButton
          className="btn-primary btn-sm"
          onClick={() =>
            downloadExport(code, token, 'csv').catch((e: Error) => toast(e.message, 'error'))
          }
        >
          ⬇ CSV
        </AsyncButton>
        <AsyncButton
          className="btn-secondary btn-sm"
          onClick={() =>
            downloadExport(code, token, 'json').catch((e: Error) => toast(e.message, 'error'))
          }
        >
          ⬇ JSON completo
        </AsyncButton>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => exportLocal(code, payload, 'csv')}
        >
          CSV desde este navegador
        </button>
      </div>
    </section>
  );
}
