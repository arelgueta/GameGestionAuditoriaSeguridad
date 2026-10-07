import { Link } from 'react-router-dom';

const ITEMS: { icon: string; title: string; text: string; concept: string }[] = [
  {
    icon: '🙈',
    title: 'No pedimos datos personales',
    text: 'Para jugar alcanza con un nombre de grupo y apodos. No pedimos mails, DNI ni contraseñas. Lo que no se recolecta no se puede filtrar.',
    concept: 'Minimización de datos (Ley 25.326)',
  },
  {
    icon: '🔑',
    title: 'El PIN docente no se guarda “tal cual”',
    text: 'Guardamos una huella (hash) del PIN, no el PIN. Después de varios intentos fallidos, la sesión se bloquea unos minutos para evitar que alguien lo adivine probando.',
    concept: 'Hash de credenciales y bloqueo por intentos',
  },
  {
    icon: '🎟',
    title: 'Pases de acceso temporales',
    text: 'Al validar el PIN, el servidor entrega un “pase” (token) que se usa para cada acción del docente. Cada grupo recibe su propio pase para poder volver si se le cierra la página.',
    concept: 'Autenticación por token y mínimo privilegio',
  },
  {
    icon: '🧹',
    title: 'Todo texto se revisa y se limita',
    text: 'Los textos libres tienen un máximo de 1.500 caracteres, se limpian de caracteres raros y siempre se muestran como texto, nunca como código. Así nadie puede “inyectar” instrucciones en la pantalla de otro.',
    concept: 'Validación de entradas y prevención de XSS',
  },
  {
    icon: '✅',
    title: 'El servidor desconfía de todo lo que llega',
    text: 'Cada acción que envía un dispositivo se valida contra un esquema estricto. Si no cumple, se descarta. Los puntajes, dados y temporizadores se calculan en el servidor, no en el celular.',
    concept: 'Validación del lado del servidor',
  },
  {
    icon: '🚦',
    title: 'Límite de velocidad',
    text: 'Cada conexión puede enviar como máximo unas 10 acciones por segundo, y hay un límite de sesiones nuevas por red. Esto frena abusos y ataques de saturación.',
    concept: 'Rate limiting',
  },
  {
    icon: '⌛',
    title: 'Las sesiones vencen',
    text: 'Las sesiones viven en la memoria del servidor y se borran solas después de un tiempo sin actividad. Por eso el docente debe exportar los resultados al terminar.',
    concept: 'Retención mínima y ciclo de vida del dato',
  },
  {
    icon: '🛡',
    title: 'Cabeceras de seguridad',
    text: 'El navegador recibe reglas estrictas: solo puede cargar código de este mismo sitio, no puede mostrarse dentro de otra página y no envía de dónde venís.',
    concept: 'Content Security Policy, anti-clickjacking y Referrer-Policy',
  },
  {
    icon: '🚫',
    title: 'Sin rastreadores',
    text: 'No usamos analytics, publicidad ni servicios de terceros que sigan lo que hacen. Los sonidos se generan en el propio navegador.',
    concept: 'Privacidad por diseño',
  },
  {
    icon: '🎲',
    title: 'Azar auditable',
    text: 'Los dados y cartas usan una “semilla” que se guarda en la exportación. Con ella se puede verificar que nadie manipuló los resultados.',
    concept: 'Trazabilidad e integridad',
  },
];

export function Security() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <nav className="mb-4">
        <Link to="/" className="underline">
          ← Inicio
        </Link>
      </nav>
      <h1 className="mb-2 text-4xl text-brand-900">Cómo protegemos esta app</h1>
      <p className="mb-8 text-lg text-slate-700">
        Es un juego de seguridad: la app tiene que dar el ejemplo. Estas son las decisiones que
        tomamos, en lenguaje simple. ¿Cuáles aplicarían en su startup?
      </p>
      <ul className="grid gap-4 md:grid-cols-2">
        {ITEMS.map((it) => (
          <li key={it.title} className="card">
            <h2 className="mb-2 flex items-center gap-2 text-xl">
              <span aria-hidden="true">{it.icon}</span>
              {it.title}
            </h2>
            <p className="mb-3">{it.text}</p>
            <p className="chip bg-brand-50 text-brand-800">{it.concept}</p>
          </li>
        ))}
      </ul>
      <section className="card mt-8">
        <h2 className="mb-2 text-xl">Lo que no podemos garantizar</h2>
        <p>
          Ningún sistema es 100% seguro. Si el servidor se reinicia, las sesiones activas se pierden
          (por eso existe la exportación). Si detectan un problema, avisen al docente: reportar es
          parte de la cultura de seguridad.
        </p>
      </section>
    </main>
  );
}
