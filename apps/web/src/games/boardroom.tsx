import { useId, useState } from 'react';
import { boardroom as B } from '@ciberjunta/shared';
import { useSession } from '../lib/session';
import { AsyncButton, cx, Empty, SectionTitle, Sent, TextArea, useDraft } from '../components/ui';
import type { GameViewProps } from './index';

const usd = (n: number) => `USD ${Math.round(n).toLocaleString('es-AR')}`;

const LEVEL: Record<B.FeedbackLevel, { cls: string; icon: string; label: string }> = {
  red: { cls: 'border-danger-600 bg-danger-100 text-danger-700', icon: '⛔', label: 'Alerta roja' },
  yellow: { cls: 'border-warn-600 bg-warn-100 text-warn-700', icon: '⚠', label: 'Alerta amarilla' },
  green: { cls: 'border-ok-600 bg-ok-100 text-ok-700', icon: '✓', label: 'Verde' },
  neutral: { cls: 'border-slate-400 bg-slate-100 text-slate-800', icon: '●', label: 'Revisar' },
};

function Feedback({ fb }: { fb: B.BasketFeedback }) {
  const l = LEVEL[fb.level];
  return (
    <div className={cx('rounded-xl border-l-8 p-3', l.cls)} role="status">
      <p className="font-bold">
        <span aria-hidden="true">{l.icon} </span>
        {l.label}
      </p>
      {fb.messages.map((m) => (
        <p key={m}>{m}</p>
      ))}
    </div>
  );
}

export function expectedLoss(c: B.Calc) {
  return { loss: c.clients * c.costPerClient * (c.probability / 100), fix: c.hours * c.hourCost };
}

