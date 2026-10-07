import { phish as P } from '@ciberjunta/shared';
import { useSession } from '../lib/session';
import {
  AsyncButton,
  Bars,
  Countdown,
  cx,
  Empty,
  SectionTitle,
  Sent,
  TextArea,
  useDraft,
} from '../components/ui';
import type { GameViewProps } from './index';

const CHANNEL_LABEL: Record<P.PhishChannel, string> = {
  sms: 'SMS',
  mail: 'Correo electrónico',
  whatsapp: 'WhatsApp',
  linkedin: 'Red profesional',
  llamada: 'Llamada telefónica',
  qr: 'Código QR',
  audio: 'Audio de mensajería',
};

const PIECE_LABEL: Record<(typeof P.CAMPAIGN_PIECES)[number], string> = {
  afiche: 'Afiche',
  sticker: 'Sticker',
  video: 'Guion de video de 30"',
};
const ACTION_LABEL: Record<(typeof P.CAMPAIGN_ACTIONS)[number], string> = {
  simulacro: 'Simulacro interno',
  boton: 'Botón "Reportar"',
  premio: 'Premio al que reporta',
  otra: 'Otra',
};

// ------------------------------------------------------------------ mockups

function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true" className="shrink-0">
      <circle cx="28" cy="28" r="28" fill={`hsl(${h} 55% 45%)`} />
      <text
        x="28"
        y="35"
        textAnchor="middle"
        fontSize="20"
        fontWeight="700"
        fill="#fff"
        fontFamily="system-ui, sans-serif"
      >
        {initials}
      </text>
    </svg>
  );
}

function FakeQr() {
  // Patrón decorativo (no es un QR real escaneable).
  const cells: [number, number][] = [];
  let seed = 7;
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      seed = (seed * 73 + 41) % 997;
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (!finder && seed % 2 === 0) cells.push([x, y]);
    }
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" fill="#111" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="#111" />
    </g>
  );
  return (
    <svg
      viewBox="-1 -1 23 23"
      className="h-36 w-36"
      role="img"
      aria-label="Código QR (ilustración)"
    >
      <rect x="-1" y="-1" width="23" height="23" fill="#fff" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#111" />
      ))}
      {finder(0, 0)}
      {finder(14, 0)}
      {finder(0, 14)}
    </svg>
  );
}

