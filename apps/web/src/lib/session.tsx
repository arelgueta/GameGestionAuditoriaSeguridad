import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Ack, Cue, GroupJoinInput, HostActionInput, StatePayload } from '@ciberjunta/shared';
import { play } from './sound';
import { toast } from './toast';
import { keys, save } from './storage';

export type Role = 'host' | 'screen' | 'group';

export interface SessionApi {
  payload: StatePayload | null;
  connected: boolean;
  error: string | null;
  closed: string | null;
  /** Reloj de juego estimado (sincronizado con el servidor). */
  gameNow: () => number;
  groupAct: (action: unknown) => Promise<boolean>;
  hostAct: (action: HostActionInput) => Promise<boolean>;
  gameAct: (action: unknown) => Promise<boolean>;
  join: (input: GroupJoinInput) => Promise<{ groupId: string; groupToken: string } | null>;
}

interface Options {
  role: Role;
  code: string;
  token: string | null;
  onUnauthorized?: () => void;
}

export function useSocketSession({ role, code, token, onUnauthorized }: Options): SessionApi {
  const [payload, setPayload] = useState<StatePayload | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const receivedAt = useRef(Date.now());
  const payloadRef = useRef<StatePayload | null>(null);
  const unauthorizedRef = useRef(onUnauthorized);
  unauthorizedRef.current = onUnauthorized;

  useEffect(() => {
    const socket = io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
    socketRef.current = socket;

    const attach = () => {
      const fail = (r: Ack) => {
        if (!r.ok) {
          setError(r.error);
          unauthorizedRef.current?.();
        } else setError(null);
      };
      if (role === 'host' && token) socket.emit('host:attach', { code, hostToken: token }, fail);
      else if (role === 'screen') socket.emit('screen:attach', { code }, fail);
      else if (role === 'group' && token)
        socket.emit('group:attach', { code, groupToken: token }, fail);
    };

    socket.on('connect', () => {
      setConnected(true);
      attach();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('state', (p: StatePayload) => {
      receivedAt.current = Date.now();
      payloadRef.current = p;
      setPayload(p);
      if (p.role === 'host') save(keys.lastHostState(code), { savedAt: Date.now(), ...p });
    });
    socket.on('cue', (c: Cue) => play(c));
    socket.on('toast', (t: { kind: 'info' | 'error' | 'success'; text: string }) =>
      toast(t.text, t.kind),
    );
    socket.on('closed', (reason: string) => setClosed(reason));
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [role, code, token]);

  const emit = useCallback(
    async <T,>(event: string, input: unknown): Promise<Ack<T & Record<string, unknown>> | null> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        toast('Sin conexión con el servidor. Reintentando…', 'error');
        return null;
      }
      try {
        const r = (await socket.timeout(8000).emitWithAck(event, input)) as Ack<
          T & Record<string, unknown>
        >;
        if (!r.ok) toast(r.error, 'error');
        return r;
      } catch {
        toast('El servidor no respondió. Probá de nuevo.', 'error');
        return null;
      }
    },
    [],
  );

  const gameNow = useCallback(() => {
    const p = payloadRef.current;
    if (!p) return Date.now();
    return p.meta.paused ? p.meta.serverNow : p.meta.serverNow + (Date.now() - receivedAt.current);
  }, []);

  return {
    payload,
    connected,
    error,
    closed,
    gameNow,
    groupAct: async (action) => !!(await emit('group:action', action))?.ok,
    hostAct: async (action) => !!(await emit('host:action', action))?.ok,
    gameAct: async (action) => !!(await emit('host:action', { type: 'game', action }))?.ok,
    join: async (input) => {
      const r = await emit<{ groupId: string; groupToken: string }>('group:join', input);
      return r && r.ok ? { groupId: r.groupId, groupToken: r.groupToken } : null;
    },
  };
}

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ value, children }: { value: SessionApi; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession fuera de SessionProvider');
  return v;
}

/** Fuerza un re-render periódico (para relojes). */
export function useNow(intervalMs = 250) {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
