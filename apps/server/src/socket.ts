import type { Server, Socket } from 'socket.io';
import {
  type Ack,
  type ClientToServer,
  type ServerToClient,
  groupAttachSchema,
  groupJoinSchema,
  hostActionSchema,
  hostAttachSchema,
  screenAttachSchema,
} from '@ciberjunta/shared';
import { config } from './config.js';
import { rooms, type SessionManager } from './engine/sessions.js';
import { KeyedLimiter, TokenBucket } from './engine/security.js';
import { GameError } from './engine/types.js';

interface SocketData {
  code?: string;
  role?: 'host' | 'screen' | 'group';
  groupId?: string;
  bucket: TokenBucket;
  ip: string;
}

type S = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

const joinLimiter = new KeyedLimiter(config.isProd ? 40 : 1000, 10 * 60_000);

function clientIp(socket: S): string {
  const fwd = socket.handshake.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || socket.handshake.address;
}

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof GameError) return { ok: false, error: err.message };
  console.error(err);
  return { ok: false, error: 'Ocurrió un error inesperado.' };
}

export function registerSockets(
  io: Server<ClientToServer, ServerToClient>,
  manager: SessionManager,
) {
  io.on('connection', (raw) => {
    const socket = raw as S;
    socket.data = { bucket: new TokenBucket(10, 20), ip: clientIp(socket) };

    /** Envuelve cada handler: rate limit, ack seguro y manejo de errores. */
    function on<E extends keyof ClientToServer>(
      event: E,
      handler: (input: unknown) => Ack<Record<string, unknown>> | void,
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.on(event, ((input: unknown, ack?: (r: any) => void) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (!socket.data.bucket.take())
          return reply({ ok: false, error: 'Demasiadas acciones seguidas. Esperen un momento.' });
        try {
          reply(handler(input) ?? { ok: true });
        } catch (err) {
          reply(fail(err));
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any);
    }

    function leaveCurrent() {
      const { code, role, groupId } = socket.data;
      if (!code) return;
      for (const r of socket.rooms) if (r !== socket.id) void socket.leave(r);
      if (role === 'group' && groupId) manager.connect(code, groupId, -1);
      socket.data.code = socket.data.role = socket.data.groupId = undefined;
    }

    function attach(code: string, role: 'host' | 'screen' | 'group', groupId?: string) {
      leaveCurrent();
      socket.data.code = code;
      socket.data.role = role;
      socket.data.groupId = groupId;
      void socket.join(rooms.all(code));
      if (role === 'host') void socket.join(rooms.host(code));
      if (role === 'screen') void socket.join(rooms.screen(code));
      if (role === 'group' && groupId) {
        void socket.join(rooms.group(code, groupId));
        manager.connect(code, groupId, 1);
      }
      const s = manager.get(code);
      const payload =
        role === 'host'
          ? manager.hostPayload(s)
          : role === 'screen'
            ? manager.screenPayload(s)
            : manager.groupPayload(s, groupId!);
      if (payload) socket.emit('state', payload);
    }

    on('host:attach', (input) => {
      const p = hostAttachSchema.safeParse(input);
      if (!p.success || !manager.verifyHost(p.data.code, p.data.hostToken))
        throw new GameError('No autorizado: volvé a ingresar el PIN.');
      attach(p.data.code, 'host');
    });

    on('screen:attach', (input) => {
      const p = screenAttachSchema.safeParse(input);
      if (!p.success) throw new GameError('Código inválido.');
      manager.get(p.data.code);
      attach(p.data.code, 'screen');
    });

    on('group:join', (input) => {
      if (!joinLimiter.allow(socket.data.ip))
        throw new GameError('Demasiados ingresos desde esta red. Esperen unos minutos.');
      const p = groupJoinSchema.safeParse(input);
      if (!p.success) throw new GameError(p.error.issues[0]?.message ?? 'Datos inválidos.');
      const r = manager.joinGroup(p.data.code, p.data);
      attach(p.data.code, 'group', r.groupId);
      return { ok: true, ...r };
    });

    on('group:attach', (input) => {
      const p = groupAttachSchema.safeParse(input);
      const gid = p.success ? manager.verifyGroup(p.data.code, p.data.groupToken) : null;
      if (!p.success || !gid) throw new GameError('No encontramos a su grupo en esta sesión.');
      attach(p.data.code, 'group', gid);
    });

    on('host:action', (input) => {
      const { code, role } = socket.data;
      if (!code || role !== 'host') throw new GameError('No autorizado.');
      const p = hostActionSchema.safeParse(input);
      if (!p.success) throw new GameError('Acción inválida.');
      manager.hostAction(code, p.data);
    });

    on('group:action', (input) => {
      const { code, role, groupId } = socket.data;
      if (!code || role !== 'group' || !groupId)
        throw new GameError('Primero únanse a una sesión.');
      if (!manager.verifyGroupId(code, groupId))
        throw new GameError('Este grupo ya no forma parte de la sesión.');
      manager.groupAction(code, groupId, input);
    });

    socket.on('disconnect', () => leaveCurrent());
  });
}
