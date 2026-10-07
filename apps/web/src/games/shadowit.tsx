import { useState } from 'react';
import { shadowit as SH } from '@ciberjunta/shared';
import { useSession } from '../lib/session';
import { AsyncButton, Bars, cx, SectionTitle, Sent, TextArea, useDraft } from '../components/ui';
import { Sorter } from '../components/Sorter';
import type { GameViewProps } from './index';

const usd = (n: number) => `USD ${Math.round(n).toLocaleString('es-AR')}`;
const LIGHT_UI: Record<SH.Light, { label: string; tone: string; icon: string }> = {
  verde: { label: 'Verde', tone: 'border-ok-600 bg-ok-100', icon: '🟢' },
  amarillo: { label: 'Amarillo', tone: 'border-accent-500 bg-warn-100', icon: '🟡' },
  rojo: { label: 'Rojo', tone: 'border-danger-600 bg-danger-100', icon: '🔴' },
};

function cost(p: SH.AiProduct, users: number, years: number) {
  return p.setupCost + years * (p.yearlyFixed + p.perUserMonth * users * 12);
}

// ------------------------------------------------------------------ grupo

export function Group({ view }: GameViewProps) {
  const v = view as SH.ShadowitView;
  return (
    <div className="space-y-4">
      <p className="card border-l-8 border-accent-500 text-lg font-semibold">{v.situation}</p>
      {v.phase === 'inventario' && <Inventory v={v} />}
      {v.phase === 'diligencia' && <Diligence v={v} />}
      {v.phase === 'semaforo' && <Semaforo v={v} />}
      {v.phase === 'debrief' && (
        <p className="card">Miren la pantalla proyectada para el debriefing.</p>
      )}
    </div>
  );
}

function Inventory({ v }: { v: SH.ShadowitView }) {
  const { groupAct } = useSession();
  const initial = Object.fromEntries(
    v.inventoryItems.map((i) => [i.id, { column: null as SH.InventoryColumn | null, why: '' }]),
  );
  const [d, setD] = useDraft(v.me!.inventory, initial);
  const cols: Record<string, string | null> = Object.fromEntries(
    Object.entries(d).map(([k, x]) => [k, x.column]),
  );
  return (
    <section>
      <SectionTitle sub="Clasifiquen cada herramienta y anoten por qué la gente la usa.">
        Inventario de Shadow IT
      </SectionTitle>
      <Sorter
        items={v.inventoryItems}
        buckets={v.columns.map((c, i) => ({
          id: c.id,
          label: c.label,
          tone: [
            'border-danger-600 bg-danger-100/40',
            'border-brand-500 bg-brand-50',
            'border-ok-600 bg-ok-100/40',
          ][i],
        }))}
        value={cols}
        onChange={(next) =>
          setD(
            Object.fromEntries(
              v.inventoryItems.map((i) => [
                i.id,
                {
                  column: (next[i.id] ?? null) as SH.InventoryColumn | null,
                  why: d[i.id]?.why ?? '',
                },
              ]),
            ),
          )
        }
        renderExtra={(id) => (
          <input
            className="input mt-2 py-2 text-sm"
            maxLength={300}
            placeholder="¿Por qué la gente la usa?"
            aria-label="¿Por qué la gente la usa?"
            value={d[id]?.why ?? ''}
            onChange={(e) =>
              setD({ ...d, [id]: { column: d[id]?.column ?? null, why: e.target.value } })
            }
          />
        )}
      />
      <AsyncButton
        className="btn-primary mt-4"
        onClick={() => groupAct({ type: 'inventory', items: d })}
      >
        Enviar inventario
      </AsyncButton>
      {v.me!.inventory && <Sent />}
    </section>
  );
}

