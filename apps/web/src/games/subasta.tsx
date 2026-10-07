import { useState } from 'react';
import { subasta as S } from '@ciberjunta/shared';
import { useSession } from '../lib/session';
import {
  AsyncButton,
  Bars,
  Countdown,
  cx,
  Empty,
  Points,
  SectionTitle,
  Sent,
  TextArea,
  useDraft,
} from '../components/ui';
import type { GameViewProps } from './index';

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [25, 25],
    [50, 50],
    [75, 75],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [25, 25],
    [75, 25],
    [50, 50],
    [25, 75],
    [75, 75],
  ],
  6: [
    [28, 22],
    [72, 22],
    [28, 50],
    [72, 50],
    [28, 78],
    [72, 78],
  ],
};

export function Die({
  value,
  affected,
  size = 64,
  animate = true,
}: {
  value: number;
  affected: boolean;
  size?: number;
  animate?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cx(animate && 'anim-roll')}
      role="img"
      aria-label={`Dado: ${value}${affected ? ', los afecta' : ', se salvan'}`}
    >
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="18"
        fill={affected ? '#b91c1c' : '#f8fafc'}
        stroke="#0f172a"
        strokeWidth="4"
      />
      {PIPS[value]?.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="9" fill={affected ? '#fff' : '#0f172a'} />
      ))}
    </svg>
  );
}

function controlName(v: S.SubastaView, id: string) {
  return v.controls.find((c) => c.id === id)?.name ?? id;
}

// ------------------------------------------------------------------ grupo

