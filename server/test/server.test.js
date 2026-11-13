'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const { createApp } = require('../server');
const { normalizeEvent, summarize } = require('../lib/metrics');

const silent = { info() {}, warn() {}, error() {} };
const DAY = 24 * 60 * 60 * 1000;
let dir;
let server;
let base;
let clock;

const post = (url, body, headers = {}) =>
  fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const login = async (usuario = 'uziel', password = 'clave-de-prueba') => post('/api/login', { usuario, password });

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plexiweb-test-'));
  clock = Date.parse('2026-11-13T15:00:00Z');
  const app = createApp({
    env: { ADMIN_USER: 'Uziel', ADMIN_PASSWORD_HASH: bcrypt.hashSync('clave-de-prueba', 4), JWT_SECRET: 'secreto-de-prueba' },
    dataDir: dir,
    logger: silent,
    now: () => clock,
  });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('health responde y dice que el panel está habilitado', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, panel: true });
});

test('login: usuario sin importar mayúsculas + contraseña correcta devuelve token', async () => {
  const res = await login('  UZIEL ');
  assert.equal(res.status, 200);
  assert.match((await res.json()).token, /^[\w-]+\.[\w-]+\.[\w-]+$/);
});

test('login: contraseña o usuario incorrectos dan 401 con el mismo mensaje', async () => {
  const mal = await login('uziel', 'otra');
  const otro = await login('otro', 'clave-de-prueba');
  assert.equal(mal.status, 401);
  assert.equal(otro.status, 401);
  assert.equal((await mal.json()).error, (await otro.json()).error);
});

test('login exige JSON y rechaza cuerpos que no son objeto', async () => {
  const sinTipo = await fetch(`${base}/api/login`, { method: 'POST', body: 'usuario=uziel' });
  assert.equal(sinTipo.status, 415);
  const arreglo = await post('/api/login', ['uziel']);
  assert.equal(arreglo.status, 401);
});

test('el resumen exige sesión: sin token, token falso o firmado con otra clave dan 401', async () => {
  assert.equal((await fetch(`${base}/api/admin/metrics`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/metrics`, { headers: { Authorization: 'Bearer abc.def.ghi' } })).status, 401);
  const jwt = require('jsonwebtoken');
  const falso = jwt.sign({ sub: 'uziel' }, 'otra-clave', { algorithm: 'HS256' });
  assert.equal((await fetch(`${base}/api/admin/metrics`, { headers: { Authorization: `Bearer ${falso}` } })).status, 401);
});

test('métricas: se guardan eventos válidos y el panel los resume', async () => {
  const v = 'v_test_1';
  assert.equal((await post('/api/metrics', { tipo: 'visita', visitanteId: v, origen: 'instagram', dispositivo: 'm' })).status, 201);
  assert.equal((await post('/api/metrics', { tipo: 'click_whatsapp', visitanteId: v, cta: 'hero' })).status, 201);
  assert.equal((await post('/api/metrics', { tipo: 'click_portfolio', visitanteId: v, proyecto: 'electrotest.com.ar' })).status, 201);
  await new Promise((r) => setTimeout(r, 50)); // record() es asíncrono

  const { token } = await (await login()).json();
  const res = await fetch(`${base}/api/admin/metrics`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.traffic.visits, 1);
  assert.equal(d.traffic.unique, 1);
  assert.deepEqual(d.funnel, { visited: 1, openedProject: 1, clickedWhatsapp: 1 });
  assert.deepEqual(d.ctas, [{ id: 'hero', clicks: 1 }]);
  assert.deepEqual(d.projects, [{ id: 'electrotest.com.ar', clicks: 1 }]);
  assert.deepEqual(d.sources, [{ id: 'instagram', visits: 1 }]);
  assert.equal(d.daily.length, 14);
});

test('métricas: eventos inválidos dan 400 y no exigen sesión', async () => {
  for (const body of [
    { tipo: 'hackeo' },
    { tipo: 'click_whatsapp' },
    { tipo: 'click_whatsapp', cta: '<script>' },
    { tipo: 'click_portfolio', proyecto: 'no es un host' },
    [],
  ]) {
    assert.equal((await post('/api/metrics', body)).status, 400, JSON.stringify(body));
  }
  const sinTipo = await fetch(`${base}/api/metrics`, { method: 'POST', body: '{}' });
  assert.equal(sinTipo.status, 415);
});

test('normalizeEvent: acepta proyectos de github.io con carpeta y rechaza espacios o caracteres raros', () => {
  assert.equal(normalizeEvent({ tipo: 'click_portfolio', proyecto: 'uziel44.github.io/betty' }, 1).p, 'uziel44.github.io/betty');
  assert.equal(normalizeEvent({ tipo: 'click_portfolio', proyecto: 'a b' }, 1), null);
  assert.equal(normalizeEvent({ tipo: 'click_portfolio', proyecto: 'x.com/<s>' }, 1), null);
});

test('rutas /api inexistentes dan 404 en JSON', async () => {
  const res = await fetch(`${base}/api/nada`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, 'no_encontrado');
});

test('login: tras 10 intentos fallidos seguidos responde 429', async () => {
  let ultimo;
  for (let i = 0; i < 12; i += 1) ultimo = await login('uziel', `mal${i}`);
  assert.equal(ultimo.status, 429);
  assert.ok(Number(ultimo.headers.get('retry-after')) >= 1);
});

test('sin ADMIN_PASSWORD_HASH el panel queda deshabilitado (503) pero la API de métricas sigue', async () => {
  const app = createApp({ env: {}, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'plexiweb-off-')), logger: silent });
  const s = await new Promise((resolve) => { const x = app.listen(0, '127.0.0.1', () => resolve(x)); });
  try {
    const url = `http://127.0.0.1:${s.address().port}`;
    const res = await fetch(`${url}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'a', password: 'b' }) });
    assert.equal(res.status, 503);
    const met = await fetch(`${url}/api/metrics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'visita' }) });
    assert.equal(met.status, 201);
  } finally {
    s.close();
  }
});

test('normalizeEvent: normaliza a minúsculas y descarta campos inválidos sin rechazar el evento', () => {
  const e = normalizeEvent({ tipo: 'visita', visitanteId: 'bad id!', origen: 'Instagram', dispositivo: 'x' }, 5);
  assert.deepEqual(e, { t: 5, tipo: 'visita', o: 'instagram' });
});

test('summarize: nuevas vs que volvieron, y cuenta solo los últimos 30 días', () => {
  const now = Date.parse('2026-11-13T15:00:00Z');
  const events = [
    { t: now - 60 * DAY, tipo: 'visita', v: 'viejo' }, // vino hace 60 días
    { t: now - 2 * DAY, tipo: 'visita', v: 'viejo' }, // y volvió
    { t: now - 1 * DAY, tipo: 'visita', v: 'nuevo' },
    { t: now - 40 * DAY, tipo: 'visita', v: 'fuera' }, // fuera de los 30 días
  ];
  const d = summarize({ events, now });
  assert.equal(d.traffic.visits, 2);
  assert.equal(d.traffic.unique, 2);
  assert.equal(d.traffic.new, 1);
  assert.equal(d.traffic.returning, 1);
});
