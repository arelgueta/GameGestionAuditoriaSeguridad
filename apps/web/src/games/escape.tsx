import { useState } from 'react';
import { escape as E } from '@ciberjunta/shared';
import { useNow, useSession } from '../lib/session';
import {
  AsyncButton,
  Countdown,
  cx,
  formatClock,
  SectionTitle,
  Sent,
  TextArea,
  useDraft,
} from '../components/ui';
import type { GameViewProps } from './index';

// ------------------------------------------------------------------ ilustración

type ZoneId =
  | 'monitor'
  | 'pendrive'
  | 'organigrama'
  | 'factura'
  | 'accesos'
  | 'drive'
  | 'calendario'
  | 'contrato';

/** Área clicable de cada zona dentro del viewBox 0 0 800 480. */
const HIT: Record<ZoneId, { x: number; y: number; w: number; h: number }> = {
  pendrive: { x: 30, y: 40, w: 200, h: 160 },
  organigrama: { x: 255, y: 40, w: 150, h: 135 },
  calendario: { x: 425, y: 40, w: 120, h: 135 },
  accesos: { x: 570, y: 50, w: 90, h: 130 },
  monitor: { x: 175, y: 185, w: 180, h: 125 },
  drive: { x: 370, y: 225, w: 140, h: 85 },
  factura: { x: 515, y: 270, w: 110, h: 45 },
  contrato: { x: 670, y: 205, w: 115, h: 260 },
};

interface ZoneLook {
  solved?: boolean;
  locked?: boolean;
  heat?: number;
  label: string;
}