export function MessageMockup({ m, big }: { m: P.PhishMessage; big?: boolean }) {
  const body = <p className="whitespace-pre-wrap break-words">{m.body}</p>;
  const label = (
    <p
      className={cx(
        'mb-2 font-semibold uppercase tracking-wide',
        big ? 'text-stage-muted' : 'text-sm text-slate-600',
      )}
    >
      Canal: {CHANNEL_LABEL[m.channel]}
    </p>
  );
  const wrap = (inner: React.ReactNode) => (
    <figure className={cx('anim-pop text-slate-900', big ? 'text-[30px]' : 'text-base')}>
      {label}
      {inner}
    </figure>
  );
  switch (m.channel) {
    case 'sms':
      return wrap(
        <div className="mx-auto max-w-xl rounded-[2rem] border-8 border-slate-800 bg-slate-100 p-4">
          <p className="mb-3 text-center font-semibold">{m.sender}</p>
          <p className="mb-2 text-center text-[0.75em] text-slate-600">
            {m.senderDetail} · {m.time}
          </p>
          <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-white p-3 shadow">{body}</div>
        </div>,
      );
    case 'whatsapp':
    case 'audio':
      return wrap(
        <div className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-slate-300 bg-[#e9e3d8]">
          <div className="flex items-center gap-3 bg-[#1f6f5c] p-3 text-white">
            <Avatar name={m.sender} size={44} />
            <div>
              <p className="font-semibold">{m.sender}</p>
              <p className="text-[0.75em] opacity-90">{m.senderDetail}</p>
            </div>
          </div>
          <div className="p-4">
            {m.channel === 'audio' && (
              <div
                className="mb-2 flex max-w-[90%] items-center gap-3 rounded-2xl bg-white p-3 shadow"
                aria-label="Mensaje de audio"
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f6f5c] text-white"
                  aria-hidden="true"
                >
                  ▶
                </span>
                <svg viewBox="0 0 120 24" className="h-6 flex-1" aria-hidden="true">
                  {Array.from({ length: 30 }, (_, i) => (
                    <rect
                      key={i}
                      x={i * 4}
                      y={12 - ((i * 7) % 10)}
                      width="2"
                      height={2 * ((i * 7) % 10) + 2}
                      fill="#1f6f5c"
                    />
                  ))}
                </svg>
                <span className="text-[0.75em]">{m.time}</span>
              </div>
            )}
            <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white p-3 shadow">{body}</div>
          </div>
        </div>,
      );
    case 'linkedin':
      return wrap(
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-300 bg-white p-4 shadow">
          <div className="mb-3 flex items-center gap-3">
            <Avatar name={m.sender} />
            <div>
              <p className="font-semibold">{m.sender}</p>
              <p className="text-[0.75em] text-slate-600">{m.senderDetail}</p>
            </div>
          </div>
          {body}
          {m.attachment && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono">
              <span aria-hidden="true">🗜</span> {m.attachment}
            </p>
          )}
        </div>,
      );
    case 'llamada':
      return wrap(
        <div className="mx-auto max-w-2xl rounded-2xl bg-slate-900 p-5 text-white">
          <p className="mb-1 text-center text-[0.8em] uppercase tracking-widest text-slate-300">
            Llamada entrante · transcripción
          </p>
          <p className="mb-4 text-center font-semibold">{m.senderDetail}</p>
          <div className="rounded-xl bg-slate-800 p-4">{body}</div>
        </div>,
      );
    case 'qr':
      return wrap(
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-5 rounded-2xl border-4 border-amber-900/40 bg-amber-50 p-5">
          <div className="rotate-[-3deg] rounded-lg bg-white p-2 shadow-lg">
            <FakeQr />
            <p className="text-center text-[0.7em] font-bold">MENÚ DIGITAL</p>
          </div>
          <div className="min-w-[12rem] flex-1">
            <p className="font-semibold">{m.sender}</p>
            <p className="mb-2 text-[0.8em] text-slate-600">{m.senderDetail}</p>
            {body}
            {m.link && (
              <p className="mt-2 break-all rounded bg-white px-2 py-1 font-mono text-[0.8em]">
                🔗 {m.link}
              </p>
            )}
          </div>
        </div>,
      );
    default:
      return wrap(
        <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-300 bg-white shadow">
          <div className="border-b border-slate-200 bg-slate-50 p-4">
            <p>
              <span className="text-slate-600">De: </span>
              <strong>{m.sender}</strong>{' '}
              <span className="break-all text-slate-700">&lt;{m.senderDetail}&gt;</span>
            </p>
            {m.subject && (
              <p>
                <span className="text-slate-600">Asunto: </span>
                <strong>{m.subject}</strong>
              </p>
            )}
          </div>
          <div className="p-4">{body}</div>
        </div>,
      );
  }
}