function CriteriaTable({
  v,
  dark,
  highlight,
}: {
  v: SH.ShadowitView;
  dark?: boolean;
  highlight?: SH.AiOption | null;
}) {
  const [tip, setTip] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className={cx('border-b', dark ? 'border-stage-line' : '')}>
            <th className="py-2 pr-3">Criterio</th>
            {v.products.map((p) => (
              <th key={p.id} className={cx('pr-3', highlight === p.id && 'text-brand-700')}>
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {v.criteria.map((c) => (
            <tr
              key={c.id}
              className={cx('border-b align-top', dark ? 'border-stage-line' : 'border-slate-100')}
            >
              <th className="py-2 pr-3 font-semibold">
                {c.label}
                {!dark && (
                  <button
                    type="button"
                    className="ml-1 rounded-full border px-2 text-sm"
                    aria-expanded={tip === c.id}
                    aria-label={`¿Qué significa “${c.label}”?`}
                    onClick={() => setTip(tip === c.id ? null : c.id)}
                  >
                    ?
                  </button>
                )}
                {(dark || tip === c.id) && (
                  <span
                    className={cx(
                      'block text-[0.8em] font-normal',
                      dark ? 'muted' : 'text-slate-600',
                    )}
                  >
                    {c.tooltip}
                  </span>
                )}
              </th>
              {v.products.map((p) => (
                <td key={p.id} className={cx('py-2 pr-3', highlight === p.id && 'font-semibold')}>
                  {c.values[p.id]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Diligence({ v }: { v: SH.ShadowitView }) {
  const { groupAct } = useSession();
  const [d, setD] = useDraft(v.me!.diligence, {
    option: 'pro' as SH.AiOption,
    users: 10,
    questions: ['', '', ''],
  });
  return (
    <section className="space-y-4">
      <SectionTitle sub="Comparen las tres alternativas y elijan una.">Due diligence</SectionTitle>
      <div className="card">
        <CriteriaTable v={v} highlight={d.option} />
      </div>
      <div className="card">
        <h3 className="mb-2 text-lg">Calculadora de costos</h3>
        <label className="mb-3 flex items-center gap-3">
          <span className="font-semibold">Cantidad de usuarios</span>
          <input
            className="input max-w-[8rem]"
            type="number"
            min={1}
            max={100000}
            value={d.users}
            onChange={(e) => setD({ ...d, users: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="py-1">Opción</th>
              <th>1 año</th>
              <th>3 años</th>
            </tr>
          </thead>
          <tbody>
            {v.products.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-1">
                  {p.name}
                  <span className="block text-sm text-slate-600">{p.priceLabel}</span>
                </td>
                <td className="tabular-nums">{usd(cost(p, d.users, 1))}</td>
                <td className="tabular-nums">{usd(cost(p, d.users, 3))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <fieldset className="mb-4">
          <legend className="label">Su elección</legend>
          <div className="flex flex-wrap gap-2">
            {v.products.map((p) => (
              <label
                key={p.id}
                className={cx(
                  'chip cursor-pointer border-2 py-2',
                  d.option === p.id ? 'border-brand-700 bg-brand-50' : 'border-slate-300',
                )}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="ai"
                  checked={d.option === p.id}
                  onChange={() => setD({ ...d, option: p.id })}
                />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">3 preguntas al proveedor</legend>
          {d.questions.map((q, i) => (
            <input
              key={i}
              className="input mb-2"
              maxLength={300}
              aria-label={`Pregunta ${i + 1}`}
              placeholder={`Pregunta ${i + 1}`}
              value={q}
              onChange={(e) =>
                setD({ ...d, questions: d.questions.map((x, j) => (j === i ? e.target.value : x)) })
              }
            />
          ))}
        </fieldset>
        <AsyncButton
          disabled={d.questions.some((q) => !q.trim())}
          onClick={() => groupAct({ type: 'diligence', ...d })}
        >
          Enviar elección
        </AsyncButton>
        {v.me!.diligence && <Sent />}
      </div>
    </section>
  );
}

function Semaforo({ v }: { v: SH.ShadowitView }) {
  const { groupAct } = useSession();
  const [d, setD] = useDraft(v.me!.semaforo, {
    cards: {} as Record<string, SH.Light | null>,
    rule: v.defaultRule,
  });
  return (
    <section>
      <SectionTitle sub="¿Qué usos de IA permiten (verde), con cuidado (amarillo) o nunca (rojo)?">
        Política semáforo
      </SectionTitle>
      <Sorter
        items={v.cards}
        buckets={SH.LIGHTS.map((l) => ({
          id: l,
          label: `${LIGHT_UI[l].icon} ${LIGHT_UI[l].label}`,
          tone: LIGHT_UI[l].tone,
        }))}
        value={d.cards}
        onChange={(cards) => setD({ ...d, cards: cards as Record<string, SH.Light | null> })}
      />
      <div className="card mt-4">
        <TextArea
          label="Regla de responsabilidad"
          value={d.rule}
          onChange={(rule) => setD({ ...d, rule })}
          max={300}
          rows={2}
        />
        <AsyncButton onClick={() => groupAct({ type: 'semaforo', ...d })}>
          Enviar política
        </AsyncButton>
        {v.me!.semaforo && <Sent />}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ debriefing

const COL_TONE: Record<SH.InventoryColumn, 'danger' | 'brand' | 'ok'> = {
  prohibir: 'danger',
  reemplazar: 'brand',
  permitir: 'ok',
};

function Debrief({ v, dark }: { v: SH.ShadowitView; dark?: boolean }) {
  const d = v.debrief!;
  const panel = dark ? 'panel' : 'card';
  return (
    <div className="space-y-6">
      <p className={cx(panel, 'border-l-[12px] border-accent-500 text-[1.3em] font-bold')}>
        {d.message}
      </p>
      <section className={panel}>
        <h2 className="mb-3 text-[1.2em]">Inventario: ¿qué decidió cada junta?</h2>
        <ul className="grid gap-4 lg:grid-cols-2">
          {d.inventory.map((it) => (
            <li key={it.id}>
              <p className="mb-2 font-semibold">{it.text}</p>
              <Bars
                dark={dark}
                data={v.columns.map((c) => ({
                  label: c.label,
                  value: it.counts[c.id],
                  tone: COL_TONE[c.id],
                }))}
              />
            </li>
          ))}
        </ul>
      </section>
      <section className={panel}>
        <h2 className="mb-3 text-[1.2em]">Due diligence: opción elegida</h2>
        <Bars
          dark={dark}
          data={v.products.map((p) => ({ label: p.name, value: d.options[p.id] }))}
        />
        <ul className="mt-4 space-y-2">
          {d.questions.map((q) => (
            <li key={q.name}>
              <strong>{q.name}</strong> ({v.products.find((p) => p.id === q.option)?.name}):{' '}
              {q.questions.join(' · ')}
            </li>
          ))}
        </ul>
      </section>
      <section className={panel}>
        <h2 className="mb-3 text-[1.2em]">Semáforo: decisiones vs. referencia</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className={cx('border-b', dark && 'border-stage-line')}>
                <th className="py-1 pr-3">Uso</th>
                <th className="pr-3">Referencia</th>
                <th>🟢</th>
                <th>🟡</th>
                <th>🔴</th>
              </tr>
            </thead>
            <tbody>
              {d.cards.map((c) => (
                <tr
                  key={c.id}
                  className={cx('border-b', dark ? 'border-stage-line' : 'border-slate-100')}
                >
                  <td className="py-1 pr-3">{c.text}</td>
                  <td className="pr-3">
                    {LIGHT_UI[c.reference].icon} {LIGHT_UI[c.reference].label}
                  </td>
                  {SH.LIGHTS.map((l) => (
                    <td
                      key={l}
                      className={cx('tabular-nums', l === c.reference && 'font-black underline')}
                    >
                      {c.counts[l]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mb-2 mt-4">Coincidencia con la referencia</h3>
        <Bars
          dark={dark}
          data={d.matches.map((m) => ({ label: m.name, value: m.match, tone: 'ok' }))}
          format={(n) => `${n}/${d.cards.length}`}
        />
      </section>
      {d.rules.length > 0 && (
        <section className={panel}>
          <h2 className="mb-3 text-[1.2em]">Reglas de responsabilidad</h2>
          <ul className="space-y-2">
            {d.rules.map((r) => (
              <li key={r.name}>
                <strong>{r.name}:</strong> “{r.rule}”
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ docente y pantalla

export function Host({ view, meta }: GameViewProps) {
  const v = view as SH.ShadowitView;
  const n = meta.groups.length;
  if (v.phase === 'debrief' && v.debrief) return <Debrief v={v} />;
  return (
    <section className="card">
      <h2 className="mb-2 text-xl">Entregas</h2>
      <ul className="grid gap-2 sm:grid-cols-3">
        <li>
          Inventarios: {v.submitted.inventory}/{n}
        </li>
        <li>
          Due diligence: {v.submitted.diligence}/{n}
        </li>
        <li>
          Semáforos: {v.submitted.semaforo}/{n}
        </li>
      </ul>
    </section>
  );
}

export function Screen({ view }: GameViewProps) {
  const v = view as SH.ShadowitView;
  if (v.phase === 'debrief' && v.debrief) return <Debrief v={v} dark />;
  return (
    <div className="space-y-6">
      <p className="panel border-l-[12px] border-accent-500 text-[36px] font-bold">{v.situation}</p>
      {v.phase === 'inventario' && (
        <section className="panel">
          <h2 className="mb-3">Inventario: Prohibir · Reemplazar · Permitir con reglas</h2>
          <ol className="list-decimal space-y-2 pl-10">
            {v.inventoryItems.map((i) => (
              <li key={i.id}>{i.text}</li>
            ))}
          </ol>
        </section>
      )}
      {v.phase === 'diligencia' && (
        <section className="panel">
          <CriteriaTable v={v} dark />
        </section>
      )}
      {v.phase === 'semaforo' && (
        <section className="panel">
          <h2 className="mb-3">🟢 Verde · 🟡 Amarillo · 🔴 Rojo</h2>
          <ul className="grid gap-2 md:grid-cols-2">
            {v.cards.map((c) => (
              <li key={c.id} className="rounded-xl bg-stage-bg px-4 py-2">
                {c.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
