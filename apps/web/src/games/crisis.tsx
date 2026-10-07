import { useState } from 'react';
import { countWords, crisis as K } from '@ciberjunta/shared';
import { useSession } from '../lib/session';
import {
  AsyncButton,
  Bars,
  Countdown,
  cx,
  Empty,
  Meter,
  Points,
  SectionTitle,
  Sent,
  TextArea,
  useDraft,
} from '../components/ui';
import type { GameViewProps } from './index';

const STOPWORDS = new Set(
  'de la el los las un una unos unas y o a en con por para del al que se su sus lo le les no si es son ser tener tenido haber hay mas más muy ya como cada antes todo toda todos todas nuestro nuestra nuestros nuestras este esta estos estas ese esa eso entre sobre sin otro otra'.split(
    ' ',
  ),
);

export function wordCloud(items: string[], max = 40) {
  const counts = new Map<string, number>();
  for (const it of items)
    for (const raw of it.toLowerCase().split(/[^a-záéíóúñü0-9]+/i)) {
      if (raw.length < 3 || STOPWORDS.has(raw)) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
}

function Cloud({ items, dark }: { items: string[]; dark?: boolean }) {
  const words = wordCloud(items);
  if (!words.length)
    return <p className={dark ? 'muted' : 'text-slate-600'}>Todavía no hay respuestas.</p>;
  const max = words[0][1];
  return (
    <ul
      className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
      aria-label="Nube de palabras"
    >
      {words.map(([w, n]) => (
        <li
          key={w}
          className={cx('font-bold', dark ? 'text-accent-400' : 'text-brand-800')}
          style={{ fontSize: `${1 + (n / max) * 1.6}em` }}
        >
          {w}
          <span className="sr-only"> ({n})</span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ grupo

export function Group({ view }: GameViewProps) {
  const v = view as K.CrisisView;
  const me = v.me!;
  return (
    <div className="space-y-5">
      <div className="card">
        {me.trust !== null ? (
          <Meter value={me.trust} label="Confianza del mercado" />
        ) : (
          <p className="text-center">
            <span className="block font-semibold">Confianza del mercado</span>
            <span className="text-slate-700">
              El efecto de sus decisiones se revela en el debriefing.
            </span>
          </p>
        )}
      </div>
      {v.phase === 'comite' && <InjectGroup v={v} />}
      {v.phase === 'cierre' && <ClosingForm v={v} />}
      {v.phase === 'debrief' && v.debrief && <DebriefGroup v={v} />}
      <section className="card">
        <h2 className="mb-2 text-xl">Bitácora del comité</h2>
        {me.log.length ? (
          <ol className="space-y-2">
            {me.log.map((l) => (
              <li key={l.index} className="border-l-4 border-brand-300 pl-3">
                <p className="text-sm text-slate-600">
                  Minuto {l.minute} · {l.title}
                </p>
                <p className="font-semibold">
                  {l.option ?? 'Sin decisión'} {l.points !== null && <Points value={l.points} />}
                </p>
                {l.justification && <p className="text-slate-700">“{l.justification}”</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-slate-600">Todavía no hubo decisiones.</p>
        )}
      </section>
    </div>
  );
}

function InjectGroup({ v }: { v: K.CrisisView }) {
  const { groupAct } = useSession();
  const cur = v.current;
  const me = v.me!;
  const [choice, setChoice] = useState<string | null>(null);
  const [why, setWhy] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [forIndex, setForIndex] = useState(cur?.index ?? -1);
  if (cur && cur.index !== forIndex) {
    setForIndex(cur.index);
    setChoice(null);
    setWhy('');
    setConfirming(false);
  }
  if (!cur) return <Empty>Esperen: el primer inject llega en cualquier momento…</Empty>;
  const decided = me.current;
  return (
    <section
      key={cur.index}
      className="card anim-pop anim-urgent border-4 border-danger-600"
      aria-live="assertive"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="chip bg-danger-600 text-white">
          <span aria-hidden="true">🚨</span> URGENTE · minuto {cur.minute}
        </span>
        {!cur.closed && <Countdown endsAt={cur.endsAt} className="text-2xl" sound />}
      </div>
      <h2 className="text-2xl">{cur.title}</h2>
      <p className="mb-4 mt-1 text-lg">{cur.text}</p>
      {decided ? (
        <p className="rounded-xl bg-slate-100 p-3">
          Decisión tomada: <strong>{cur.options.find((o) => o.id === decided.option)?.text}</strong>
          . Es irreversible.
        </p>
      ) : cur.closed ? (
        <p className="rounded-xl bg-danger-100 p-3 font-semibold text-danger-700">
          Se terminó el tiempo: quedó registrado “Sin decisión”.
        </p>
      ) : (
        <fieldset>
          <legend className="mb-2 font-bold">¿Qué decide el comité?</legend>
          <div className="space-y-2">
            {cur.options.map((o) => (
              <label
                key={o.id}
                className={cx(
                  'flex cursor-pointer gap-3 rounded-xl border-2 p-3',
                  choice === o.id ? 'border-brand-700 bg-brand-50' : 'border-slate-300',
                )}
              >
                <input
                  type="radio"
                  name={`inject-${cur.index}`}
                  className="mt-1 h-5 w-5"
                  checked={choice === o.id}
                  onChange={() => {
                    setChoice(o.id);
                    setConfirming(false);
                  }}
                />
                <span>
                  <strong>{o.id})</strong> {o.text}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-4">
            <TextArea
              label="Justificación breve (opcional)"
              value={why}
              onChange={setWhy}
              max={300}
              rows={2}
            />
          </div>
          {!confirming ? (
            <button
              type="button"
              className="btn-primary w-full"
              disabled={!choice}
              onClick={() => setConfirming(true)}
            >
              Decidir
            </button>
          ) : (
            <div className="rounded-xl bg-warn-100 p-3">
              <p className="mb-2 font-semibold text-warn-700">
                La decisión es irreversible. ¿Confirman la opción {choice}?
              </p>
              <div className="flex gap-2">
                <AsyncButton
                  className="btn-primary flex-1"
                  onClick={() =>
                    groupAct({
                      type: 'decide',
                      inject: cur.index,
                      option: choice!,
                      justification: why,
                    })
                  }
                >
                  Confirmar
                </AsyncButton>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setConfirming(false)}
                >
                  Volver
                </button>
              </div>
            </div>
          )}
        </fieldset>
      )}
    </section>
  );
}

function ClosingForm({ v }: { v: K.CrisisView }) {
  const { groupAct } = useSession();
  const [draft, setDraft] = useDraft(v.me!.closing, { statement: '', prep: ['', '', '', '', ''] });
  const prep = [...draft.prep, '', '', '', '', ''].slice(0, 5);
  const words = countWords(draft.statement);
  return (
    <section className="card">
      <SectionTitle sub="Comunicado público y lecciones aprendidas.">
        Cierre del comité
      </SectionTitle>
      <TextArea
        label="Comunicado público"
        value={draft.statement}
        onChange={(statement) => setDraft({ ...draft, statement })}
        max={1200}
        maxWords={v.maxWords}
        rows={6}
        hint="Breve, veraz, con próximos pasos. Sin tecnicismos."
      />
      <fieldset className="mb-4">
        <legend className="label">5 cosas que deberían haber tenido listas antes del lunes</legend>
        <ol className="space-y-2">
          {prep.map((p, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-6 font-bold">{i + 1}.</span>
              <input
                className="input"
                maxLength={200}
                aria-label={`Preparación ${i + 1}`}
                value={p}
                onChange={(e) =>
                  setDraft({ ...draft, prep: prep.map((x, j) => (j === i ? e.target.value : x)) })
                }
              />
            </li>
          ))}
        </ol>
      </fieldset>
      <AsyncButton
        disabled={!draft.statement.trim() || words > v.maxWords}
        onClick={() =>
          groupAct({
            type: 'closing',
            statement: draft.statement,
            prep: prep.map((p) => p.trim()).filter(Boolean),
          })
        }
      >
        Enviar comunicado
      </AsyncButton>
      {v.me!.closing && <Sent />}
    </section>
  );
}

function DebriefGroup({ v }: { v: K.CrisisView }) {
  const d = v.debrief!;
  const { payload } = useSession();
  const myId = payload?.role === 'group' ? payload.me.id : null;
  return (
    <section className="card">
      <h2 className="mb-2 text-xl">Debriefing</h2>
      <p className="mb-3 text-slate-700">Miren la pantalla proyectada. Ranking de confianza:</p>
      <ol className="space-y-1">
        {d.timeline.map((t, i) => (
          <li
            key={t.groupId}
            className={cx('flex justify-between', t.groupId === myId && 'font-bold text-brand-800')}
          >
            <span>
              {i + 1}. {t.name}
            </span>
            <span className="tabular-nums">{t.trust}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ------------------------------------------------------------------ docente

export function Host({ view }: GameViewProps) {
  const v = view as K.CrisisView;
  const { gameAct } = useSession();
  const cur = v.current;
  return (
    <div className="space-y-6">
      {v.phase === 'comite' && (
        <section className="card">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-xl">
              Inject {cur ? cur.index + 1 : 0} de {v.totalInjects}
            </h2>
            {cur && !cur.closed && (
              <>
                <Countdown endsAt={cur.endsAt} className="text-xl" />
                <AsyncButton
                  className="btn-secondary btn-sm"
                  onClick={() => gameAct({ type: 'closeInject' })}
                >
                  Cerrar inject
                </AsyncButton>
              </>
            )}
            {(cur?.index ?? -1) + 1 < v.totalInjects && (
              <AsyncButton onClick={() => gameAct({ type: 'nextInject' })}>
                🚨 Siguiente inject
              </AsyncButton>
            )}
          </div>
          <div className="mb-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={v.autoMode}
                onChange={(e) => gameAct({ type: 'setAuto', on: e.target.checked })}
              />
              Modo automático
            </label>
            {v.autoMode && v.nextAutoAt && (
              <span>
                Próximo inject en <Countdown endsAt={v.nextAutoAt} label="Próximo inject" />
              </span>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={v.showImmediate}
                onChange={(e) => gameAct({ type: 'setShowImmediate', on: e.target.checked })}
              />
              Mostrar efecto inmediato a los grupos
            </label>
          </div>
          {cur ? (
            <>
              <p className="font-bold">{cur.title}</p>
              <p className="mb-3">{cur.text}</p>
              <p className="mb-2">
                Decidieron {cur.decidedCount}/{v.ranking?.length ?? 0}{' '}
                {cur.closed && <span className="chip bg-slate-200">Cerrado</span>}
              </p>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b">
                    <th className="py-1">Grupo</th>
                    <th>Opción</th>
                    <th>Justificación</th>
                  </tr>
                </thead>
                <tbody>
                  {v.host!.decisions.map((d) => (
                    <tr key={d.groupId} className="border-b border-slate-100 align-top">
                      <td className="py-1 pr-2">{d.name}</td>
                      <td className="pr-2 font-bold">{d.option ?? '—'}</td>
                      <td className="text-sm">{d.justification}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <Empty>Lancen el primer inject cuando estén listos.</Empty>
          )}
        </section>
      )}
      {v.phase === 'cierre' && (
        <section className="card">
          <h2 className="text-xl">
            Los grupos escriben su comunicado y las 5 cosas que debían tener listas.
          </h2>
        </section>
      )}
      {v.phase === 'debrief' && v.debrief && <DebriefBoard d={v.debrief} />}
      {v.ranking && (
        <section className="card">
          <h2 className="mb-2 text-xl">Confianza del mercado</h2>
          <Bars
            data={v.ranking.map((r) => ({
              label: r.name,
              value: Math.max(0, r.trust),
              tone: r.trust >= 90 ? 'ok' : r.trust >= 60 ? 'warn' : 'danger',
            }))}
          />
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ debriefing compartido

function DebriefBoard({ d, dark }: { d: K.CrisisDebrief; dark?: boolean }) {
  const panel = dark ? 'panel' : 'card';
  const debatable = d.injects[d.debatableIndex];
  return (
    <div className="space-y-6">
      <section className={panel}>
        <h2 className="mb-3 text-[1.3em]">Línea de tiempo comparada</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1 text-center">
            <thead>
              <tr>
                <th className="text-left">Grupo</th>
                {d.injects.map((inj, i) => (
                  <th key={i} title={inj.title} className="font-normal">
                    <span className="block text-[0.7em] opacity-80">min</span>
                    {inj.minute}
                    {inj.debatable && <span aria-label="decisión debatible"> ⚖</span>}
                  </th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {d.timeline.map((t) => (
                <tr key={t.groupId}>
                  <th className="pr-3 text-left font-semibold">{t.name}</th>
                  {t.cells.map((c, i) => (
                    <td
                      key={i}
                      className={cx(
                        'rounded-lg px-2 py-1 font-bold',
                        c.points > 0 && 'bg-ok-600 text-white',
                        c.points < 0 && 'bg-danger-600 text-white',
                        c.points === 0 && (dark ? 'bg-stage-line' : 'bg-slate-200'),
                      )}
                      aria-label={`${d.injects[i].title}: ${c.option ?? 'sin decisión'}, ${c.points} puntos`}
                    >
                      {c.option ?? '∅'}
                      <span className="block text-[0.7em]">
                        {c.points > 0 ? '▲+' : c.points < 0 ? '▼' : ''}
                        {c.points}
                      </span>
                    </td>
                  ))}
                  <td className="font-black tabular-nums">{t.trust}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={panel}>
        <h2 className="mb-1 text-[1.3em]">⚖ Decisión debatible: {debatable.title}</h2>
        <p className={cx('mb-4', dark ? 'muted' : 'text-slate-700')}>
          No hay una única respuesta correcta.
        </p>
        <Bars
          dark={dark}
          data={d.debatableCounts.map((c) => ({ label: `${c.option}) ${c.text}`, value: c.count }))}
        />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border-2 border-danger-600 p-4">
            <h3 className="mb-2">✗ En contra de pagar</h3>
            <ul className="list-disc space-y-1 pl-6">
              {d.paymentArgs.against.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border-2 border-accent-500 p-4">
            <h3 className="mb-2">? A favor (según quienes pagan)</h3>
            <ul className="list-disc space-y-1 pl-6">
              {d.paymentArgs.favor.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 rounded-2xl bg-accent-400 p-4 font-bold text-slate-900">
          💡 {d.paymentArgs.lesson}
        </p>
      </section>

      <section className={panel}>
        <h2 className="mb-4 text-[1.3em]">{d.finalQuestion}</h2>
        <Cloud items={d.prepItems} dark={dark} />
      </section>

      {d.statements.length > 0 && (
        <section className={panel}>
          <h2 className="mb-3 text-[1.3em]">Comunicados públicos</h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {d.statements.map((s) => (
              <li
                key={s.name}
                className={cx('rounded-2xl p-4', dark ? 'bg-stage-bg' : 'bg-slate-50')}
              >
                <p className="mb-1 font-bold">{s.name}</p>
                <p className="whitespace-pre-wrap">{s.statement}</p>
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
  const v = view as K.CrisisView;
  const cur = v.current;
  if (v.phase === 'debrief' && v.debrief)
    return (
      <div className="space-y-6">
        <section className="panel">
          <h2 className="mb-3">Ranking de confianza del mercado</h2>
          <Bars
            dark
            data={(v.ranking ?? []).map((r) => ({
              label: r.name,
              value: Math.max(0, r.trust),
              tone: r.trust >= 90 ? 'ok' : r.trust >= 60 ? 'warn' : 'danger',
            }))}
          />
        </section>
        <DebriefBoard d={v.debrief} dark />
      </div>
    );
  if (v.phase === 'cierre')
    return (
      <div className="panel text-center">
        <h2 className="text-[56px]">Cierre del comité</h2>
        <p className="mt-6">✍ Comunicado público (máx. {v.maxWords} palabras)</p>
        <p className="mt-2">📋 5 cosas que deberían haber tenido listas antes del lunes</p>
      </div>
    );
  return (
    <div className="grid gap-8 xl:grid-cols-[2fr_1fr]">
      {cur ? (
        <section
          key={cur.index}
          className={cx(
            'panel anim-pop border-4',
            cur.closed ? 'border-stage-line' : 'anim-urgent border-danger-600',
          )}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <span className="chip bg-danger-600 !text-[28px] text-white">
              🚨 Minuto {cur.minute}
            </span>
            {!cur.closed ? (
              <Countdown endsAt={cur.endsAt} className="text-[72px]" sound />
            ) : (
              <span className="muted">Inject cerrado</span>
            )}
          </div>
          <h2 className="text-[56px] leading-tight">{cur.title}</h2>
          <p className="mt-4 text-[36px]">{cur.text}</p>
          <ul className="mt-6 space-y-2">
            {cur.options.map((o) => (
              <li key={o.id}>
                <strong>{o.id})</strong> {o.text}
              </li>
            ))}
          </ul>
          <p className="muted mt-6">
            Decidieron {cur.decidedCount} grupos · Inject {cur.index + 1} de {v.totalInjects}
          </p>
        </section>
      ) : (
        <section className="panel text-center">
          <p className="text-[96px]" aria-hidden="true">
            ☕
          </p>
          <h2 className="text-[56px]">Lunes, 8:55 AM</h2>
          <p className="muted mt-4">Todo parece tranquilo en la oficina…</p>
        </section>
      )}
      <aside className="space-y-6">
        {v.ranking ? (
          <section className="panel">
            <h2 className="mb-3">Confianza</h2>
            <Bars
              dark
              data={v.ranking.map((r) => ({
                label: r.name,
                value: Math.max(0, r.trust),
                tone: r.trust >= 90 ? 'ok' : r.trust >= 60 ? 'warn' : 'danger',
              }))}
            />
          </section>
        ) : (
          <section className="panel">
            <h2>Confianza del mercado</h2>
            <p className="muted mt-2">
              Arrancan con {v.startTrust} puntos. El efecto se revela en el debriefing.
            </p>
          </section>
        )}
        {v.autoMode && v.nextAutoAt && (
          <p className="panel">
            Próxima noticia en <Countdown endsAt={v.nextAutoAt} label="Próximo inject" />
          </p>
        )}
      </aside>
    </div>
  );
}