function LossChart({ loss, fix, dark }: { loss: number; fix: number; dark?: boolean }) {
  const max = Math.max(loss, fix, 1);
  const H = 160;
  const bar = (v: number) => Math.max(2, (v / max) * H);
  return (
    <svg
      viewBox="0 0 320 210"
      className="h-auto w-full max-w-sm"
      role="img"
      aria-label={`Pérdida esperada ${usd(loss)} contra costo de corregir ${usd(fix)}`}
    >
      <rect x="40" y={20 + H - bar(loss)} width="90" height={bar(loss)} fill="#b91c1c" rx="6" />
      <rect x="190" y={20 + H - bar(fix)} width="90" height={bar(fix)} fill="#15803d" rx="6" />
      <line
        x1="20"
        y1={20 + H}
        x2="300"
        y2={20 + H}
        stroke={dark ? '#a9b4c8' : '#64748b'}
        strokeWidth="2"
      />
      <text x="85" y="200" textAnchor="middle" fontSize="13" fill={dark ? '#eef2f8' : '#0f172a'}>
        Pérdida anual esperada
      </text>
      <text x="235" y="200" textAnchor="middle" fontSize="13" fill={dark ? '#eef2f8' : '#0f172a'}>
        Costo de corregir
      </text>
      <text
        x="85"
        y={14 + H - bar(loss)}
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill={dark ? '#eef2f8' : '#0f172a'}
      >
        {usd(loss)}
      </text>
      <text
        x="235"
        y={14 + H - bar(fix)}
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill={dark ? '#eef2f8' : '#0f172a'}
      >
        {usd(fix)}
      </text>
    </svg>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (n: number) => void;
}) {
  const id = useId();
  return (
    <div className="mb-3">
      <label htmlFor={id} className="flex justify-between font-semibold">
        <span>{label}</span>
        <span className="tabular-nums">
          {value.toLocaleString('es-AR')}
          {unit}
        </span>
      </label>
      <input
        id={id}
        type="range"
        className="w-full accent-brand-700"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

// ------------------------------------------------------------------ grupo

export function Group({ view }: GameViewProps) {
  const v = view as B.BoardroomView;
  switch (v.phase) {
    case 'seleccion':
      return <Selection v={v} />;
    case 'hallazgo':
      return <FindingForm v={v} />;
    case 'giro':
      return (
        <>
          <Twist v={v} />
          <div className="mt-6">
            <FindingForm v={v} />
          </div>
        </>
      );
    case 'regla':
      return (
        <>
          <Rule v={v} />
          {v.me!.twist && (
            <div className="mt-6">
              <Twist v={v} />
            </div>
          )}
        </>
      );
    default:
      return (
        <div className="space-y-4">
          <SectionTitle>Debriefing</SectionTitle>
          {v.me!.feedback && (
            <div className="card">
              <h3 className="mb-2 text-lg">Su elección de proveedor</h3>
              <Feedback fb={v.me!.feedback} />
            </div>
          )}
          <p className="text-slate-700">
            Miren la pantalla proyectada: el docente puede pedirles que presenten.
          </p>
        </div>
      );
  }
}

function Selection({ v }: { v: B.BoardroomView }) {
  const { groupAct } = useSession();
  const [d, setD] = useDraft(v.me!.basket, { items: [] as string[], fundsRequest: '', memo: '' });
  const [askFunds, setAskFunds] = useState(!!v.me!.basket?.fundsRequest);
  const total = d.items.reduce(
    (a, id) => a + (v.providers.find((p) => p.id === id)?.price ?? 0),
    0,
  );
  const over = total > v.budget;
  const toggle = (id: string) =>
    setD({
      ...d,
      items: d.items.includes(id) ? d.items.filter((x) => x !== id) : [...d.items, id],
    });
  const fundsOk = !askFunds || d.fundsRequest.trim().length >= v.fundsMinChars;
  return (
    <div className="space-y-4">
      <SectionTitle sub={`Tienen ${usd(v.budget)} para contratar un pentest. Armen su canasta.`}>
        Elegir proveedor
      </SectionTitle>
      <ul className="grid gap-3">
        {v.providers.map((p) => (
          <li key={p.id}>
            <label
              className={cx(
                'card flex cursor-pointer gap-3',
                d.items.includes(p.id) && 'border-2 border-brand-700 bg-brand-50',
              )}
            >
              <input
                type="checkbox"
                className="mt-1 h-6 w-6"
                checked={d.items.includes(p.id)}
                onChange={() => toggle(p.id)}
              />
              <span className="flex-1">
                <span className="flex flex-wrap justify-between gap-2">
                  <strong className="text-lg">
                    {p.id} · {p.name}
                  </strong>
                  <strong className="text-lg">{usd(p.price)}</strong>
                </span>
                {p.priceNote && <span className="block text-sm text-slate-600">{p.priceNote}</span>}
                <span className="mt-1 block">
                  <b>Metodología:</b> {p.methodology}
                </span>
                <span className="block">
                  <b>Entregables:</b> {p.deliverables}
                </span>
                <span className="block">
                  <b>Contrato:</b> {p.contract}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div
        className={cx(
          'card sticky bottom-2 border-2',
          over ? 'border-danger-600' : 'border-ok-600',
        )}
      >
        <p className="flex justify-between text-lg">
          <span>Total de la canasta</span>
          <strong className="tabular-nums">
            {usd(total)} / {usd(v.budget)}
          </strong>
        </p>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
          <div
            className={cx('h-full', over ? 'bg-danger-600' : 'bg-ok-600')}
            style={{ width: `${Math.min(100, (total / v.budget) * 100)}%` }}
          />
        </div>
        {over && (
          <p className="mt-2 font-semibold text-danger-700">
            ⚠ Se pasan del presupuesto por {usd(total - v.budget)}.
          </p>
        )}
      </div>
      <div className="card">
        <label className="mb-3 flex items-center gap-3 font-semibold">
          <input
            type="checkbox"
            className="h-6 w-6"
            checked={askFunds}
            onChange={(e) => {
              setAskFunds(e.target.checked);
              if (!e.target.checked) setD({ ...d, fundsRequest: '' });
            }}
          />
          💰 Pedir más fondos al inversor
        </label>
        {askFunds && (
          <TextArea
            label="Justificación del pedido de fondos"
            value={d.fundsRequest}
            onChange={(fundsRequest) => setD({ ...d, fundsRequest })}
            max={1500}
            minChars={v.fundsMinChars}
            rows={4}
          />
        )}
        <TextArea
          label="Memo al inversor (obligatorio)"
          value={d.memo}
          onChange={(memo) => setD({ ...d, memo })}
          max={600}
          rows={4}
          hint="¿Qué contratan y por qué? En lenguaje de negocio."
        />
        <AsyncButton
          disabled={!d.memo.trim() || !fundsOk || (over && !askFunds)}
          onClick={() =>
            groupAct({
              type: 'basket',
              items: d.items,
              fundsRequest: askFunds ? d.fundsRequest : '',
              memo: d.memo,
            })
          }
        >
          Enviar canasta y memo
        </AsyncButton>
        {over && !askFunds && (
          <p className="mt-2 text-sm text-danger-700">
            Para enviar una canasta que supera el presupuesto, pidan fondos al inversor.
          </p>
        )}
        {v.me!.basket && <Sent />}
      </div>
    </div>
  );
}

function FindingCard({ v, big }: { v: B.BoardroomView; big?: boolean }) {
  return (
    <section className={cx(big ? 'panel' : 'card border-l-8 border-danger-600')}>
      <p
        className={cx(
          'font-semibold uppercase tracking-wide',
          big ? 'muted' : 'text-sm text-danger-700',
        )}
      >
        Hallazgo del pentest
      </p>
      <p className={cx('mt-2 font-mono', big ? 'text-[32px]' : '')}>{v.finding.text}</p>
      <details className="mt-3" open={big}>
        <summary className="cursor-pointer font-semibold">¿Qué significa, sin tecnicismos?</summary>
        <p className="mt-2">💡 {v.finding.analogy}</p>
      </details>
    </section>
  );
}

function FindingForm({ v }: { v: B.BoardroomView }) {
  const { groupAct } = useSession();
  const [f, setF] = useDraft<B.Finding>(v.me!.finding, {
    impact: '',
    legal: [],
    legalText: '',
    urgency: 'Alto',
    urgencyWhy: '',
    decisions: [],
    decisionText: '',
    calc: v.calcDefaults,
  });
  const toggle = (k: 'legal' | 'decisions', id: string) =>
    setF({ ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] });
  const setCalc = (k: keyof B.Calc, n: number) => setF({ ...f, calc: { ...f.calc, [k]: n } });
  const { loss, fix } = expectedLoss(f.calc);
  return (
    <div className="space-y-4">
      <SectionTitle sub="Tradúzcanlo a impacto de negocio para la junta.">
        Traducir el hallazgo
      </SectionTitle>
      <FindingCard v={v} />
      <div className="card">
        <TextArea
          label="Impacto en el negocio"
          value={f.impact}
          onChange={(impact) => setF({ ...f, impact })}
          max={1500}
          rows={4}
          hint="Clientes, reputación, dinero, contratos…"
        />
        <fieldset className="mb-4">
          <legend className="label">Marco legal</legend>
          {v.legalOptions.map((o) => (
            <label key={o.id} className="mb-1 flex items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={f.legal.includes(o.id)}
                onChange={() => toggle('legal', o.id)}
              />
              {o.label}
            </label>
          ))}
          <input
            className="input mt-2"
            maxLength={1000}
            placeholder="Comentario legal (opcional)"
            aria-label="Comentario legal"
            value={f.legalText}
            onChange={(e) => setF({ ...f, legalText: e.target.value })}
          />
        </fieldset>
        <fieldset className="mb-4">
          <legend className="label">Urgencia</legend>
          <div className="mb-2 flex flex-wrap gap-2">
            {B.URGENCIES.map((u) => (
              <label
                key={u}
                className={cx(
                  'chip cursor-pointer border-2 py-2',
                  f.urgency === u ? 'border-brand-700 bg-brand-50' : 'border-slate-300',
                )}
              >
                <input
                  type="radio"
                  name="urgency"
                  className="sr-only"
                  checked={f.urgency === u}
                  onChange={() => setF({ ...f, urgency: u })}
                />
                {u}
              </label>
            ))}
          </div>
          <input
            className="input"
            maxLength={600}
            placeholder="¿Por qué?"
            aria-label="Por qué esa urgencia"
            value={f.urgencyWhy}
            onChange={(e) => setF({ ...f, urgencyWhy: e.target.value })}
          />
        </fieldset>
        <fieldset className="mb-4">
          <legend className="label">Decisión gerencial</legend>
          {v.decisionOptions.map((o) => (
            <label key={o.id} className="mb-1 flex items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={f.decisions.includes(o.id)}
                onChange={() => toggle('decisions', o.id)}
              />
              {o.label}
            </label>
          ))}
          <input
            className="input mt-2"
            maxLength={1000}
            placeholder="Detalle de la decisión (opcional)"
            aria-label="Detalle de la decisión"
            value={f.decisionText}
            onChange={(e) => setF({ ...f, decisionText: e.target.value })}
          />
        </fieldset>
      </div>
      <div className="card">
        <h3 className="mb-3 text-lg">Calculadora de pérdida esperada</h3>
        <Slider
          label="Clientes afectados"
          value={f.calc.clients}
          min={0}
          max={50000}
          step={500}
          onChange={(n) => setCalc('clients', n)}
        />
        <Slider
          label="Costo por cliente afectado (USD)"
          value={f.calc.costPerClient}
          min={0}
          max={50}
          step={1}
          onChange={(n) => setCalc('costPerClient', n)}
        />
        <Slider
          label="Probabilidad anual de explotación"
          value={f.calc.probability}
          min={0}
          max={100}
          step={5}
          unit="%"
          onChange={(n) => setCalc('probability', n)}
        />
        <Slider
          label="Horas para corregir"
          value={f.calc.hours}
          min={0}
          max={400}
          step={5}
          onChange={(n) => setCalc('hours', n)}
        />
        <Slider
          label="Costo por hora (USD)"
          value={f.calc.hourCost}
          min={0}
          max={100}
          step={5}
          onChange={(n) => setCalc('hourCost', n)}
        />
        <p className="my-2 text-lg">
          Pérdida anual esperada = {f.calc.clients.toLocaleString('es-AR')} × {f.calc.costPerClient}{' '}
          × {f.calc.probability}% = <strong>{usd(loss)}</strong>
        </p>
        <p className="mb-2 text-lg">
          Costo de corregir = {f.calc.hours} h × {usd(f.calc.hourCost)} ={' '}
          <strong>{usd(fix)}</strong>
        </p>
        <LossChart loss={loss} fix={fix} />
      </div>
      <AsyncButton
        disabled={!f.impact.trim()}
        onClick={() => groupAct({ type: 'finding', finding: f })}
      >
        Enviar análisis
      </AsyncButton>
      {v.me!.finding && <Sent />}
    </div>
  );
}

function Twist({ v }: { v: B.BoardroomView }) {
  const { groupAct } = useSession();
  const t = v.me!.twist;
  const [text, setText] = useDraft(t?.response || null, '');
  if (!t) return <Empty>Esperen: el docente está por repartir los giros de trama…</Empty>;
  return (
    <section className="card anim-pop border-4 border-accent-500">
      <p className="chip mb-2 bg-accent-400 text-slate-900">🔄 Giro de trama</p>
      <p className="mb-4 text-xl font-semibold">{t.text}</p>
      <TextArea label="¿Qué hace la junta?" value={text} onChange={setText} max={400} rows={4} />
      <AsyncButton
        disabled={!text.trim()}
        onClick={() => groupAct({ type: 'twist', response: text })}
      >
        Enviar respuesta
      </AsyncButton>
      {t.response && <Sent />}
    </section>
  );
}

function Rule({ v }: { v: B.BoardroomView }) {
  const { groupAct } = useSession();
  const [rule, setRule] = useDraft(v.me!.rule || null, '');
  return (
    <section className="card">
      <SectionTitle sub="Una oración para la Política de Seguridad Aceptable de su startup.">
        Regla de oro
      </SectionTitle>
      <TextArea label="Regla de oro" value={rule} onChange={setRule} max={200} rows={2} />
      <AsyncButton
        disabled={rule.trim().length < 3}
        onClick={() => groupAct({ type: 'rule', rule })}
      >
        Enviar regla
      </AsyncButton>
      {v.me!.rule && <Sent />}
    </section>
  );
}

// ------------------------------------------------------------------ docente y pantalla

function DebriefGrid({ v, dark }: { v: B.BoardroomView; dark?: boolean }) {
  const d = v.debrief;
  if (!d) return null;
  const pname = (id: string) => v.providers.find((p) => p.id === id)?.name ?? id;
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {d.groups.map((g) => (
        <li key={g.groupId} className={dark ? 'panel' : 'card'}>
          <h3 className="text-[1.2em]">
            {g.name}
            {g.startup && <span className={dark ? 'muted' : 'text-slate-600'}> · {g.startup}</span>}
          </h3>
          <p className="mt-1">
            <b>Canasta:</b> {g.basket.length ? g.basket.map(pname).join(' + ') : '—'} (
            {usd(g.total)})
          </p>
          <div className={cx('my-2', dark && 'text-[24px]')}>
            <Feedback fb={g.feedback} />
          </div>
          <p>
            <b>Urgencia:</b> {g.urgency ?? '—'}
          </p>
          {g.twist && (
            <p className="mt-1">
              <b>Giro:</b> {g.twist.text}
              <span className="block">→ {g.twist.response || '(sin respuesta)'}</span>
              <span className={cx('block text-[0.85em]', dark ? 'muted' : 'text-slate-600')}>
                💡 {g.twist.debrief}
              </span>
            </p>
          )}
          <p className="mt-1">
            <b>Regla de oro:</b> {g.rule ? `“${g.rule}”` : '—'}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function Host({ view, meta }: GameViewProps) {
  const v = view as B.BoardroomView;
  const { gameAct } = useSession();
  const n = meta.groups.length;
  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="mb-2 text-xl">Entregas</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <li>
            Canastas: {v.submitted.basket}/{n}
          </li>
          <li>
            Hallazgos: {v.submitted.finding}/{n}
          </li>
          <li>
            Giros: {v.submitted.twist}/{n}
          </li>
          <li>
            Reglas: {v.submitted.rule}/{n}
          </li>
        </ul>
        {v.phase === 'giro' && (
          <AsyncButton className="btn-primary mt-4" onClick={() => gameAct({ type: 'dealTwists' })}>
            🔄 {v.twistsDealt ? 'Repartir a los grupos que faltan' : 'Repartir giros'}
          </AsyncButton>
        )}
      </section>
      {v.phase === 'debrief' && (
        <>
          <p className="text-slate-700">
            Para el modo presentación usen “📽 Proyectar 90 s” en la lista de grupos.
          </p>
          <DebriefGrid v={v} />
        </>
      )}
    </div>
  );
}

export function Screen({ view }: GameViewProps) {
  const v = view as B.BoardroomView;
  switch (v.phase) {
    case 'seleccion':
      return (
        <div className="panel overflow-x-auto">
          <h2 className="mb-4">Presupuesto: {usd(v.budget)}</h2>
          <table className="w-full text-left text-[26px]">
            <thead>
              <tr className="border-b border-stage-line">
                <th className="py-2 pr-4">Proveedor</th>
                <th className="pr-4">Precio</th>
                <th className="pr-4">Metodología</th>
                <th className="pr-4">Entregables</th>
                <th>Contrato</th>
              </tr>
            </thead>
            <tbody>
              {v.providers.map((p) => (
                <tr key={p.id} className="border-b border-stage-line align-top">
                  <td className="py-3 pr-4 font-bold">
                    {p.id} · {p.name}
                  </td>
                  <td className="pr-4">
                    {usd(p.price)}
                    {p.priceNote && <span className="muted block text-[20px]">{p.priceNote}</span>}
                  </td>
                  <td className="pr-4">{p.methodology}</td>
                  <td className="pr-4">{p.deliverables}</td>
                  <td>{p.contract}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted mt-4">Canastas enviadas: {v.submitted.basket}</p>
        </div>
      );
    case 'hallazgo':
      return (
        <div className="grid gap-8 xl:grid-cols-2">
          <FindingCard v={v} big />
          <div className="panel">
            <h2 className="mb-4">Calculadora (valores por defecto)</h2>
            <LossChart {...expectedLoss(v.calcDefaults)} dark />
            <p className="muted mt-4">Análisis enviados: {v.submitted.finding}</p>
          </div>
        </div>
      );
    case 'giro':
      return (
        <div className="panel text-center">
          <p className="text-[96px]" aria-hidden="true">
            🔄
          </p>
          <h2 className="text-[56px]">Giro de trama</h2>
          <p className="mt-4">
            {v.twistsDealt
              ? 'Cada junta recibió un imprevisto. Respondan en 400 caracteres.'
              : 'Algo está por pasar…'}
          </p>
          <p className="muted mt-4">Respuestas: {v.submitted.twist}</p>
        </div>
      );
    case 'regla':
      return (
        <div className="panel text-center">
          <h2 className="text-[56px]">Regla de oro</h2>
          <p className="mt-4">Una oración para la Política de Seguridad Aceptable.</p>
          <p className="muted mt-4">Reglas enviadas: {v.submitted.rule}</p>
        </div>
      );
    default:
      return <DebriefGrid v={v} dark />;
  }
}
