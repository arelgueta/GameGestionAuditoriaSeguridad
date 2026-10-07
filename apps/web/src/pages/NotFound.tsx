import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="mb-4 text-3xl">Página no encontrada</h1>
      <Link to="/" className="btn-primary">
        Volver al inicio
      </Link>
    </main>
  );
}