export function OfficeSvg({
  zones,
  onSelect,
  selected,
}: {
  zones: Partial<Record<ZoneId, ZoneLook>>;
  onSelect?: (id: ZoneId) => void;
  selected?: string | null;
}) {
  return (
    <svg
      viewBox="0 0 800 480"
      className="h-auto w-full rounded-2xl"
      role="group"
      aria-label="Oficina comprometida"
    >
      {/* pared y piso */}
      <rect width="800" height="330" fill="#e8edf5" />
      <rect y="330" width="800" height="150" fill="#c9b79c" />
      <rect y="326" width="800" height="8" fill="#a8957a" />
      {/* ventana con estacionamiento */}
      <rect
        x="35"
        y="45"
        width="190"
        height="150"
        fill="#9fc6e8"
        stroke="#56677f"
        strokeWidth="6"
      />
      <rect x="38" y="140" width="184" height="52" fill="#6f7b8a" />
      <rect x="60" y="150" width="40" height="22" rx="5" fill="#d14d4d" />
      <rect x="150" y="152" width="44" height="22" rx="5" fill="#3f73c9" />
      <line x1="130" y1="45" x2="130" y2="195" stroke="#56677f" strokeWidth="4" />
      <g transform="translate(112 176) rotate(-12)">
        <rect width="24" height="10" rx="2" fill="#f2c94c" stroke="#333" strokeWidth="1.5" />
        <rect x="24" y="2" width="7" height="6" fill="#bbb" stroke="#333" strokeWidth="1" />
      </g>
      {/* organigrama */}
      <rect x="260" y="45" width="140" height="125" fill="#fff" stroke="#8792a5" strokeWidth="3" />
      <text x="330" y="63" textAnchor="middle" fontSize="11" fontWeight="700" fill="#334">
        ORGANIGRAMA
      </text>
      <rect x="310" y="72" width="40" height="18" fill="#c7d6f6" />
      {[275, 315, 355].map((x) => (
        <rect key={x} x={x} y="110" width="32" height="16" fill="#dfe7f7" />
      ))}
      {[275, 315, 355].map((x) => (
        <rect key={x} x={x} y="138" width="32" height="16" fill="#eef2fa" />
      ))}
      <path
        d="M330 90v10M291 100h80M291 100v10M331 100v10M371 100v10"
        stroke="#8792a5"
        strokeWidth="2"
        fill="none"
      />
      {/* calendario */}
      <rect x="430" y="45" width="110" height="125" fill="#fff" stroke="#8792a5" strokeWidth="3" />
      <rect x="430" y="45" width="110" height="24" fill="#d14d4d" />
      <text x="485" y="62" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
        BACKUPS
      </text>
      {Array.from({ length: 12 }, (_, i) => (
        <text
          key={i}
          x={445 + (i % 4) * 26}
          y={88 + Math.floor(i / 4) * 22}
          fontSize="12"
          fill="#2e8b57"
        >
          ✔
        </text>
      ))}
      <text x="485" y="160" textAnchor="middle" fontSize="9" fill="#b91c1c" fontWeight="700">
        PRUEBA: NUNCA
      </text>
      {/* clipboard de accesos */}
      <rect x="578" y="58" width="76" height="115" rx="6" fill="#a87b4f" />
      <rect x="586" y="72" width="60" height="94" fill="#fff" />
      <rect x="602" y="52" width="28" height="12" rx="3" fill="#777" />
      {[84, 98, 112, 126, 140, 154].map((y, i) => (
        <rect
          key={y}
          x="592"
          y={y}
          width={i === 3 ? 48 : 40}
          height="5"
          fill={i === 3 ? '#d14d4d' : '#9aa5b8'}
        />
      ))}
      {/* escritorio */}
      <rect x="140" y="305" width="510" height="18" fill="#7a5a3a" />
      <rect x="160" y="323" width="14" height="120" fill="#5f4630" />
      <rect x="616" y="323" width="14" height="120" fill="#5f4630" />
      {/* monitor con post-it */}
      <rect x="185" y="195" width="160" height="100" rx="6" fill="#1f2937" />
      <rect x="193" y="203" width="144" height="80" fill="#3b82f6" />
      <rect x="252" y="295" width="26" height="10" fill="#374151" />
      <g transform="rotate(8 320 215)">
        <rect x="300" y="198" width="38" height="34" fill="#fde047" stroke="#b59f12" />
        <path d="M305 210h26M305 218h22M305 225h18" stroke="#6b5d0d" strokeWidth="2" />
      </g>
      {/* notebook con carpeta compartida */}
      <path d="M380 300h120l12 8H368z" fill="#9ca3af" />
      <rect x="385" y="232" width="110" height="68" rx="4" fill="#111827" />
      <rect x="391" y="238" width="98" height="56" fill="#f8fafc" />
      <path d="M400 252h22l5 5h30v24h-57z" fill="#fbbf24" />
      <text x="467" y="270" fontSize="16" aria-hidden="true">
        🌐
      </text>
      {/* factura */}
      <g transform="rotate(-6 570 292)">
        <rect x="525" y="275" width="90" height="30" fill="#fff" stroke="#999" />
        <text x="531" y="289" fontSize="9" fill="#b91c1c" fontWeight="700">
          URGENTE
        </text>
        <path d="M531 296h50" stroke="#333" strokeWidth="1.5" />
        <path d="M531 293l50 6" stroke="#b91c1c" strokeWidth="1.5" />
      </g>
      {/* archivero con contrato */}
      <rect
        x="680"
        y="215"
        width="95"
        height="240"
        fill="#9aa5b8"
        stroke="#6b7486"
        strokeWidth="3"
      />
      {[225, 300, 375].map((y) => (
        <g key={y}>
          <rect x="688" y={y} width="79" height="65" fill="#b6bfcf" />
          <rect x="713" y={y + 28} width="30" height="7" rx="3" fill="#6b7486" />
        </g>
      ))}
      <rect
        x="700"
        y="208"
        width="58"
        height="34"
        fill="#fff"
        stroke="#888"
        transform="rotate(-8 729 225)"
      />
      <text
        x="704"
        y="225"
        fontSize="8"
        fontWeight="700"
        fill="#333"
        transform="rotate(-8 729 225)"
      >
        CONTRATO
      </text>

      {/* zonas interactivas */}
      {(Object.keys(HIT) as ZoneId[]).map((id) => {
        const z = zones[id];
        if (!z) return null;
        const h = HIT[id];
        const heatFill =
          z.heat !== undefined
            ? `rgba(185, 28, 28, ${Math.min(0.75, 0.1 + z.heat * 0.12)})`
            : 'transparent';
        const interactive = !!onSelect;
        return (
          <g
            key={id}
            className={cx(interactive && 'group cursor-pointer outline-none')}
            role={interactive ? 'button' : 'img'}
            tabIndex={interactive ? 0 : undefined}
            aria-label={`${z.label}${z.solved ? ' (resuelta)' : z.locked ? ' (bloqueada por penalidad)' : ''}${z.heat !== undefined ? `: ${z.heat} errores` : ''}`}
            aria-pressed={interactive ? selected === id : undefined}
            onClick={() => onSelect?.(id)}
            onKeyDown={(e) => {
              if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSelect(id);
              }
            }}
          >
            <rect
              x={h.x}
              y={h.y}
              width={h.w}
              height={h.h}
              rx="10"
              fill={heatFill}
              stroke={selected === id ? '#f59e0b' : z.solved ? '#15803d' : 'transparent'}
              strokeWidth="5"
              strokeDasharray={z.solved ? '0' : '10 6'}
              className={cx(
                interactive && 'group-hover:stroke-amber-500 group-focus-visible:stroke-amber-500',
              )}
            />
            {z.solved && (
              <g>
                <circle cx={h.x + h.w - 14} cy={h.y + 14} r="14" fill="#15803d" />
                <path
                  d={`M${h.x + h.w - 21} ${h.y + 14}l5 5 9-10`}
                  stroke="#fff"
                  strokeWidth="3.5"
                  fill="none"
                />
              </g>
            )}
            {z.locked && !z.solved && (
              <g>
                <circle cx={h.x + h.w - 14} cy={h.y + 14} r="14" fill="#b45309" />
                <text x={h.x + h.w - 14} y={h.y + 19} textAnchor="middle" fontSize="15" fill="#fff">
                  ⏳
                </text>
              </g>
            )}
            {z.heat !== undefined && (
              <text
                x={h.x + h.w / 2}
                y={h.y + h.h / 2 + 10}
                textAnchor="middle"
                fontSize="30"
                fontWeight="900"
                fill="#fff"
                stroke="#000"
                strokeWidth="1"
              >
                {z.heat}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Padlock({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 100 120"
      width="90"
      height="108"
      role="img"
      aria-label={open ? 'Candado abierto' : 'Candado cerrado'}
    >
      <path
        d="M28 55V35a22 22 0 0 1 44 0v20"
        fill="none"
        stroke="#475569"
        strokeWidth="10"
        className={cx(open && 'anim-unlock')}
      />
      <rect x="15" y="52" width="70" height="58" rx="10" fill={open ? '#15803d' : '#f59e0b'} />
      <circle cx="50" cy="76" r="7" fill="#1f2937" />
      <rect x="47" y="78" width="6" height="16" fill="#1f2937" />
    </svg>
  );
}

// ------------------------------------------------------------------ grupo

export function Group({ view }: GameViewProps) {
  const v = view as E.EscapeView;
  const { groupAct, gameNow } = useSession();
  useNow(500);
  const me = v.me!;
  const [selected, setSelected] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<number[]>([]);
  const [shake, setShake] = useState(0);

  if (v.phase === 'debrief') return <DebriefBoard v={v} />;

  const zoneMap = Object.fromEntries(
    me.zones.map((z) => [
      z.id,
      {
        solved: z.solved,
        locked: !!z.lockedUntil && z.lockedUntil > gameNow(),
        label: v.zones.find((x) => x.id === z.id)!.object,
      },
    ]),
  );
  const sel = selected ? v.zones.find((z) => z.id === selected) : null;
  const selMe = selected ? me.zones.find((z) => z.id === selected) : null;
  const escaped = me.escapedAt !== null;
  const timeUp = v.endsAt !== null && gameNow() > v.endsAt;
  const word = attempt.map((i) => me.letters[i]).join('');

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg">
          Letras: <strong>{me.letters.length}/8</strong>
        </p>
        {!escaped && (
          <Countdown endsAt={v.endsAt} className="text-2xl" sound label="Tiempo para escapar" />
        )}
        {escaped && v.startedAt !== null && (
          <p className="chip bg-ok-100 text-ok-700">
            ¡Escaparon en {formatClock(me.escapedAt! - v.startedAt)}!
          </p>
        )}
      </div>

      {!escaped && (
        <>
          <p className="text-slate-700">
            Toquen cada zona de la oficina, encuentren la falla y elijan el control correcto.
          </p>
          <OfficeSvg zones={zoneMap} onSelect={(id) => setSelected(id)} selected={selected} />
          {sel && selMe && (
            <section className="card anim-pop" aria-live="polite">
              <h2 className="text-xl">{sel.object}</h2>
              <p className="mb-3 mt-1">{sel.scene}</p>
              {selMe.solved ? (
                <p className="rounded-xl bg-ok-100 p-3 text-ok-700">
                  ✓ Resuelto: <strong>{selMe.correct}</strong>. Falla: {selMe.flaw}. Letra obtenida:{' '}
                  <strong className="text-2xl">{selMe.letter}</strong>
                </p>
              ) : selMe.lockedUntil && selMe.lockedUntil > gameNow() ? (
                <p className="rounded-xl bg-warn-100 p-3 font-semibold text-warn-700">
                  ⏳ Penalidad: esperen <Countdown endsAt={selMe.lockedUntil} label="Penalidad" />{' '}
                  para reintentar.
                </p>
              ) : (
                <fieldset disabled={timeUp}>
                  <legend className="mb-2 font-bold">¿Qué control corresponde?</legend>
                  <div className="grid gap-2">
                    {sel.options.map((o, i) => (
                      <AsyncButton
                        key={i}
                        className="btn-secondary justify-start text-left"
                        onClick={() => groupAct({ type: 'answer', zone: sel.id, option: i })}
                      >
                        {o}
                      </AsyncButton>
                    ))}
                  </div>
                  {selMe.errors > 0 && (
                    <p className="mt-2 text-sm text-slate-600">
                      Errores en esta zona: {selMe.errors}
                    </p>
                  )}
                </fieldset>
              )}
            </section>
          )}
        </>
      )}

      <section className={cx('card text-center', shake > 0 && 'anim-shake')} key={shake}>
        <Padlock open={escaped} />
        {escaped ? (
          <p className="text-xl font-bold text-ok-700">¡Candado abierto!</p>
        ) : me.letters.length < 8 ? (
          <p className="text-slate-700">Consigan las 8 letras para intentar abrir el candado.</p>
        ) : (
          <>
            <p className="mb-2 font-semibold">Ordenen las letras para formar la palabra clave:</p>
            <div
              className="mb-3 flex flex-wrap justify-center gap-2"
              aria-label="Letras disponibles"
            >
              {me.letters.map((l, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={attempt.includes(i)}
                  className="h-12 w-12 rounded-lg border-2 border-brand-700 text-2xl font-black disabled:opacity-30"
                  onClick={() => setAttempt([...attempt, i])}
                >
                  {l}
                </button>
              ))}
            </div>
            <p
              className="mb-3 min-h-[3rem] font-mono text-4xl font-black tracking-[0.3em]"
              aria-live="polite"
            >
              {word.padEnd(8, '_')}
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setAttempt(attempt.slice(0, -1))}
              >
                ← Borrar
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setAttempt([])}>
                Limpiar
              </button>
              <AsyncButton
                className="btn-primary btn-sm"
                disabled={attempt.length !== 8 || timeUp}
                onClick={async () => {
                  if (!(await groupAct({ type: 'unlock', word }))) {
                    setShake((x) => x + 1);
                    setAttempt([]);
                  }
                }}
              >
                🔓 Probar candado
              </AsyncButton>
            </div>
          </>
        )}
      </section>

      {escaped && <FinalChallenge v={v} />}
    </div>
  );
}

function FinalChallenge({ v }: { v: E.EscapeView }) {
  const { groupAct } = useSession();
  const [text, setText] = useDraft(v.me!.final || null, '');
  return (
    <section className="card border-4 border-accent-500">
      <SectionTitle>Desafío final</SectionTitle>
      <TextArea label={v.finalQuestion} value={text} onChange={setText} max={300} rows={3} />
      <AsyncButton
        onClick={() => groupAct({ type: 'final', text })}
        disabled={text.trim().length < 3}
      >
        Enviar respuesta
      </AsyncButton>
      {v.me!.final && <Sent />}
    </section>
  );
}

// ------------------------------------------------------------------ ranking y debriefing

function Ranking({ v, dark }: { v: E.EscapeView; dark?: boolean }) {
  return (
    <section className={dark ? 'panel' : 'card'}>
      <h2 className="mb-3 text-[1.2em]">Ranking de escape</h2>
      <ol className="space-y-2">
        {v.ranking.map((r, i) => (
          <li key={r.groupId}>
            <div className="flex justify-between gap-3">
              <span>
                {i + 1}. {r.escapedMs !== null ? '🔓' : '🔒'} {r.name}
              </span>
              <span className="tabular-nums">
                {r.escapedMs !== null ? formatClock(r.escapedMs) : `${r.letters}/8 letras`}
              </span>
            </div>
            <div
              className={cx(
                'mt-1 h-2 overflow-hidden rounded-full',
                dark ? 'bg-stage-line' : 'bg-slate-200',
              )}
            >
              <div
                className={cx('h-full', r.escapedMs !== null ? 'bg-ok-600' : 'bg-brand-500')}
                style={{ width: `${(r.letters / 8) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const CATEGORY_LABEL: Record<E.EscapeCategory, string> = {
  personas: 'Personas',
  procesos: 'Procesos',
  tecnologia: 'Tecnología',
};

function DebriefBoard({ v, dark }: { v: E.EscapeView; dark?: boolean }) {
  const d = v.debrief;
  if (!d) return null;
  const panel = dark ? 'panel' : 'card';
  const heatZones = Object.fromEntries(
    d.heat.map((h) => [h.id, { heat: h.errors, label: h.object }]),
  );
  const nonTech = d.heat.filter((h) => h.category !== 'tecnologia').length;
  return (
    <div className="space-y-6">
      <section className={panel}>
        <h2 className="mb-3 text-[1.3em]">Mapa de calor: ¿dónde se equivocaron más?</h2>
        <OfficeSvg zones={heatZones} />
      </section>
      <section className={panel}>
        <h2 className="mb-3 text-[1.3em]">Las 8 fallas: personas, procesos y tecnología</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {(['personas', 'procesos', 'tecnologia'] as const).map((cat, ci) => (
            <div key={cat} className={cx('rounded-2xl p-4', dark ? 'bg-stage-bg' : 'bg-slate-50')}>
              <h3 className="mb-2 text-[1.1em]">
                {CATEGORY_LABEL[cat]} ({d.heat.filter((h) => h.category === cat).length})
              </h3>
              <ul className="space-y-2">
                {d.heat
                  .filter((h) => h.category === cat)
                  .map((h, i) => (
                    <li
                      key={h.id}
                      className="anim-fade"
                      style={{ animationDelay: `${(ci * 3 + i) * 150}ms` }}
                    >
                      <strong>{h.object}</strong>
                      <span
                        className={cx('block text-[0.85em]', dark ? 'muted' : 'text-slate-600')}
                      >
                        {h.flaw} → {h.correct}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-2xl bg-accent-400 p-4 font-bold text-slate-900">
          {nonTech} de las 8 fallas no se resuelven comprando tecnología: son personas y procesos.
        </p>
      </section>
      {d.finals.length > 0 && (
        <section className={panel}>
          <h2 className="mb-3 text-[1.3em]">¿Cuál es la falla más urgente?</h2>
          <ul className="space-y-2">
            {d.finals.map((f) => (
              <li key={f.name}>
                <strong>{f.name}:</strong> {f.text}
              </li>
            ))}
          </ul>
        </section>
      )}
      <Ranking v={v} dark={dark} />
    </div>
  );
}

// ------------------------------------------------------------------ docente y pantalla

export function Host({ view }: GameViewProps) {
  const v = view as E.EscapeView;
  if (v.phase === 'debrief') return <DebriefBoard v={v} />;
  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="mb-2 text-xl">Escape en curso</h2>
        <p className="text-slate-700">
          Los grupos recorren la oficina. Cada error bloquea la zona unos segundos. Palabra final:{' '}
          <strong>VERIFICA</strong> (no la digan 😉).
        </p>
      </section>
      <Ranking v={v} />
    </div>
  );
}

export function Screen({ view }: GameViewProps) {
  const v = view as E.EscapeView;
  if (v.phase === 'debrief') return <DebriefBoard v={v} dark />;
  const zones = Object.fromEntries(v.zones.map((z) => [z.id, { label: z.object }]));
  return (
    <div className="grid gap-8 xl:grid-cols-[3fr_2fr]">
      <div className="panel">
        <OfficeSvg zones={zones} />
        <p className="muted mt-4">
          8 fallas · 8 letras · 1 candado. Cada error bloquea esa zona unos segundos.
        </p>
      </div>
      <Ranking v={v} dark />
    </div>
  );
}