export function Group({ view }: GameViewProps) {
  const v = view as S.SubastaView;
  const me = v.me!;
  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg">
          <span aria-hidden="true">🪙 </span>Cibercoins:{' '}
          <strong className="text-3xl tabular-nums">{me.coins}</strong>
        </p>
        {v.phase !== 'matriz' && v.phase !== 'subasta' && (
          <p className="text-lg">
            Puntaje: <strong className="text-3xl tabular-nums">{me.score}</strong>
          </p>
        )}
      </div>
      {v.phase === 'matriz' && <MatrixForm v={v} />}
      {v.phase === 'subasta' && <AuctionGroup v={v} />}
      {(v.phase === 'incidentes' || v.phase === 'cierre') && <IncidentsGroup v={v} />}
      {v.phase === 'cierre' && <Reflection v={v} />}
      <section className="card">
        <h2 className="mb-2 text-xl">Sus controles</h2>
        {me.controls.length ? (
          <ul className="flex flex-wrap gap-2">
            {me.controls.map((c) => (
              <li key={c} className="chip bg-ok-100 text-ok-700">
                🛡 {controlName(v, c)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-600">Todavía no compraron controles.</p>
        )}
      </section>
    </div>
  );
}

const QUADRANTS: { prob: 'alta' | 'baja'; impact: 'alta' | 'baja'; label: string; tone: string }[] =
  [
    { prob: 'alta', impact: 'baja', label: 'Prob. alta · Impacto bajo', tone: 'bg-warn-100' },
    { prob: 'alta', impact: 'alta', label: 'Prob. alta · Impacto alto', tone: 'bg-danger-100' },
    { prob: 'baja', impact: 'baja', label: 'Prob. baja · Impacto bajo', tone: 'bg-ok-100' },
    { prob: 'baja', impact: 'alta', label: 'Prob. baja · Impacto alto', tone: 'bg-warn-100' },
  ];

function MatrixForm({ v }: { v: S.SubastaView }) {
  const { groupAct } = useSession();
  const [threats, setThreats] = useDraft<S.Threat[]>(
    v.me!.threats.length ? v.me!.threats : null,
    [],
  );
  const [text, setText] = useState('');
  const [drag, setDrag] = useState<number | null>(null);
  const update = (i: number, t: Partial<S.Threat>) =>
    setThreats(threats.map((x, j) => (j === i ? { ...x, ...t } : x)));
  return (
    <section className="card">
      <SectionTitle sub="Carguen 5 amenazas para su startup y ubíquenlas en la matriz (arrastrando o con los botones).">
        Matriz de riesgos
      </SectionTitle>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || threats.length >= 5) return;
          setThreats([...threats, { text: text.trim(), prob: 'alta', impact: 'alta' }]);
          setText('');
        }}
      >
        <input
          className="input"
          maxLength={120}
          placeholder="Ej.: Ransomware que cifra todo"
          aria-label="Nueva amenaza"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-secondary" type="submit" disabled={threats.length >= 5}>
          Agregar
        </button>
      </form>
      <p className="mb-3 text-sm text-slate-600">{threats.length}/5 amenazas</p>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
        <span />
        <span className="text-center text-sm font-bold">Impacto bajo</span>
        <span className="text-center text-sm font-bold">Impacto alto</span>
        {(['alta', 'baja'] as const).map((prob) => (
          <div key={prob} className="contents">
            <span className="self-center text-sm font-bold [writing-mode:vertical-rl] rotate-180">
              Prob. {prob}
            </span>
            {(['baja', 'alta'] as const).map((impact) => {
              const q = QUADRANTS.find((x) => x.prob === prob && x.impact === impact)!;
              return (
                <ul
                  key={impact}
                  aria-label={q.label}
                  className={cx('min-h-[110px] space-y-2 rounded-xl p-2', q.tone)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drag !== null && update(drag, { prob, impact })}
                >
                  {threats.map((t, i) =>
                    t.prob === prob && t.impact === impact ? (
                      <li
                        key={i}
                        draggable
                        onDragStart={() => setDrag(i)}
                        className="cursor-grab rounded-lg bg-white p-2 text-sm shadow"
                      >
                        <p className="font-semibold">{t.text}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="rounded border px-2 text-xs"
                            onClick={() => update(i, { prob: prob === 'alta' ? 'baja' : 'alta' })}
                          >
                            Prob. {prob === 'alta' ? '↓ baja' : '↑ alta'}
                          </button>
                          <button
                            type="button"
                            className="rounded border px-2 text-xs"
                            onClick={() =>
                              update(i, { impact: impact === 'alta' ? 'baja' : 'alta' })
                            }
                          >
                            Impacto {impact === 'alta' ? '↓ bajo' : '↑ alto'}
                          </button>
                          <button
                            type="button"
                            className="rounded border px-2 text-xs text-danger-700"
                            aria-label={`Eliminar ${t.text}`}
                            onClick={() => setThreats(threats.filter((_, j) => j !== i))}
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    ) : null,
                  )}
                </ul>
              );
            })}
          </div>
        ))}
      </div>
      <AsyncButton
        className="btn-primary mt-4"
        onClick={() => groupAct({ type: 'matrix', threats })}
        disabled={!threats.length}
      >
        Guardar matriz
      </AsyncButton>
      {v.me!.threats.length > 0 && <Sent />}
    </section>
  );
}

