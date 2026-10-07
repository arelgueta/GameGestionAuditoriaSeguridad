import { useParams } from 'react-router-dom';
import type { SessionMeta } from '@ciberjunta/shared';
import { SessionProvider, useSocketSession } from '../lib/session';
import { unlockAudio } from '../lib/sound';
import { Countdown } from '../components/ui';
import { ConnectionBadge, Disclaimer, JoinQr, joinUrl, SoundToggle } from '../components/chrome';
import { GAMES } from '../games';

export function ScreenPage() {
  const code = (useParams().code ?? '').toUpperCase();
  const session = useSocketSession({ role: 'screen', code, token: null });
  const { payload } = session;

  if (session.closed)
    return (
      <div className="stage flex items-center justify-center p-10 text-center">
        <p>{session.closed}</p>
      </div>
    );
  if (!payload)
    return (
      <div className="stage flex items-center justify-center p-10 text-center">
        <p>{session.error ?? 'Conectando…'}</p>
      </div>
    );

  const { meta } = payload;
  const game = GAMES[meta.gameId];
  const phase = meta.phases[meta.phaseIndex];

  return (
    <SessionProvider value={session}>
      <div className="stage" onClick={unlockAudio}>
        <header className="flex flex-wrap items-center gap-6 border-b border-stage-line px-8 py-4">
          <div className="mr-auto">
            <p className="muted text-[28px]">{meta.gameTitle}</p>
            {phase && <h1 className="text-[44px] leading-tight">{phase.title}</h1>}
          </div>
          {meta.status === 'running' && (
            <Countdown endsAt={meta.phaseEndsAt} className="text-[56px]" sound />
          )}
          <div className="text-right">
            <p className="muted text-[28px]">Código</p>
            <p className="font-mono text-[44px] font-bold tracking-widest">{code}</p>
          </div>
        </header>
        <main className="px-8 py-6">
          {meta.paused && (
            <p className="mb-6 rounded-2xl bg-accent-400 px-6 py-3 text-center font-bold text-slate-900">
              ⏸ Sesión en pausa
            </p>
          )}
          {meta.status === 'lobby' ? (
            <Lobby meta={meta} />
          ) : (
            <game.Screen key={meta.activityIndex} view={payload.view} meta={meta} />
          )}
        </main>
        <footer className="flex items-center gap-4 px-8 pb-6">
          <ConnectionBadge connected={session.connected} dark />
          <SoundToggle dark />
        </footer>
        {meta.spotlight && <Spotlight meta={meta} />}
      </div>
    </SessionProvider>
  );
}

function Lobby({ meta }: { meta: SessionMeta }) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[auto_1fr]">
      <JoinQr code={meta.code} size={360} dark />
      <div>
        <p className="muted">Entren desde el celular a</p>
        <p className="break-all font-mono text-[40px] font-bold">{joinUrl(meta.code)}</p>
        <p className="muted mt-6">Código de sesión</p>
        <p className="font-mono text-[120px] font-black leading-none tracking-[0.2em] text-accent-400">
          {meta.code}
        </p>
        <p className="mt-8">
          Grupos en la sala: <strong>{meta.groups.length}</strong> / {meta.expectedGroups}
        </p>
        <ul className="mt-4 flex flex-wrap gap-3">
          {meta.groups.map((g) => (
            <li key={g.id} className="anim-pop rounded-2xl bg-stage-panel px-5 py-2">
              {g.name}
              {g.startup && <span className="muted"> · {g.startup}</span>}
            </li>
          ))}
        </ul>
        <Disclaimer className="muted mt-10 !text-[28px]" />
      </div>
    </div>
  );
}

function Spotlight({ meta }: { meta: SessionMeta }) {
  const s = meta.spotlight!;
  return (
    <div
      className="fixed inset-0 z-40 overflow-auto bg-stage-bg/95 p-10"
      role="dialog"
      aria-label={`Presentación de ${s.groupName}`}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end gap-6">
          <div className="mr-auto">
            <p className="muted">Presenta</p>
            <h2 className="text-[64px] leading-tight">{s.groupName}</h2>
            {s.startup && <p className="muted">{s.startup}</p>}
          </div>
          <Countdown endsAt={s.endsAt} className="text-[72px]" sound />
        </div>
        <dl className="grid gap-4 md:grid-cols-2">
          {s.items.map((it, i) => (
            <div key={i} className="panel">
              <dt className="muted">{it.label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words">{it.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
