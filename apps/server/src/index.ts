import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServer, ServerToClient } from '@ciberjunta/shared';
import { config } from './config.js';
import { createApp } from './http.js';
import { SessionManager } from './engine/sessions.js';
import { createStorage } from './engine/storage.js';
import { registerSockets } from './socket.js';

async function main() {
  const storage = await createStorage(config.databaseUrl);
  const manager = new SessionManager(storage);
  await manager.restore();

  const app = createApp(manager);
  const server = createServer(app);
  const io = new Server<ClientToServer, ServerToClient>(server, {
    maxHttpBufferSize: 32 * 1024,
    pingInterval: 20_000,
    pingTimeout: 25_000,
    serveClient: false,
    cors: config.isProd ? undefined : { origin: ['http://localhost:5173'] },
  });
  manager.attachIo(io);
  registerSockets(io, manager);

  const tick = setInterval(() => manager.tick(), 500);
  const sweep = setInterval(() => manager.sweep(), 60_000);

  server.listen(config.port, () => {
    console.log(`CiberJunta escuchando en http://localhost:${config.port}`);
  });

  const shutdown = () => {
    clearInterval(tick);
    clearInterval(sweep);
    io.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
