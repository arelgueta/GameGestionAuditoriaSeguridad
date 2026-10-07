import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { codeSchema, createSessionSchema, hostLoginSchema, tokenSchema } from '@ciberjunta/shared';
import { config } from './config.js';
import type { SessionManager } from './engine/sessions.js';
import { GameError } from './engine/types.js';

export function createApp(manager: SessionManager) {
  const app = express();
  app.disable('x-powered-by');
  // Render (y casi cualquier PaaS) pone un proxy adelante: confiar en el primer salto.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: [
            "'self'",
            (req) => `${config.isProd ? 'wss' : 'ws'}://${(req as Request).headers.host ?? ''}`,
          ],
          mediaSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    );
    next();
  });
  app.use(express.json({ limit: '20kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, sessions: manager.size });
  });

  const createLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: config.isProd ? 15 : 500,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiadas sesiones creadas desde esta red. Esperen unos minutos.' },
  });
  const loginLimiter = rateLimit({
    windowMs: 5 * 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Esperen unos minutos.' },
  });
  const readLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });

  app.post('/api/sessions', createLimiter, (req, res) => {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success)
      return void res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
    res.status(201).json(manager.create(parsed.data));
  });

  app.post('/api/sessions/:code/host-login', loginLimiter, (req, res) => {
    const code = codeSchema.safeParse(req.params.code);
    const body = hostLoginSchema.safeParse(req.body);
    if (!code.success || !body.success)
      return void res.status(400).json({ error: 'Datos inválidos' });
    res.json({ hostToken: manager.hostLogin(code.data, body.data.pin) });
  });

  app.get('/api/sessions/:code', readLimiter, (req, res) => {
    const code = codeSchema.safeParse(req.params.code);
    if (!code.success || !manager.has(code.data))
      return void res.status(404).json({ error: 'No existe una sesión con ese código.' });
    const s = manager.get(code.data);
    const a = manager.act(s);
    res.json({ code: s.code, gameId: a.gameId, status: a.status });
  });

  function requireHost(req: Request, res: Response): string | null {
    const code = codeSchema.safeParse(req.params.code);
    const token = tokenSchema.safeParse(
      (req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''),
    );
    if (!code.success || !token.success || !manager.verifyHost(code.data, token.data)) {
      res.status(401).json({ error: 'No autorizado' });
      return null;
    }
    return code.data;
  }

  app.get('/api/sessions/:code/export.json', readLimiter, (req, res) => {
    const code = requireHost(req, res);
    if (!code) return;
    res.setHeader('Content-Disposition', `attachment; filename="ciberjunta-${code}.json"`);
    res.json(manager.exportJson(code));
  });

  app.get('/api/sessions/:code/export.csv', readLimiter, (req, res) => {
    const code = requireHost(req, res);
    if (!code) return;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ciberjunta-${code}.csv"`);
    res.send(manager.exportCsv(code));
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'No encontrado' });
  });

  // Frontend compilado (SPA).
  if (existsSync(config.webDist)) {
    app.use(
      express.static(config.webDist, {
        index: false,
        setHeaders: (res, file) => {
          if (file.includes(`${path.sep}assets${path.sep}`))
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get(/^(?!\/(api|socket\.io)\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.webDist, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .type('text')
        .send(
          'CiberJunta API. El frontend no está compilado: ejecutá "npm run build" o usá "npm run dev".',
        );
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof GameError) return void res.status(400).json({ error: err.message });
    if ((err as { type?: string }).type === 'entity.too.large')
      return void res.status(413).json({ error: 'Pedido demasiado grande' });
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  });

  return app;
}
