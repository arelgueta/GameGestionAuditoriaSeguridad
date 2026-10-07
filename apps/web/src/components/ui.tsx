import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { countWords } from '@ciberjunta/shared';
import { useNow, useSession } from '../lib/session';
import { play } from '../lib/sound';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Cuenta regresiva basada en el reloj del servidor. */
export function Countdown({
  endsAt,
  className,
  sound = false,
  label = 'Tiempo restante',
  warnAt = 10_000,
}: {
  endsAt: number | null | undefined;
  className?: string;
  sound?: boolean;
  label?: string;
  warnAt?: number;
}) {
  useNow(250);
  const { gameNow, payload } = useSession();
  const lastTick = useRef<number | null>(null);
  const remaining = endsAt ? endsAt - gameNow() : null;
  const sec = remaining !== null ? Math.ceil(remaining / 1000) : null;
  useEffect(() => {
    if (!sound || sec === null || payload?.meta.paused) return;
    if (sec > 0 && sec <= 10 && lastTick.current !== sec) {
      lastTick.current = sec;
      play('tick');
    }
  }, [sec, sound, payload?.meta.paused]);
  if (remaining === null) return null;
  const urgent = remaining <= warnAt;
  return (
    <span
      className={cx('font-mono font-bold tabular-nums', urgent && 'text-danger-600', className)}
      role="timer"
      aria-label={`${label}: ${formatClock(remaining)}`}
    >
      <span aria-hidden="true">⏱ </span>
      {formatClock(remaining)}
      {payload?.meta.paused && <span className="ml-2 text-[0.7em]">(pausa)</span>}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="mb-4">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-sm text-slate-600">{hint}</p>}
    </div>
  );
}

/** Área de texto con contador visible de caracteres o palabras. */
export function TextArea({
  label,
  value,
  onChange,
  max,
  maxWords,
  rows = 4,
  hint,
  placeholder,
  disabled,
  minChars,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  maxWords?: number;
  rows?: number;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  minChars?: number;
}) {
  const id = useId();
  const words = countWords(value);
  const over = maxWords ? words > maxWords : false;
  return (
    <div className="mb-4">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className={cx('input', over && 'border-danger-600')}
        rows={rows}
        maxLength={max}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-count`}
      />
      <div
        id={`${id}-count`}
        className="mt-1 flex flex-wrap justify-between gap-2 text-sm text-slate-600"
      >
        <span>{hint}</span>
        <span className={cx(over && 'font-bold text-danger-600')}>
          {maxWords ? `${words}/${maxWords} palabras · ` : ''}
          {value.length}/{max} caracteres
          {minChars ? ` (mínimo ${minChars})` : ''}
        </span>
      </div>
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  max,
  placeholder,
  hint,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input
        id={id}
        className="input"
        value={value}
        maxLength={max}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/** Puntos con signo e ícono (no depende solo del color). */
export function Points({ value, className }: { value: number; className?: string }) {
  const pos = value > 0;
  const neg = value < 0;
  return (
    <span
      className={cx(
        'chip',
        pos && 'bg-ok-100 text-ok-700',
        neg && 'bg-danger-100 text-danger-700',
        !pos && !neg && 'bg-slate-200 text-slate-800',
        className,
      )}
    >
      <span aria-hidden="true">{pos ? '▲' : neg ? '▼' : '●'}</span>
      {pos ? `+${value}` : value}
    </span>
  );
}

export function Meter({ value, max = 150, label }: { value: number; max?: number; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tone = value >= 90 ? 'bg-ok-600' : value >= 60 ? 'bg-accent-500' : 'bg-danger-600';
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-semibold">{label}</span>
        <span className="text-3xl font-bold tabular-nums">{value}</span>
      </div>
      <div
        className="h-5 overflow-hidden rounded-full bg-slate-200"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
      >
        <div
          className={cx('h-full transition-all duration-700', tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Barras horizontales simples, con valor escrito. */
export function Bars({
  data,
  dark,
  format = (n) => String(n),
}: {
  data: { label: string; value: number; tone?: 'ok' | 'warn' | 'danger' | 'brand' }[];
  dark?: boolean;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const tones = {
    ok: 'bg-ok-600',
    warn: 'bg-accent-500',
    danger: 'bg-danger-600',
    brand: 'bg-brand-500',
  };
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex justify-between gap-3">
            <span>{d.label}</span>
            <strong className="tabular-nums">{format(d.value)}</strong>
          </div>
          <div
            className={cx(
              'h-4 overflow-hidden rounded-full',
              dark ? 'bg-stage-line' : 'bg-slate-200',
            )}
          >
            <div
              className={cx(
                'h-full rounded-full transition-all duration-700',
                tones[d.tone ?? 'brand'],
              )}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border-2 border-dashed border-slate-300 p-6 text-center text-slate-600">
      {children}
    </p>
  );
}

export function Sent({
  children = 'Enviado. Pueden modificarlo hasta que cierre la fase.',
}: {
  children?: ReactNode;
}) {
  return (
    <p className="mt-2 rounded-lg bg-ok-100 px-3 py-2 font-semibold text-ok-700" role="status">
      <span aria-hidden="true">✓ </span>
      {children}
    </p>
  );
}

/** Botón que deshabilita mientras espera la respuesta del servidor. */
export function AsyncButton({
  onClick,
  children,
  className = 'btn-primary',
  disabled,
  type = 'button',
}: {
  onClick: () => Promise<unknown> | void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type={type}
      className={className}
      disabled={disabled || busy}
      aria-busy={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-2xl">{children}</h2>
      {sub && <p className="mt-1 text-slate-700">{sub}</p>}
    </div>
  );
}

/** Mantiene un borrador local que se reinicia cuando cambia el valor del servidor. */
export function useDraft<T>(server: T | null | undefined, fallback: T): [T, (v: T) => void] {
  const [draft, setDraft] = useState<T>(server ?? fallback);
  const serverKey = JSON.stringify(server ?? null);
  const last = useRef(serverKey);
  useEffect(() => {
    if (last.current !== serverKey) {
      last.current = serverKey;
      if (server) setDraft(server);
    }
  }, [serverKey, server]);
  return [draft, setDraft];
}
