import { Link } from 'react-router-dom';
import { CATALOG } from '@ciberjunta/shared';
import { Disclaimer } from '../components/chrome';

export function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-10">
      <header className="mb-10 text-center">
        <p className="mb-2 font-semibold uppercase tracking-widest text-brand-700">
          Seguridad de Sistemas · Gestión de Negocios Digitales
        </p>
        <h1 className="text-5xl text-brand-900 sm:text-6xl">CiberJunta</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-700">
          Su grupo es la junta directiva de una startup. Decidan, prioricen, presupuesten y
          comuniquen riesgos de seguridad como gerentes.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/docente"
          className="card flex min-h-[160px] flex-col items-center justify-center gap-2 text-center hover:border-brand-500 hover:bg-brand-50"
        >
          <span className="text-5xl" aria-hidden="true">
            🎓
          </span>
          <span className="text-2xl font-bold text-brand-900">Soy docente</span>
          <span className="text-slate-700">Crear o retomar una sesión</span>
        </Link>
        <Link
          to="/unirse"
          className="card flex min-h-[160px] flex-col items-center justify-center gap-2 text-center hover:border-brand-500 hover:bg-brand-50"
        >
          <span className="text-5xl" aria-hidden="true">
            👥
          </span>
          <span className="text-2xl font-bold text-brand-900">Soy grupo</span>
          <span className="text-slate-700">Unirse con el código de la clase</span>
        </Link>
      </div>

      <section className="mt-10" aria-labelledby="dinamicas">
        <h2 id="dinamicas" className="mb-3 text-xl">
          Las 7 dinámicas
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {CATALOG.map((g) => (
            <li key={g.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <strong>{g.title}</strong>
              <span className="block text-slate-700">{g.tagline}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-auto pt-10 text-center text-slate-700">
        <Disclaimer className="mb-2 font-semibold" />
        <Link className="underline" to="/seguridad">
          Cómo protegemos esta app
        </Link>
      </footer>
    </main>
  );
}
