'use strict';

// Backend chico de la landing de Plexiweb. Caddy sirve la web estatica (index.html, css, js, admin.html) y
// solo le manda /api/* y /uploads/* a este servidor: login del panel, metricas anonimas y las tarjetas del
// portfolio que se editan desde el panel. Si este contenedor se cae, la landing sigue en pie con su HTML
// (solo dejan de contarse las visitas y de verse los cambios hechos desde el panel).

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');

const { createAuth } = require('./lib/auth');
const { AdminError, createCardStore } = require('./lib/cards');
const { createMetricsStore, normalizeEvent, summarize } = require('./lib/metrics');
const { createRateLimiter } = require('./lib/ratelimit');

const DAY_MS = 24 * 60 * 60 * 1000;
const JSON_CONTENT_TYPE = /^application\/(?:[\w.+-]+\+)?json\b/i;
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const UPLOADED_FILE = /^\/[a-f0-9]{32}\.(?:jpg|png|webp)$/;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const consoleLogger = Object.fromEntries(
  ['info', 'warn', 'error'].map((level) => [
    level,
    (msg, fields = {}) => console[level === 'info' ? 'log' : level](JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields })),
  ]),
);

const errorBody = (code, message) => ({ error: message, code });

function parseTrustProxy(value) {
  if (!value) return false;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function createApp({
  env = process.env,
  dataDir = path.join(__dirname, 'data'),
  logger = consoleLogger,
  now = Date.now,
} = {}) {
  const auth = createAuth({ env, logger });
  const metrics = createMetricsStore(dataDir, { now });
  const cards = createCardStore({ dataDir });
  const loginLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60_000, now });
  const metricsLimiter = createRateLimiter({ limit: 120, windowMs: 60_000, now }); // de sobra para una persona; corta rafagas automaticas
  const cardsLimiter = createRateLimiter({ limit: 120, windowMs: 60_000, now }); // la landing lo pide una vez por visita

  // Una vez al dia se descartan los eventos de metricas de mas de 90 dias.
  metrics.prune().catch((err) => logger.error('metrics.prune_fallo', { reason: err.message }));
  setInterval(() => metrics.prune().catch(() => {}), DAY_MS).unref();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', parseTrustProxy(env.TRUST_PROXY));

  // Cabeceras comunes y request id. Sin CORS: la web y la API son el mismo dominio.
  app.use((req, res, next) => {
    req.id = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    return next();
  });

  const limit = (limiter, name, message = 'Demasiados intentos. Esperá un minuto y probá de nuevo.') => (req, res, next) => {
    const result = limiter.check(req.ip);
    if (result.ok) return next();
    logger.warn('rate_limit', { route: name, requestId: req.id });
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
    return res.status(429).json(errorBody('demasiadas_solicitudes', message));
  };

  const requireJson = (req, res, next) => {
    if (JSON_CONTENT_TYPE.test(req.get('content-type') || '')) return next();
    return res.status(415).json(errorBody('content_type_invalido', 'Content-Type debe ser application/json.'));
  };
  const jsonBody = express.json({ limit: '4kb', strict: true });

  app.get('/api/health', (req, res) => res.json({ ok: true, panel: auth.enabled }));

  // Tarjetas del portfolio: la landing las pide al cargar. Si nadie las editó, responde custom:false y la web deja su HTML.
  app.get('/api/cards', limit(cardsLimiter, 'cards'), (req, res) => res.json(cards.publicView()));

  // La landing manda eventos anonimos; el panel los resume.
  app.post('/api/metrics', limit(metricsLimiter, 'metrics'), requireJson, jsonBody, (req, res) => {
    const event = normalizeEvent(req.body, now());
    if (!event) return res.status(400).json(errorBody('evento_invalido', 'Evento inválido.'));
    metrics.record(event).catch((err) => logger.error('metrics.no_guardado', { reason: err.message }));
    return res.status(201).json({ ok: true });
  });

  // Panel (/admin.html): un usuario, sesion con JWT de 12 h.
  app.post(
    '/api/login',
    limit(loginLimiter, 'login', 'Demasiados intentos. Probá de nuevo en unos minutos.'),
    requireJson,
    jsonBody,
    async (req, res) => {
      if (!auth.enabled) {
        return res.status(503).json(errorBody('panel_no_configurado', 'El panel todavía no está habilitado en el servidor.'));
      }
      const { usuario, password } = isObject(req.body) ? req.body : {};
      const token = await auth.login(usuario, password);
      if (!token) {
        // No se loguea el usuario tipeado: a veces es la contrasena escrita en el campo equivocado.
        logger.warn('admin.login_fallido', { requestId: req.id });
        return res.status(401).json(errorBody('credenciales_invalidas', 'Usuario o contraseña incorrectos.'));
      }
      logger.info('admin.login', { requestId: req.id });
      return res.json({ token });
    },
  );

  const admin = express.Router();
  admin.use((req, res, next) => {
    if (!auth.enabled) return res.status(503).json(errorBody('panel_no_configurado', 'El panel todavía no está habilitado en el servidor.'));
    if (!auth.isValidRequest(req)) return res.status(401).json(errorBody('no_autorizado', 'La sesión no es válida o caducó. Iniciá sesión de nuevo.'));
    return next();
  });
  admin.get('/metrics', (req, res) => res.json(summarize({ events: metrics.readEvents(), now: now() })));

  // Tarjetas del portfolio: alta, edición, baja, orden e imágenes.
  admin.get('/cards', (req, res) => res.json(cards.view()));
  admin.post('/cards', requireJson, jsonBody, async (req, res) => res.status(201).json(await cards.create(req.body)));
  admin.put('/cards-order', requireJson, jsonBody, async (req, res) => {
    await cards.reorder(isObject(req.body) ? req.body.ids : undefined);
    res.json({ ok: true });
  });
  admin.put('/cards/:id', requireJson, jsonBody, async (req, res) => res.json(await cards.update(req.params.id, req.body)));
  admin.delete('/cards/:id', async (req, res) => {
    await cards.remove(req.params.id);
    res.json({ ok: true });
  });
  admin.post(
    '/images',
    (req, res, next) => {
      if (!req.is(UPLOAD_TYPES)) return res.status(415).json(errorBody('tipo_no_soportado', 'Subí una imagen JPG, PNG o WebP.'));
      return next();
    },
    express.raw({ type: UPLOAD_TYPES, limit: '8mb' }),
    async (req, res) => res.status(201).json({ url: await cards.saveImage(req.body) }),
  );
  app.use('/api/admin', admin);

  // Imágenes subidas desde el panel: nombre aleatorio e inmutable, así que caché larga. Solo se sirve un nombre válido.
  app.use(
    '/uploads',
    (req, res, next) => (UPLOADED_FILE.test(req.path) ? next() : res.status(404).end()),
    express.static(path.join(dataDir, 'uploads'), { dotfiles: 'ignore', index: false, redirect: false, maxAge: '365d', immutable: true }),
  );

  app.use((req, res) => res.status(404).json(errorBody('no_encontrado', 'Ruta inexistente.')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof AdminError) return res.status(err.status).json({ ...errorBody(err.code, err.message), ...(err.field ? { field: err.field } : {}) });
    if (err.type === 'entity.too.large') return res.status(413).json(errorBody('body_demasiado_grande', 'El pedido o el archivo es demasiado grande.'));
    if (err.type === 'entity.parse.failed' || err.type === 'encoding.unsupported' || err.type === 'charset.unsupported') {
      return res.status(400).json(errorBody('json_invalido', 'El cuerpo no es un JSON válido.'));
    }
    logger.error('error_interno', { requestId: req.id, reason: err.message });
    return res.status(500).json(errorBody('error_interno', 'Ocurrió un error. Probá de nuevo en unos minutos.'));
  });

  return app;
}

function start() {
  try {
    process.loadEnvFile(path.join(__dirname, '.env'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const port = Number(process.env.PORT) || 3006;
  const host = process.env.HOST || '127.0.0.1';
  const app = createApp();
  const server = app.listen(port, host, () => {
    consoleLogger.info('server.listening', { url: `http://${host}:${port}` });
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}

if (require.main === module) start();

module.exports = { createApp };