function AuctionGroup({ v }: { v: S.SubastaView }) {
  const { groupAct } = useSession();
  const me = v.me!;
  const lot = v.lot;
  const [amount, setAmount] = useState<number | ''>('');
  if (!lot || lot.status !== 'open')
    return (
      <>
        <Empty>Esperen a que el docente abra el próximo lote.</Empty>
        <ControlsTable v={v} />
      </>
    );
  const value = amount === '' ? (me.minBid ?? lot.basePrice) : amount;
  return (
    <section className="card border-4 border-accent-500">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl">{lot.name}</h2>
        <Countdown endsAt={lot.endsAt} className="text-3xl" sound />
      </div>
      <p className="mb-3 text-slate-700">
        {lot.units} unidades · precio base {lot.basePrice} ·{' '}
        {v.controls.find((c) => c.id === lot.controlId)?.protects}
      </p>
      {me.myBid !== null && (
        <p
          className={cx(
            'mb-3 rounded-xl p-3 font-semibold',
            me.winning ? 'bg-ok-100 text-ok-700' : 'bg-warn-100 text-warn-700',
          )}
        >
          {me.winning ? '✓ Por ahora ganan una unidad' : '⚠ Los superaron'} con {me.myBid}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label>
          <span className="label">Su oferta (mínimo {me.minBid})</span>
          <input
            className="input max-w-[9rem] text-2xl"
            type="number"
            inputMode="numeric"
            min={me.minBid ?? lot.basePrice}
            max={me.coins}
            value={value}
            onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </label>
        {[1, 5, 10].map((d) => (
          <button
            key={d}
            type="button"
            className="btn-secondary btn-sm"
            onClick={() =>
              setAmount(Math.min(me.coins, Math.max(me.minBid ?? 0, Number(value) + d)))
            }
          >
            +{d}
          </button>
        ))}
        <AsyncButton
          disabled={value > me.coins || value < (me.minBid ?? 0)}
          onClick={async () => {
            if (await groupAct({ type: 'bid', lot: lot.controlId, amount: Number(value) }))
              setAmount('');
          }}
        >
          Ofertar {value}
        </AsyncButton>
      </div>
      <h3 className="mb-1 mt-4 font-bold">Ofertas</h3>
      <ol className="space-y-1">
        {lot.bids.map((b, i) => (
          <li
            key={b.groupId}
            className={cx('flex justify-between rounded px-2', i < lot.units && 'bg-ok-100')}
          >
            <span>
              {i < lot.units ? '🏆 ' : ''}
              {b.name}
            </span>
            <strong className="tabular-nums">{b.amount}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ControlsTable({ v, dark }: { v: S.SubastaView; dark?: boolean }) {
  return (
    <section className={dark ? 'panel' : 'card'}>
      <h2 className="mb-2 text-[1.2em]">Controles</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="py-1">Control</th>
              <th>Unid.</th>
              <th>Base</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {v.controls.map((c) => (
              <tr
                key={c.id}
                className={cx(
                  'border-b align-top',
                  dark ? 'border-stage-line' : 'border-slate-100',
                )}
              >
                <td className="py-1 pr-2">
                  <strong>{c.name}</strong>
                  <span className={cx('block text-[0.8em]', dark ? 'muted' : 'text-slate-600')}>
                    {c.protects}
                  </span>
                </td>
                <td>{c.units}</td>
                <td>{c.basePrice}</td>
                <td className="text-[0.85em]">
                  {c.status === 'vendido'
                    ? c.winners.length
                      ? c.winners.map((w) => `${w.name} (${w.amount})`).join(', ')
                      : 'Sin ofertas'
                    : c.status === 'abierto'
                      ? '🔨 En subasta'
                      : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IncidentsGroup({ v }: { v: S.SubastaView }) {
  const { payload } = useSession();
  const myId = payload?.role === 'group' ? payload.me.id : '';
  if (!v.revealed.length) return <Empty>Todavía no ocurrió ningún incidente… por ahora.</Empty>;
  return (
    <section className="space-y-3">
      {[...v.revealed].reverse().map((inc, idx) => {
        const r = inc.results.find((x) => x.groupId === myId);
        if (!r) return null;
        return (
          <article
            key={inc.id}
            className={cx('card flex items-center gap-4', idx === 0 && 'anim-pop')}
          >
            <Die value={r.roll} affected={r.affected} animate={idx === 0} />
            <div className="flex-1">
              <h3 className="text-lg">{inc.name}</h3>
              <p className="text-slate-700">{r.notes.join(' · ')}</p>
            </div>
            <div className="text-right">
              <Points value={-r.damage} />
              {r.bonus > 0 && <Points value={r.bonus} className="ml-1" />}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function Reflection({ v }: { v: S.SubastaView }) {
  const { groupAct } = useSession();
  const [text, setText] = useDraft(v.me!.reflection || null, '');
  return (
    <section className="card">
      <TextArea
        label="¿Qué comprarían distinto?"
        value={text}
        onChange={setText}
        max={500}
        rows={4}
      />
      <AsyncButton onClick={() => groupAct({ type: 'reflection', text })} disabled={!text.trim()}>
        Enviar reflexión
      </AsyncButton>
      {v.me!.reflection && <Sent />}
    </section>
  );
}

// ------------------------------------------------------------------ docente

export function Host({ view }: GameViewProps) {
  const v = view as S.SubastaView;
  const { gameAct } = useSession();
  const [pick, setPick] = useState('');
  return (
    <div className="space-y-6">
      {v.phase === 'matriz' && (
        <section className="card">
          <h2 className="text-xl">Los grupos arman su matriz de riesgos.</h2>
          <p className="mt-2 text-slate-700">Pueden ver cada matriz en “Ver respuestas”.</p>
        </section>
      )}
      {v.phase === 'subasta' && (
        <section className="card">
          <h2 className="mb-3 text-xl">Subasta</h2>
          {v.lot?.status === 'open' ? (
            <div className="mb-4 rounded-xl bg-accent-400/20 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <strong className="mr-auto text-lg">🔨 {v.lot.name}</strong>
                <Countdown endsAt={v.lot.endsAt} className="text-xl" />
                <AsyncButton
                  className="btn-secondary btn-sm"
                  onClick={() => gameAct({ type: 'closeLot' })}
                >
                  Cerrar lote ya
                </AsyncButton>
              </div>
              <ol className="mt-2">
                {v.lot.bids.map((b, i) => (
                  <li key={b.groupId}>
                    {i < v.lot!.units ? '🏆 ' : ''}
                    {b.name}: <strong>{b.amount}</strong>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="mb-3 text-slate-700">Elijan el próximo control a subastar:</p>
          )}
          <div className="flex flex-wrap gap-2">
            {v.controls
              .filter((c) => c.status === 'pendiente')
              .map((c) => (
                <AsyncButton
                  key={c.id}
                  className="btn-secondary btn-sm"
                  disabled={v.lot?.status === 'open'}
                  onClick={() => gameAct({ type: 'openLot', controlId: c.id })}
                >
                  Abrir: {c.name}
                </AsyncButton>
              ))}
          </div>
        </section>
      )}
      {v.phase === 'incidentes' && (
        <section className="card">
          <h2 className="mb-3 text-xl">
            Incidentes revelados: {v.revealed.length}/{v.maxIncidents}
          </h2>
          {v.revealed.length < v.maxIncidents && (
            <div className="flex flex-wrap items-end gap-2">
              <AsyncButton onClick={() => gameAct({ type: 'revealIncident' })}>
                🎲 Revelar incidente al azar
              </AsyncButton>
              <select
                className="input max-w-xs"
                aria-label="Elegir incidente"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
              >
                <option value="">… o elegir uno</option>
                {v.unrevealed?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <AsyncButton
                className="btn-secondary"
                disabled={!pick}
                onClick={async () => {
                  await gameAct({ type: 'revealIncident', incidentId: pick });
                  setPick('');
                }}
              >
                Revelar elegido
              </AsyncButton>
            </div>
          )}
          <IncidentsBoard v={v} />
        </section>
      )}
      {v.phase === 'cierre' && v.debrief && <DebriefBoard v={v} />}
      {v.phase !== 'matriz' && <ControlsTable v={v} />}
      <Standings v={v} />
    </div>
  );
}

function IncidentsBoard({
  v,
  dark,
  onlyLast,
}: {
  v: S.SubastaView;
  dark?: boolean;
  onlyLast?: boolean;
}) {
  const list = onlyLast ? v.revealed.slice(-1) : [...v.revealed].reverse();
  return (
    <div className="mt-4 space-y-4">
      {list.map((inc, idx) => (
        <article
          key={inc.id}
          className={cx(
            dark ? 'panel' : 'rounded-xl border border-slate-200 p-3',
            idx === 0 && 'anim-pop',
          )}
        >
          <h3 className="text-[1.15em]">
            {inc.name} <Points value={-inc.damage} />
          </h3>
          <p className={cx('mb-3 text-[0.85em]', dark ? 'muted' : 'text-slate-600')}>
            {inc.nullifiedBy ? `Lo anula: ${inc.nullifiedBy}` : 'Ningún control lo anula'}
            {inc.halvedBy ? ` · Lo reduce a la mitad: ${inc.halvedBy}` : ''}
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {inc.results.map((r) => (
              <li key={r.groupId} className="flex items-center gap-2">
                <Die
                  value={r.roll}
                  affected={r.affected}
                  size={dark ? 72 : 44}
                  animate={idx === 0}
                />
                <span>
                  <span className="block font-semibold">{r.name}</span>
                  <span className="text-[0.85em]">
                    {r.affected ? `−${r.damage}${r.bonus ? ` · +${r.bonus}` : ''}` : 'se salvó'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function Standings({ v, dark }: { v: S.SubastaView; dark?: boolean }) {
  return (
    <section className={dark ? 'panel' : 'card'}>
      <h2 className="mb-2 text-[1.2em]">Tabla</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="py-1">Grupo</th>
              <th>Coins</th>
              <th>Controles</th>
              <th>Daño</th>
              <th>Bonus</th>
              <th>Puntaje</th>
            </tr>
          </thead>
          <tbody>
            {v.standings.map((s) => (
              <tr
                key={s.groupId}
                className={cx('border-b', dark ? 'border-stage-line' : 'border-slate-100')}
              >
                <td className="py-1 font-semibold">{s.name}</td>
                <td className="tabular-nums">{s.coins}</td>
                <td className="text-[0.8em]">
                  {s.controls.map((c) => controlName(v, c)).join(', ') || '—'}
                </td>
                <td className="tabular-nums">{s.damage ? `−${s.damage}` : 0}</td>
                <td className="tabular-nums">{s.bonus ? `+${s.bonus}` : 0}</td>
                <td className="font-black tabular-nums">{s.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DebriefBoard({ v, dark }: { v: S.SubastaView; dark?: boolean }) {
  const d = v.debrief!;
  const panel = dark ? 'panel' : 'card';
  return (
    <div className="space-y-6">
      <section className={panel}>
        <h2 className="mb-3 text-[1.3em]">Ranking final</h2>
        <Bars
          dark={dark}
          data={v.standings.map((s) => ({
            label: s.name,
            value: Math.max(0, s.score),
            tone: 'brand',
          }))}
        />
      </section>
      {d.lucky && (
        <section className={cx(panel, 'border-4 border-accent-500')}>
          <h2 className="text-[1.3em]">🍀 El grupo con suerte: {d.lucky.name}</h2>
          <p className="mt-2">
            Compró {d.lucky.controls} controles y los dados lo salvaron {d.lucky.dodged} veces sin
            estar protegido.
          </p>
          <p className={cx('mt-2', dark ? 'muted' : 'text-slate-700')}>
            ¿Fue una buena estrategia o tuvieron suerte? El sesgo “a nosotros no nos va a pasar” se
            alimenta de casos así.
          </p>
        </section>
      )}
      <section className={panel}>
        <h2 className="mb-3 text-[1.3em]">Las 4 respuestas al riesgo</h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {d.riskResponses.map((r) => (
            <li key={r.id} className={cx('rounded-2xl p-4', dark ? 'bg-stage-bg' : 'bg-slate-50')}>
              <h3 className="text-[1.1em]">{r.title}</h3>
              <p>{r.text}</p>
              {r.controls.length > 0 && (
                <p className={cx('mt-2 text-[0.85em]', dark ? 'muted' : 'text-slate-600')}>
                  Controles: {r.controls.join(', ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
      {d.reflections.length > 0 && (
        <section className={panel}>
          <h2 className="mb-3 text-[1.3em]">¿Qué comprarían distinto?</h2>
          <ul className="space-y-2">
            {d.reflections.map((r) => (
              <li key={r.name}>
                <strong>{r.name}:</strong> {r.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ pantalla

export function Screen({ view }: GameViewProps) {
  const v = view as S.SubastaView;
  if (v.phase === 'matriz')
    return (
      <div className="panel">
        <h2 className="mb-4 text-[56px]">Matriz de riesgos</h2>
        <div className="grid max-w-4xl grid-cols-2 gap-4 text-center">
          <div className="rounded-2xl bg-warn-600/40 p-8">Prob. alta · Impacto bajo</div>
          <div className="rounded-2xl bg-danger-600/50 p-8 font-bold">
            Prob. alta · Impacto alto
          </div>
          <div className="rounded-2xl bg-ok-600/40 p-8">Prob. baja · Impacto bajo</div>
          <div className="rounded-2xl bg-warn-600/40 p-8">Prob. baja · Impacto alto</div>
        </div>
        <p className="muted mt-6">
          Carguen 5 amenazas para su startup y ubíquenlas. Cada grupo tendrá {v.coinsStart}{' '}
          cibercoins.
        </p>
      </div>
    );
  if (v.phase === 'subasta')
    return (
      <div className="grid gap-8 xl:grid-cols-[3fr_2fr]">
        {v.lot ? (
          <section className={cx('panel', v.lot.status === 'open' && 'border-4 border-accent-500')}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="muted">
                  {v.lot.status === 'open' ? '🔨 En subasta' : 'Lote cerrado'}
                </p>
                <h2 className="text-[56px] leading-tight">{v.lot.name}</h2>
                <p className="muted">
                  {v.lot.units} unidades · base {v.lot.basePrice}
                </p>
              </div>
              {v.lot.status === 'open' && (
                <Countdown endsAt={v.lot.endsAt} className="text-[96px]" sound />
              )}
            </div>
            <ol className="mt-6 space-y-2">
              {v.lot.bids.map((b, i) => (
                <li
                  key={b.groupId}
                  className={cx(
                    'anim-fade flex justify-between rounded-xl px-4 py-2',
                    i < v.lot!.units ? 'bg-ok-700' : 'bg-stage-bg',
                  )}
                >
                  <span>
                    {i < v.lot!.units ? '🏆 ' : ''}
                    {b.name}
                  </span>
                  <strong className="tabular-nums">{b.amount}</strong>
                </li>
              ))}
              {!v.lot.bids.length && <li className="muted">Sin ofertas todavía…</li>}
            </ol>
          </section>
        ) : (
          <section className="panel text-center">
            <h2 className="text-[56px]">La subasta está por empezar</h2>
            <p className="muted mt-4">Cada grupo tiene {v.coinsStart} cibercoins.</p>
          </section>
        )}
        <ControlsTable v={v} dark />
      </div>
    );
  if (v.phase === 'incidentes')
    return (
      <div className="space-y-6">
        {v.revealed.length ? (
          <IncidentsBoard v={v} dark onlyLast />
        ) : (
          <section className="panel text-center">
            <h2 className="text-[56px]">🎲 Llegan los incidentes</h2>
            <p className="mt-4">Dado 1–3: el incidente los afecta · 4–6: se salvan</p>
          </section>
        )}
        <p className="muted">
          Incidente {v.revealed.length} de {v.maxIncidents}
        </p>
        <Standings v={v} dark />
      </div>
    );
  return (
    <div className="space-y-6">
      {v.debrief && <DebriefBoard v={v} dark />}
      <Standings v={v} dark />
    </div>
  );
}
