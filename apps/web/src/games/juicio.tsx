import { useState } from 'react';
import { juicio as J } from '@ciberjunta/shared';
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

function teamLabel(v: J.JuicioView, t: J.JuicioTeam | null) {
  return t ? (v.teams.find((x) => x.id === t)?.label ?? t) : 'Sin equipo';
}

function CaseFile({ v, dark }: { v: J.JuicioView; dark?: boolean }) {
  const [tab, setTab] = useState(0);
  return (
    <section className={dark ? 'panel' : 'card'}>
      <p
        className={cx(
          'text-[0.8em] font-semibold uppercase tracking-widest',
          dark ? 'muted' : 'text-slate-600',
        )}
      >
        Expediente digital
      </p>
      <h2 className="mb-3 text-[1.2em]">{v.caseFile.title}</h2>
      <div
        role="tablist"
        aria-label="Secciones del expediente"
        className="mb-3 flex flex-wrap gap-1"
      >
        {v.caseFile.tabs.map((t, i) => (
          <button
            key={t.title}
            role="tab"
            type="button"
            aria-selected={tab === i}
            className={cx(
              'rounded-t-lg border-b-4 px-3 py-2 font-semibold',
              tab === i ? 'border-accent-500' : 'border-transparent opacity-80',
            )}
            onClick={() => setTab(i)}
          >
            {t.title}
          </button>
        ))}
      </div>
      <p role="tabpanel">{v.caseFile.tabs[tab].body}</p>
    </section>
  );
}

