// Prueba de carga simple: 15 grupos simultáneos en una sesión de crisis.
// Uso: levantar el servidor (npm run build && npm start) y luego
//   node scripts/load-test.mjs [http://localhost:3001] [cantidad]
import { io } from 'socket.io-client';

const BASE = process.argv[2] ?? 'http://localhost:3001';
const N = Number(process.argv[3] ?? 15);

const res = await fetch(`${BASE}/api/sessions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ gameId: 'crisis', pin: '9999', config: { injectSec: 60 } }),
});
if (!res.ok) throw new Error(`No se pudo crear la sesión: ${res.status}`);
const { code, hostToken } = await res.json();
console.log(`Sesión ${code}: conectando ${N} grupos…`);

const connect = () =>
  new Promise((resolve, reject) => {
    const s = io(BASE, { transports: ['websocket'], forceNew: true });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });

const host = await connect();
const ok = (r) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};
ok(await host.emitWithAck('host:attach', { code, hostToken }));

let states = 0;
const groups = [];
for (let i = 0; i < N; i++) {
  const s = await connect();
  s.on('state', () => states++);
  ok(
    await s.emitWithAck('group:join', {
      code,
      name: `Grupo ${i + 1}`,
      startup: `Startup ${i + 1}`,
      roles: {},
    }),
  );
  groups.push(s);
}

const t0 = performance.now();
ok(await host.emitWithAck('host:action', { type: 'start' }));
const latencies = [];
for (let inject = 0; inject < 9; inject++) {
  ok(await host.emitWithAck('host:action', { type: 'game', action: { type: 'nextInject' } }));
  await Promise.all(
    groups.map(async (s) => {
      const t = performance.now();
      ok(
        await s.emitWithAck('group:action', {
          type: 'decide',
          inject,
          option: 'A',
          justification: 'Prueba de carga',
        }),
      );
      latencies.push(performance.now() - t);
    }),
  );
}
latencies.sort((a, b) => a - b);
const p = (q) => latencies[Math.floor(q * (latencies.length - 1))].toFixed(1);
console.log(`${latencies.length} decisiones en ${(performance.now() - t0).toFixed(0)} ms`);
console.log(`Latencia p50 ${p(0.5)} ms · p95 ${p(0.95)} ms · máx ${p(1)} ms`);
console.log(`Estados recibidos por los grupos: ${states}`);
for (const s of [host, ...groups]) s.close();
