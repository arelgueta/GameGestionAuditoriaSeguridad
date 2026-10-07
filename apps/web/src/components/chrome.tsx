import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { SessionMeta } from '@ciberjunta/shared';
import { isMuted, onMutedChange, setMuted, unlockAudio } from '../lib/sound';
import { dismiss, subscribe, type Toast } from '../lib/toast';
import { cx } from './ui';

export function SoundToggle({ dark }: { dark?: boolean }) {
  const [m, setM] = useState(isMuted());
  useEffect(() => onMutedChange(setM), []);
  return (
    <button
      type="button"
      className={cx('btn-sm btn', dark ? 'text-stage-text hover:bg-stage-panel' : 'btn-ghost')}
      aria-pressed={!m}
      onClick={() => {
        setMuted(!m);
        unlockAudio();
      }}
    >
      <span aria-hidden="true">{m ? '🔇' : '🔔'}</span>
      {m ? 'Sonido apagado' : 'Sonido encendido'}
    </button>
  );
}

export function ConnectionBadge({ connected, dark }: { connected: boolean; dark?: boolean }) {
  return (
    <span
      className={cx(
        'chip',
        connected
          ? dark
            ? 'bg-ok-700 text-white'
            : 'bg-ok-100 text-ok-700'
          : 'bg-danger-100 text-danger-700',
      )}
      role="status"
    >
      <span aria-hidden="true">{connected ? '●' : '○'}</span>
      {connected ? 'Conectado' : 'Reconectando…'}
    </span>
  );
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => subscribe(setItems), []);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={cx(
            'anim-fade pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl px-4 py-3 font-semibold shadow-lg',
            t.kind === 'error'
              ? 'bg-danger-600 text-white'
              : t.kind === 'success'
                ? 'bg-ok-600 text-white'
                : 'bg-slate-900 text-white',
          )}
        >
          <span aria-hidden="true">
            {t.kind === 'error' ? '⚠' : t.kind === 'success' ? '✓' : 'ℹ'}
          </span>
          <span className="flex-1">{t.text}</span>
          <button
            type="button"
            className="font-bold"
            aria-label="Cerrar aviso"
            onClick={() => dismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function joinUrl(code: string) {
  return `${window.location.origin}/unirse?c=${code}`;
}

export function JoinQr({
  code,
  size = 220,
  dark,
}: {
  code: string;
  size?: number;
  dark?: boolean;
}) {
  return (
    <div
      className={cx(
        'inline-block rounded-2xl p-3',
        dark ? 'bg-white' : 'border border-slate-200 bg-white',
      )}
    >
      <QRCodeSVG
        value={joinUrl(code)}
        size={size}
        level="M"
        title={`Código QR para unirse a la sesión ${code}`}
      />
    </div>
  );
}

export function PhaseSteps({ meta, dark }: { meta: SessionMeta; dark?: boolean }) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Fases de la dinámica">
      {meta.phases.map((p, i) => {
        const state = i < meta.phaseIndex ? 'done' : i === meta.phaseIndex ? 'current' : 'next';
        return (
          <li
            key={p.id}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cx(
              'chip',
              state === 'current' && 'bg-accent-400 text-slate-900',
              state === 'done' &&
                (dark ? 'bg-stage-line text-stage-muted' : 'bg-slate-200 text-slate-600'),
              state === 'next' &&
                (dark
                  ? 'border border-stage-line text-stage-muted'
                  : 'border border-slate-300 text-slate-700'),
            )}
          >
            <span aria-hidden="true">{state === 'done' ? '✓' : `${i + 1}.`}</span> {p.title}
          </li>
        );
      })}
    </ol>
  );
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cx('text-sm', className)}>
      <span aria-hidden="true">⚖ </span>
      Casos y marcas ficticias con fines educativos. Verificar normativa vigente.
    </p>
  );
}