function Evidence({ v, dark }: { v: J.JuicioView; dark?: boolean }) {
  return (
    <section>
      <h2 className="mb-3 text-[1.2em]">Pruebas</h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {v.evidence.map((e, i) => (
          <li
            key={e.id}
            className={cx(
              dark ? 'panel' : 'card',
              e.surprise && 'anim-pop border-4 border-accent-500',
            )}
          >
            <p className={cx('text-[0.8em] font-semibold', dark ? 'muted' : 'text-slate-600')}>
              Prueba {i + 1} {e.surprise && '· ⚡ SORPRESA'}
            </p>
            <h3 className="text-[1.05em]">{e.title}</h3>
            <p>{e.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Newspaper({ headline, trial }: { headline: string; trial?: number }) {
  return (
    <figure className="rounded-md border-4 border-double border-slate-800 bg-[#f6f1e4] p-5 font-serif text-slate-900 shadow">
      <p className="border-b-2 border-slate-800 pb-1 text-center text-[0.75em] font-bold uppercase tracking-[0.3em]">
        El Diario de la Junta {trial ? `· Juicio ${trial}` : ''}
      </p>
      <p className="mt-3 text-center text-[1.4em] font-black leading-tight">{headline}</p>
    </figure>
  );
}

// ------------------------------------------------------------------ grupo

export function Group({ view }: GameViewProps) {
  const v = view as J.JuicioView;
  const me = v.me!;
  return (
    <div className="space-y-5">
      <section className="card border-l-8 border-brand-700">
        <p className="text-sm font-semibold uppercase text-slate-600">
          Su equipo{v.parallel ? ` · Juicio ${me.trial}` : ''}
        </p>
        <p className="text-2xl font-bold">{teamLabel(v, me.team)}</p>
        {me.team && <p className="mt-1">{v.teams.find((t) => t.id === me.team)?.mission}</p>}
        {!me.team && <p className="text-slate-700">El docente les va a asignar un equipo.</p>}
      </section>
      {v.speaker && (
        <section className="card flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white">
          <span>
            🎤 {v.speaker.label}: <strong>{teamLabel(v, v.speaker.team)}</strong>
          </span>
          <Countdown endsAt={v.speaker.endsAt} className="text-2xl" label="Tiempo del orador" />
        </section>
      )}
      {v.phase === 'cierre' ? (
        <Closing v={v} />
      ) : (
        <>
          <CaseFile v={v} />
          <Evidence v={v} />
          <Alegato v={v} />
          {(v.phase === 'alegatos' || v.phase === 'preguntas') && me.team && <Questions v={v} />}
          {v.phase === 'veredicto' && me.team === 'jurado' && <Vote v={v} />}
          {v.phase === 'veredicto' && me.team === 'jurado' && <Headline v={v} />}
        </>
      )}
      <QuestionQueue v={v} />
    </div>
  );
}

function Alegato({ v }: { v: J.JuicioView }) {
  const { groupAct } = useSession();
  const [text, setText] = useDraft(v.me!.alegato || null, '');
  return (
    <section className="card">
      <TextArea
        label="Alegato escrito (borrador para la exposición oral)"
        value={text}
        onChange={setText}
        max={1500}
        rows={6}
      />
      <AsyncButton disabled={!text.trim()} onClick={() => groupAct({ type: 'alegato', text })}>
        Guardar alegato
      </AsyncButton>
      {v.me!.alegato && <Sent>Guardado.</Sent>}
    </section>
  );
}

function Questions({ v }: { v: J.JuicioView }) {
  const { groupAct } = useSession();
  const me = v.me!;
  const others = v.teams.filter((t) => t.id !== me.team);
  const [to, setTo] = useState<J.JuicioTeam>(others[0].id);
  const [text, setText] = useState('');
  const left = 2 - me.questionsSent;
  return (
    <section className="card">
      <h2 className="mb-2 text-xl">Preguntas cruzadas ({left} disponibles)</h2>
      {left > 0 ? (
        <>
          <label className="label" htmlFor="q-to">
            Dirigida a
          </label>
          <select
            id="q-to"
            className="input mb-3"
            value={to}
            onChange={(e) => setTo(e.target.value as J.JuicioTeam)}
          >
            {others.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <TextArea label="Pregunta" value={text} onChange={setText} max={300} rows={2} />
          <AsyncButton
            disabled={text.trim().length < 3}
            onClick={async () => {
              if (await groupAct({ type: 'question', to, text })) setText('');
            }}
          >
            Enviar pregunta
          </AsyncButton>
        </>
      ) : (
        <p className="text-slate-700">Ya enviaron sus 2 preguntas.</p>
      )}
    </section>
  );
}

function QuestionQueue({ v, dark }: { v: J.JuicioView; dark?: boolean }) {
  const { gameAct, payload } = useSession();
  const isHost = payload?.role === 'host';
  if (!v.questions.length) return null;
  return (
    <section className={dark ? 'panel' : 'card'}>
      <h2 className="mb-3 text-[1.2em]">Cola de preguntas</h2>
      <ol className="space-y-2">
        {v.questions.map((q) => (
          <li
            key={q.id}
            className={cx(
              'rounded-xl p-3',
              q.status === 'en_pantalla' ? 'border-2 border-accent-500' : '',
              q.status === 'respondida' && 'opacity-60',
              dark ? 'bg-stage-bg' : 'bg-slate-50',
            )}
          >
            <p className="text-[0.85em]">
              {q.fromName} ({teamLabel(v, q.fromTeam)}) → <strong>{teamLabel(v, q.to)}</strong>
              {v.parallel && ` · Juicio ${q.trial}`} ·{' '}
              {q.status === 'en_pantalla'
                ? '📽 en pantalla'
                : q.status === 'respondida'
                  ? '✓ respondida'
                  : 'pendiente'}
            </p>
            <p>{q.text}</p>
            {isHost && (
              <div className="mt-2 flex flex-wrap gap-1">
                <AsyncButton
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    gameAct({ type: 'questionStatus', id: q.id, status: 'en_pantalla' })
                  }
                >
                  📽 Proyectar
                </AsyncButton>
                <AsyncButton
                  className="btn-ghost btn-sm"
                  onClick={() =>
                    gameAct({ type: 'questionStatus', id: q.id, status: 'respondida' })
                  }
                >
                  ✓ Respondida
                </AsyncButton>
                <AsyncButton
                  className="btn-ghost btn-sm"
                  onClick={() => gameAct({ type: 'questionStatus', id: q.id, status: 'pendiente' })}
                >
                  Volver a pendiente
                </AsyncButton>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Vote({ v }: { v: J.JuicioView }) {
  const { groupAct } = useSession();
  const [d, setD] = useDraft(v.me!.vote, {
    principal: v.parties[0].id,
    responsibility: Object.fromEntries(v.parties.map((p) => [p.id, 50])) as Record<string, number>,
    sanction: '',
  });
  return (
    <section className="card border-4 border-brand-700">
      <SectionTitle sub="Como jurado, decidan quién es responsable y en qué medida.">
        Votación del jurado
      </SectionTitle>
      <fieldset className="mb-4">
        <legend className="label">Responsable principal</legend>
        {v.parties.map((p) => (
          <label key={p.id} className="mb-1 flex items-center gap-2">
            <input
              type="radio"
              name="principal"
              className="h-5 w-5"
              checked={d.principal === p.id}
              onChange={() => setD({ ...d, principal: p.id })}
            />
            {p.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="mb-4">
        <legend className="label">Grado de responsabilidad de cada parte</legend>
        {v.parties.map((p) => (
          <label key={p.id} className="mb-2 block">
            <span className="flex justify-between">
              <span>{p.label}</span>
              <strong className="tabular-nums">{d.responsibility[p.id] ?? 0}%</strong>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              className="w-full accent-brand-700"
              value={d.responsibility[p.id] ?? 0}
              onChange={(e) =>
                setD({
                  ...d,
                  responsibility: { ...d.responsibility, [p.id]: Number(e.target.value) },
                })
              }
            />
          </label>
        ))}
      </fieldset>
      <TextArea
        label="Sanción o reparación sugerida"
        value={d.sanction}
        onChange={(sanction) => setD({ ...d, sanction })}
        max={500}
        rows={3}
      />
      <AsyncButton disabled={!d.sanction.trim()} onClick={() => groupAct({ type: 'vote', ...d })}>
        Enviar voto
      </AsyncButton>
      {v.me!.vote && <Sent />}
    </section>
  );
}

function Headline({ v }: { v: J.JuicioView }) {
  const { groupAct } = useSession();
  const [text, setText] = useDraft(v.me!.headline || null, '');
  return (
    <section className="card">
      <TextArea label="Titular de prensa" value={text} onChange={setText} max={100} rows={2} />
      {text && <Newspaper headline={text} />}
      <AsyncButton
        className="btn-primary mt-3"
        disabled={text.trim().length < 3}
        onClick={() => groupAct({ type: 'headline', text })}
      >
        Publicar titular
      </AsyncButton>
      {v.me!.headline && <Sent />}
    </section>
  );
}

function Closing({ v }: { v: J.JuicioView }) {
  const { groupAct } = useSession();
  const [items, setItems] = useDraft(v.me!.clauses.length ? v.me!.clauses : null, ['', '', '']);
  return (
    <>
      {v.closing && <KeyPoints v={v} />}
      <section className="card">
        <h2 className="mb-3 text-xl">{v.closing?.prompt}</h2>
        {items.map((c, i) => (
          <TextArea
            key={i}
            label={`Cláusula ${i + 1}`}
            value={c}
            onChange={(x) => setItems(items.map((y, j) => (j === i ? x : y)))}
            max={300}
            rows={2}
          />
        ))}
        <AsyncButton
          disabled={items.some((c) => !c.trim())}
          onClick={() => groupAct({ type: 'clauses', items })}
        >
          Enviar cláusulas
        </AsyncButton>
        {v.me!.clauses.length > 0 && <Sent />}
      </section>
    </>
  );
}

function KeyPoints({ v, dark }: { v: J.JuicioView; dark?: boolean }) {
  return (
    <section className={dark ? 'panel' : 'card'}>
      <h2 className="mb-3 text-[1.2em]">Puntos clave</h2>
      <ul className="space-y-2">
        {v.closing!.keyPoints.map((k) => (
          <li key={k} className="flex gap-2">
            <span aria-hidden="true">⚖</span>
            {k}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Verdicts({ v, dark }: { v: J.JuicioView; dark?: boolean }) {
  if (!v.verdicts) return null;
  return (
    <div className={cx('grid gap-6', v.verdicts.length > 1 && 'lg:grid-cols-2')}>
      {v.verdicts.map((vd) => (
        <section key={vd.trial} className={dark ? 'panel' : 'card'}>
          <h2 className="mb-2 text-[1.2em]">
            Veredicto{v.parallel ? ` · Juicio ${vd.trial}` : ''} ({vd.votes} votos)
          </h2>
          <h3 className="mb-1">Responsable principal</h3>
          <Bars dark={dark} data={vd.principal.map((p) => ({ label: p.label, value: p.count }))} />
          <h3 className="mb-1 mt-4">Responsabilidad promedio</h3>
          <Bars
            dark={dark}
            data={vd.responsibility.map((p) => ({ label: p.label, value: p.avg, tone: 'warn' }))}
            format={(n) => `${n}%`}
          />
          {vd.sanctions.length > 0 && (
            <>
              <h3 className="mb-1 mt-4">Sanciones o reparaciones</h3>
              <ul className="list-disc space-y-1 pl-6">
                {vd.sanctions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {vd.headlines.length > 0 && (
            <div className="mt-4 space-y-3">
              {vd.headlines.map((h, i) => (
                <Newspaper key={i} headline={h} trial={v.parallel ? vd.trial : undefined} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ docente

export function Host({ view }: GameViewProps) {
  const v = view as J.JuicioView;
  const { gameAct } = useSession();
  const [team, setTeam] = useState<J.JuicioTeam>('aaip');
  const [preset, setPreset] = useState(v.presets[0].id);
  const [trial, setTrial] = useState<1 | 2>(1);
  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="mb-3 text-xl">Asignación de equipos</h2>
        {!v.assignments.length && <Empty>Todavía no hay grupos.</Empty>}
        <ul className="space-y-2">
          {v.assignments.map((a) => (
            <li key={a.groupId} className="flex flex-wrap items-center gap-2">
              <span className="min-w-[8rem] font-semibold">{a.name}</span>
              <select
                className="input max-w-xs py-2"
                aria-label={`Equipo de ${a.name}`}
                value={a.team ?? ''}
                onChange={(e) =>
                  gameAct({
                    type: 'assign',
                    groupId: a.groupId,
                    team: (e.target.value || null) as J.JuicioTeam | null,
                    trial: a.trial,
                  })
                }
              >
                <option value="">Sin equipo</option>
                {v.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              {v.parallel && (
                <select
                  className="input max-w-[9rem] py-2"
                  aria-label={`Juicio de ${a.name}`}
                  value={a.trial}
                  onChange={(e) =>
                    gameAct({
                      type: 'assign',
                      groupId: a.groupId,
                      team: a.team,
                      trial: Number(e.target.value) as 1 | 2,
                    })
                  }
                >
                  <option value={1}>Juicio 1</option>
                  <option value={2}>Juicio 2</option>
                </select>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="mb-3 text-xl">Temporizador de oradores</h2>
        {v.speaker && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 p-3 text-white">
            <span>
              🎤 {v.speaker.label}: <strong>{teamLabel(v, v.speaker.team)}</strong>
            </span>
            <Countdown endsAt={v.speaker.endsAt} className="text-2xl" />
            <AsyncButton
              className="btn-secondary btn-sm ml-auto"
              onClick={() => gameAct({ type: 'stopSpeaker' })}
            >
              Detener
            </AsyncButton>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <select
            className="input max-w-xs"
            aria-label="Equipo que habla"
            value={team}
            onChange={(e) => setTeam(e.target.value as J.JuicioTeam)}
          >
            {v.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            className="input max-w-xs"
            aria-label="Tipo de intervención"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            {v.presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({Math.round(p.sec / 60)}′)
              </option>
            ))}
          </select>
          {v.parallel && (
            <select
              className="input max-w-[9rem]"
              aria-label="Juicio"
              value={trial}
              onChange={(e) => setTrial(Number(e.target.value) as 1 | 2)}
            >
              <option value={1}>Juicio 1</option>
              <option value={2}>Juicio 2</option>
            </select>
          )}
          <AsyncButton onClick={() => gameAct({ type: 'speaker', team, preset, trial })}>
            ▶ Dar la palabra
          </AsyncButton>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-2 text-xl">Prueba sorpresa</h2>
        {v.surpriseReleased ? (
          <p className="text-ok-700">✓ Ya fue liberada.</p>
        ) : (
          <AsyncButton className="btn-danger" onClick={() => gameAct({ type: 'releaseSurprise' })}>
            ⚡ Liberar prueba sorpresa
          </AsyncButton>
        )}
      </section>

      <QuestionQueue v={v} />
      <Verdicts v={v} />
      {v.closing && (
        <>
          <KeyPoints v={v} />
          <Clauses v={v} />
        </>
      )}
    </div>
  );
}

function Clauses({ v, dark }: { v: J.JuicioView; dark?: boolean }) {
  if (!v.closing?.clauses.length) return null;
  return (
    <section className={dark ? 'panel' : 'card'}>
      <h2 className="mb-3 text-[1.2em]">Cláusulas propuestas</h2>
      <ul className="grid gap-4 md:grid-cols-2">
        {v.closing.clauses.map((c) => (
          <li key={c.name}>
            <strong>{c.name}</strong>
            <ol className="list-decimal pl-6">
              {c.items.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ pantalla

export function Screen({ view }: GameViewProps) {
  const v = view as J.JuicioView;
  const onScreen = v.questions.filter((q) => q.status === 'en_pantalla');
  if (v.phase === 'cierre')
    return (
      <div className="space-y-6">
        <KeyPoints v={v} dark />
        <Verdicts v={v} dark />
        <Clauses v={v} dark />
      </div>
    );
  return (
    <div className="space-y-6">
      {v.speaker && (
        <section className="panel flex flex-wrap items-center justify-between gap-6 border-4 border-accent-500">
          <div>
            <p className="muted">
              🎤 {v.speaker.label}
              {v.parallel ? ` · Juicio ${v.speaker.trial}` : ''}
            </p>
            <p className="text-[56px] font-black">{teamLabel(v, v.speaker.team)}</p>
          </div>
          <Countdown
            endsAt={v.speaker.endsAt}
            className="text-[120px]"
            sound
            label="Tiempo del orador"
          />
        </section>
      )}
      {onScreen.map((q) => (
        <section key={q.id} className="panel anim-pop">
          <p className="muted">
            Pregunta de {q.fromName} ({teamLabel(v, q.fromTeam)}) para{' '}
            <strong>{teamLabel(v, q.to)}</strong>
          </p>
          <p className="mt-2 text-[44px] font-bold">“{q.text}”</p>
        </section>
      ))}
      {v.verdicts ? (
        <Verdicts v={v} dark />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <CaseFile v={v} dark />
          <section className="panel">
            <h2 className="mb-3">Equipos</h2>
            <ul className="space-y-2">
              {v.teams.map((t) => (
                <li key={t.id}>
                  <strong>{t.label}:</strong>{' '}
                  <span className="muted">
                    {v.assignments
                      .filter((a) => a.team === t.id)
                      .map((a) => (v.parallel ? `${a.name} (J${a.trial})` : a.name))
                      .join(', ') || '—'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      <Evidence v={v} dark />
    </div>
  );
}