function OsintCard({ o, big }: { o: P.OsintProfile; big?: boolean }) {
  return (
    <article
      className={cx(
        'overflow-hidden rounded-2xl border bg-white text-slate-900',
        big ? 'text-[28px]' : '',
      )}
    >
      <div className="h-20 bg-gradient-to-r from-brand-700 to-brand-400" aria-hidden="true" />
      <div className="px-5 pb-5">
        <div className="-mt-10 mb-2">
          <svg
            width="88"
            height="88"
            viewBox="0 0 88 88"
            aria-label={`Avatar ilustrado de ${o.name}`}
            role="img"
          >
            <circle cx="44" cy="44" r="42" fill="#fde7d4" stroke="#fff" strokeWidth="4" />
            <path
              d="M18 40c0-18 12-28 26-28s26 10 26 28c0 6-2 10-4 12-2-14-10-20-22-20S24 38 22 52c-2-2-4-6-4-12z"
              fill="#6b3f2a"
            />
            <circle cx="35" cy="46" r="3" fill="#2b2b2b" />
            <circle cx="53" cy="46" r="3" fill="#2b2b2b" />
            <path
              d="M36 58c4 4 12 4 16 0"
              stroke="#b5533c"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            <path d="M16 86c4-14 14-20 28-20s24 6 28 20" fill="#3461e0" />
          </svg>
        </div>
        <h3 className="text-[1.4em]">{o.name}</h3>
        <p className="font-semibold">{o.role}</p>
        <p className="text-slate-600">{o.location}</p>
        <p className="mt-3">{o.about}</p>
        <h4 className="mt-4 font-bold">Publicaciones recientes</h4>
        <ul className="mt-2 space-y-2">
          {o.posts.map((p, i) => (
            <li key={i} className="rounded-xl bg-slate-100 p-3">
              <p className="text-[0.8em] text-slate-600">{p.date}</p>
              <p>{p.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.8em] text-slate-600">Perfil ficticio con fines educativos.</p>
      </div>
    </article>
  );
}

export function Poster({ c, name }: { c: P.Campaign; name: string }) {
  return (
    <figure className="flex aspect-[3/4] flex-col justify-between rounded-2xl bg-gradient-to-br from-brand-900 to-brand-600 p-6 text-white shadow-lg">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-400">
        {PIECE_LABEL[c.piece]}
      </p>
      <p className="break-words text-[clamp(1.6rem,4vw,2.6rem)] font-black leading-tight">
        {c.message}
      </p>
      <figcaption className="text-sm">
        <span className="block font-semibold">Si dudás, reportá. 🛡</span>
        <span className="opacity-80">Campaña de {name}</span>
      </figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ grupo

export function Group({ view }: GameViewProps) {
  const v = view as P.PhishView;
  const me = v.me!;
  switch (v.phase) {
    case 'osint':
      return <OsintGroup v={v} />;
    case 'concurso':
      return <RoundGroup v={v} />;
    case 'campana':
      return <CampaignForm v={v} />;
    case 'galeria':
      return <Gallery v={v} />;
    default:
      return (
        <>
          <ClosingRule v={v} />
          <p className="mt-6 text-center text-lg">
            Puntaje final: <strong>{me.score}</strong> · Puesto {me.rank}
          </p>
        </>
      );
  }
}

function OsintGroup({ v }: { v: P.PhishView }) {
  const { groupAct } = useSession();
  const [notes, setNotes] = useDraft(v.me!.notes || null, '');
  return (
    <>
      <SectionTitle sub="Lean el perfil como lo haría un atacante. ¿Qué datos usarían para engañar a Lucía?">
        Mini OSINT
      </SectionTitle>
      <OsintCard o={v.osint} />
      <div className="card mt-4">
        <TextArea
          label="Datos que usaría un atacante"
          value={notes}
          onChange={setNotes}
          max={1500}
          rows={5}
          hint="Ej.: nombre de la jefa, viaje reciente…"
        />
        <AsyncButton onClick={() => groupAct({ type: 'osint', notes })} disabled={!notes.trim()}>
          Guardar notas
        </AsyncButton>
        {v.me!.notes && <Sent />}
      </div>
    </>
  );
}

function RoundGroup({ v }: { v: P.PhishView }) {
  const { groupAct } = useSession();
  const r = v.round;
  const me = v.me!;
  if (!r)
    return <Empty>Prepárense: el concurso empieza cuando el docente lance la primera ronda.</Empty>;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl">
          Ronda {r.index + 1} de {r.total}
        </h2>
        {r.stage !== 'reveal' && <Countdown endsAt={r.stageEndsAt} className="text-2xl" sound />}
      </div>
      <MessageMockup m={r.message} />
      <div className="mt-5">
        {r.stage === 'answer' &&
          (me.answer ? (
            <p className="card text-center text-lg">
              Respondieron <strong>{me.answer.choice}</strong>. Esperen a los demás grupos…
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <AsyncButton
                className="btn min-h-[96px] bg-danger-600 text-2xl text-white hover:bg-danger-700"
                onClick={() => groupAct({ type: 'answer', round: r.index, choice: 'PHISH' })}
              >
                <span aria-hidden="true">🎣</span> PHISH
              </AsyncButton>
              <AsyncButton
                className="btn min-h-[96px] bg-ok-600 text-2xl text-white hover:bg-ok-700"
                onClick={() => groupAct({ type: 'answer', round: r.index, choice: 'FISH' })}
              >
                <span aria-hidden="true">🐟</span> FISH
              </AsyncButton>
            </div>
          ))}
        {r.stage === 'signal' &&
          (!me.answer ? (
            <p className="card text-center">No respondieron a tiempo esta ronda.</p>
          ) : me.answer.signal !== null ? (
            <p className="card text-center text-lg">Señal elegida. Esperen la revelación…</p>
          ) : (
            <fieldset>
              <legend className="mb-2 text-lg font-bold">¿Cuál es la señal clave?</legend>
              <div className="grid gap-2">
                {r.signals!.map((s, i) => (
                  <AsyncButton
                    key={i}
                    className="btn-secondary justify-start text-left"
                    onClick={() => groupAct({ type: 'signal', round: r.index, signal: i })}
                  >
                    <span className="font-mono">{String.fromCharCode(65 + i)})</span> {s}
                  </AsyncButton>
                ))}
              </div>
            </fieldset>
          ))}
        {r.stage === 'reveal' && r.reveal && (
          <div
            className={cx(
              'card anim-pop border-4',
              me.lastResult?.correct ? 'border-ok-600' : 'border-danger-600',
            )}
          >
            <p className="text-2xl font-bold">
              {me.lastResult?.correct ? '✓ ¡Correcto!' : '✗ No esta vez'} Era{' '}
              <span>{r.reveal.answer}</span>
            </p>
            <p className="mt-2">
              Señal clave: <strong>{r.signals![r.reveal.correctSignal]}</strong>
              {me.lastResult?.signalCorrect && ' (¡la eligieron!)'}
            </p>
            <p className="mt-2 text-slate-700">{r.reveal.explanation}</p>
            {me.lastResult && (
              <p className="mt-3 text-lg">
                +{me.lastResult.points} puntos{' '}
                {me.lastResult.bonus > 0 && (
                  <span className="text-slate-600">
                    (incluye +{me.lastResult.bonus} por velocidad)
                  </span>
                )}
              </p>
            )}
            <p className="mt-3 text-lg">
              Total: <strong>{me.score}</strong> · Puesto {me.rank} de {v.ranking.length}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignForm({ v }: { v: P.PhishView }) {
  const { groupAct } = useSession();
  const [c, setC] = useDraft<P.Campaign>(v.me!.campaign, {
    message: '',
    piece: 'afiche',
    pieceText: '',
    action: 'boton',
    actionOther: '',
    indicator: v.campaignOptions.indicators[0],
    target: 30,
  });
  const set = <K extends keyof P.Campaign>(k: K, val: P.Campaign[K]) => setC({ ...c, [k]: val });
  return (
    <>
      <SectionTitle sub="Diseñen una campaña de concientización para su startup.">
        Campaña de concientización
      </SectionTitle>
      <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <div className="card">
          <label className="label" htmlFor="msg">
            Mensaje central (máx. 60 caracteres)
          </label>
          <input
            id="msg"
            className="input mb-1"
            maxLength={60}
            value={c.message}
            onChange={(e) => set('message', e.target.value)}
          />
          <p className="mb-4 text-right text-sm text-slate-600">{c.message.length}/60</p>
          <fieldset className="mb-4">
            <legend className="label">Pieza</legend>
            <div className="flex flex-wrap gap-2">
              {P.CAMPAIGN_PIECES.map((p) => (
                <label
                  key={p}
                  className={cx(
                    'chip cursor-pointer border-2 py-2',
                    c.piece === p ? 'border-brand-700 bg-brand-50' : 'border-slate-300',
                  )}
                >
                  <input
                    type="radio"
                    name="piece"
                    className="sr-only"
                    checked={c.piece === p}
                    onChange={() => set('piece', p)}
                  />
                  {PIECE_LABEL[p]}
                </label>
              ))}
            </div>
          </fieldset>
          <TextArea
            label={
              c.piece === 'video' ? 'Guion del video (30 segundos)' : 'Descripción de la pieza'
            }
            value={c.pieceText}
            onChange={(x) => set('pieceText', x)}
            max={1000}
            rows={3}
          />
          <fieldset className="mb-4">
            <legend className="label">Acción</legend>
            <div className="flex flex-wrap gap-2">
              {P.CAMPAIGN_ACTIONS.map((a) => (
                <label
                  key={a}
                  className={cx(
                    'chip cursor-pointer border-2 py-2',
                    c.action === a ? 'border-brand-700 bg-brand-50' : 'border-slate-300',
                  )}
                >
                  <input
                    type="radio"
                    name="action"
                    className="sr-only"
                    checked={c.action === a}
                    onChange={() => set('action', a)}
                  />
                  {ACTION_LABEL[a]}
                </label>
              ))}
            </div>
            {c.action === 'otra' && (
              <input
                className="input mt-2"
                maxLength={200}
                placeholder="¿Cuál?"
                value={c.actionOther}
                onChange={(e) => set('actionOther', e.target.value)}
              />
            )}
          </fieldset>
          <label className="label" htmlFor="ind">
            Indicador de éxito
          </label>
          <select
            id="ind"
            className="input mb-3"
            value={c.indicator}
            onChange={(e) => set('indicator', e.target.value)}
          >
            {v.campaignOptions.indicators.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
          <label className="label" htmlFor="meta">
            Meta numérica
          </label>
          <input
            id="meta"
            className="input mb-4 max-w-[10rem]"
            type="number"
            min={0}
            value={c.target}
            onChange={(e) => set('target', Number(e.target.value))}
          />
          <AsyncButton
            onClick={() => groupAct({ type: 'campaign', campaign: c })}
            disabled={c.message.trim().length < 3}
          >
            Enviar campaña
          </AsyncButton>
          {v.me!.campaign && <Sent />}
        </div>
        <div>
          <p className="label">Vista previa</p>
          <Poster c={c.message ? c : { ...c, message: 'Su mensaje acá' }} name="su grupo" />
        </div>
      </div>
    </>
  );
}

function Gallery({ v }: { v: P.PhishView }) {
  const { groupAct, payload } = useSession();
  const myId = payload?.role === 'group' ? payload.me.id : null;
  if (!v.gallery?.length) return <Empty>No hay campañas para mostrar.</Empty>;
  return (
    <>
      <SectionTitle sub="Voten la mejor campaña (no pueden votarse a sí mismos).">
        Galería de campañas
      </SectionTitle>
      <ul className="grid gap-4 sm:grid-cols-2">
        {v.gallery.map((g) => (
          <li key={g.groupId}>
            <Poster c={g.campaign} name={g.name} />
            {g.groupId === myId ? (
              <p className="mt-2 text-center text-slate-600">Su campaña</p>
            ) : (
              <AsyncButton
                className={cx(
                  'mt-2 w-full',
                  v.me!.vote === g.groupId ? 'btn-primary' : 'btn-secondary',
                )}
                onClick={() => groupAct({ type: 'vote', target: g.groupId })}
              >
                {v.me!.vote === g.groupId ? '★ Su voto' : 'Votar'}
              </AsyncButton>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function ClosingRule({ v }: { v: P.PhishView }) {
  const { groupAct } = useSession();
  const [rule, setRule] = useDraft(v.me!.rule || null, '');
  return (
    <>
      {v.closing && (
        <p className="card mb-4 border-l-8 border-accent-500 text-xl font-semibold">
          {v.closing.message}
        </p>
      )}
      <div className="card">
        <TextArea
          label="Regla de oro para la Política de Seguridad Aceptable"
          value={rule}
          onChange={setRule}
          max={200}
          rows={2}
        />
        <AsyncButton
          onClick={() => groupAct({ type: 'rule', rule })}
          disabled={rule.trim().length < 3}
        >
          Enviar regla
        </AsyncButton>
        {v.me!.rule && <Sent />}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ docente

export function Host({ view }: GameViewProps) {
  const v = view as P.PhishView;
  const { gameAct } = useSession();
  const r = v.round;
  return (
    <div className="space-y-6">
      {v.phase === 'osint' && (
        <section className="card">
          <h2 className="mb-3 text-xl">Notas OSINT de los grupos</h2>
          {v.host!.osintNotes.length ? (
            <ul className="space-y-2">
              {v.host!.osintNotes.map((n) => (
                <li key={n.name} className="rounded-xl bg-slate-50 p-3">
                  <strong>{n.name}:</strong> <span className="whitespace-pre-wrap">{n.notes}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Todavía no hay notas.</Empty>
          )}
        </section>
      )}
      {v.phase === 'concurso' && (
        <section className="card">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-xl">
              {r ? `Ronda ${r.index + 1} de ${r.total}` : 'Concurso'}
            </h2>
            {r && r.stage !== 'reveal' && (
              <>
                <span className="chip bg-slate-200">
                  {r.stage === 'answer' ? 'Eligiendo PHISH/FISH' : 'Eligiendo señal'}
                </span>
                <Countdown endsAt={r.stageEndsAt} className="text-xl" />
                <AsyncButton
                  className="btn-secondary btn-sm"
                  onClick={() => gameAct({ type: 'skipStage' })}
                >
                  Cerrar etapa ahora
                </AsyncButton>
              </>
            )}
            {(!r || r.stage === 'reveal') && (!r || r.index + 1 < r.total) && (
              <AsyncButton onClick={() => gameAct({ type: 'nextRound' })}>
                ▶ Lanzar ronda {r ? r.index + 2 : 1}
              </AsyncButton>
            )}
            {r && r.stage === 'reveal' && r.index + 1 >= r.total && (
              <span className="chip bg-ok-100 text-ok-700">Concurso terminado</span>
            )}
          </div>
          {r && (
            <>
              <MessageMockup m={r.message} />
              <p className="mt-3">
                Respondieron {r.answeredCount}/{v.ranking.length} · Señal elegida por{' '}
                {r.signaledCount}
              </p>
              {r.reveal && (
                <p className="mt-2 rounded-xl bg-ok-100 p-3">
                  Respuesta: <strong>{r.reveal.answer}</strong> · Señal:{' '}
                  <strong>{r.signals![r.reveal.correctSignal]}</strong>
                </p>
              )}
              <table className="mt-3 w-full text-left">
                <thead>
                  <tr className="border-b">
                    <th className="py-1">Grupo</th>
                    <th>Respuesta</th>
                    <th>Señal</th>
                  </tr>
                </thead>
                <tbody>
                  {v.host!.answers.map((a) => (
                    <tr key={a.groupId} className="border-b border-slate-100">
                      <td className="py-1">{a.name}</td>
                      <td>{a.choice ?? '—'}</td>
                      <td>
                        {a.signal !== null && r.signals ? String.fromCharCode(65 + a.signal) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}
      {v.phase === 'campana' && (
        <section className="card">
          <h2 className="text-xl">
            Campañas enviadas: {v.campaignsSubmitted}/{v.ranking.length}
          </h2>
          <p className="mt-2 text-slate-700">
            Usen “Ver respuestas” en la lista de grupos para leer cada campaña.
          </p>
        </section>
      )}
      {(v.phase === 'galeria' || v.phase === 'cierre') && v.gallery && (
        <section className="card">
          <h2 className="mb-3 text-xl">Galería</h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {v.gallery.map((g) => (
              <li key={g.groupId}>
                <Poster c={g.campaign} name={g.name} />
                {g.votes !== null && <p className="mt-1 text-center font-bold">{g.votes} votos</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <Ranking v={v} />
    </div>
  );
}

function Ranking({ v, dark }: { v: P.PhishView; dark?: boolean }) {
  return (
    <section className={dark ? 'panel' : 'card'}>
      <h2 className="mb-3 text-[1.2em]">Ranking</h2>
      <ol className="space-y-1">
        {v.ranking.map((r, i) => (
          <li key={r.groupId} className="flex justify-between gap-3">
            <span>
              {i + 1}. {r.name}
            </span>
            <strong className="tabular-nums">{r.score}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ------------------------------------------------------------------ pantalla

export function Screen({ view }: GameViewProps) {
  const v = view as P.PhishView;
  const r = v.round;
  if (v.phase === 'osint')
    return (
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <OsintCard o={v.osint} big />
        <div className="panel">
          <h2 className="mb-4 text-[44px]">Mini OSINT</h2>
          <p>Lean el perfil como lo haría un atacante.</p>
          <p className="mt-4">¿Qué datos usarían para engañar a esta persona?</p>
          <p className="muted mt-4">Anótenlo en su dispositivo.</p>
        </div>
      </div>
    );
  if (v.phase === 'concurso') {
    if (!r)
      return (
        <div className="text-center">
          <p className="text-[64px] font-black">🎣 PHISH or FISH 🐟</p>
          <p className="muted mt-4">12 rondas · 25 s para decidir · 15 s para la señal clave</p>
        </div>
      );
    return (
      <div className="grid gap-8 xl:grid-cols-[3fr_2fr]">
        <div>
          <p className="muted mb-2">
            Ronda {r.index + 1} de {r.total}
          </p>
          <MessageMockup m={r.message} big />
        </div>
        <div className="space-y-6">
          {r.stage !== 'reveal' ? (
            <div className="panel text-center">
              <p className="muted">
                {r.stage === 'answer' ? '¿PHISH o FISH?' : '¿Cuál es la señal clave?'}
              </p>
              <Countdown endsAt={r.stageEndsAt} className="text-[96px]" sound />
              <p>
                {r.stage === 'answer' ? r.answeredCount : r.signaledCount} / {v.ranking.length}{' '}
                grupos respondieron
              </p>
              {r.signals && (
                <ol className="mt-4 space-y-2 text-left">
                  {r.signals.map((s, i) => (
                    <li key={i}>
                      <span className="font-mono">{String.fromCharCode(65 + i)})</span> {s}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            r.reveal && (
              <div className="panel anim-pop">
                <p
                  className={cx(
                    'text-[72px] font-black',
                    r.reveal.answer === 'PHISH' ? 'text-danger-100' : 'text-ok-100',
                  )}
                >
                  {r.reveal.answer === 'PHISH' ? '🎣 PHISH' : '🐟 FISH'}
                </p>
                <Bars
                  dark
                  data={[
                    {
                      label: '🎣 PHISH',
                      value: r.reveal.counts.PHISH,
                      tone: r.reveal.answer === 'PHISH' ? 'ok' : 'danger',
                    },
                    {
                      label: '🐟 FISH',
                      value: r.reveal.counts.FISH,
                      tone: r.reveal.answer === 'FISH' ? 'ok' : 'danger',
                    },
                    { label: 'Sin respuesta', value: r.reveal.counts.none, tone: 'warn' },
                  ]}
                />
                <p className="mt-6 font-bold">Señal clave: {r.signals![r.reveal.correctSignal]}</p>
                <p className="muted mt-2">{r.reveal.explanation}</p>
                <div className="mt-4">
                  <Bars
                    dark
                    data={r.signals!.map((s, i) => ({
                      label: `${i === r.reveal!.correctSignal ? '✓' : '✗'} ${String.fromCharCode(65 + i)}) ${s}`,
                      value: r.reveal!.signalCounts[i],
                      tone: i === r.reveal!.correctSignal ? 'ok' : 'brand',
                    }))}
                  />
                </div>
              </div>
            )
          )}
          {r.stage === 'reveal' && <Ranking v={{ ...v, ranking: v.ranking.slice(0, 5) }} dark />}
        </div>
      </div>
    );
  }
  if (v.phase === 'campana')
    return (
      <div className="panel text-center">
        <h2 className="text-[56px]">Diseñen su campaña de concientización</h2>
        <p className="mt-4">
          Mensaje central de 60 caracteres · pieza · acción · indicador de éxito
        </p>
        <p className="mt-8 text-[64px] font-black">
          {v.campaignsSubmitted} / {v.ranking.length}
        </p>
        <p className="muted">campañas enviadas</p>
      </div>
    );
  return (
    <div className="space-y-8">
      {v.closing && (
        <p className="panel border-l-[12px] border-accent-500 text-[40px] font-bold">
          {v.closing.message}
        </p>
      )}
      {v.gallery && (
        <ul className="grid gap-6 md:grid-cols-3 xl:grid-cols-4">
          {v.gallery.map((g) => (
            <li key={g.groupId}>
              <Poster c={g.campaign} name={g.name} />
              {g.votes !== null && <p className="mt-2 text-center font-bold">★ {g.votes}</p>}
            </li>
          ))}
        </ul>
      )}
      {v.closing && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="panel">
            <h2 className="mb-3">Reglas de oro</h2>
            <ul className="space-y-3">
              {v.closing.rules.map((r) => (
                <li key={r.name}>
                  <strong>{r.name}:</strong> “{r.rule}”
                </li>
              ))}
            </ul>
          </section>
          <Ranking v={v} dark />
        </div>
      )}
    </div>
  );
}
