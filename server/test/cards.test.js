'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const { createApp } = require('../server');
const { createCardStore } = require('../lib/cards');

const silent = { info() {}, warn() {}, error() {} };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(32, 2)]);
const card = (over = {}) => ({ title: 'Mi web', description: 'Descripción', link: 'https://miweb.com', image: 'assets/home/elec-full.jpg', tall: false, ...over });

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `plexiweb-${name}-`));

// ---------------------------------------------------------------- store

test('semilla: sin ediciones el panel ve las 15 tarjetas y la landing recibe custom:false', () => {
  const store = createCardStore({ dataDir: tmp('seed') });
  const v = store.view();
  assert.equal(v.custom, false);
  assert.equal(v.cards.length, 15);
  assert.deepEqual(store.publicView(), { custom: false });
});

test('la primera edición guarda todo (semilla + cambio) y la landing pasa a recibir custom:true', async () => {
  const dir = tmp('first');
  const store = createCardStore({ dataDir: dir });
  const created = await store.create(card());
  assert.match(created.id, /^c_[a-f0-9]{10}$/);
  const pub = store.publicView();
  assert.equal(pub.custom, true);
  assert.equal(pub.cards.length, 16);
  assert.equal(pub.cards.at(-1).id, created.id);
  assert.ok(fs.existsSync(path.join(dir, 'cards.json')));
});

test('create valida: título obligatorio, límites, link http(s), imagen permitida', async () => {
  const store = createCardStore({ dataDir: tmp('val') });
  const bad = (over, field) => assert.rejects(store.create(card(over)), (e) => e.status === 400 && (!field || e.field === field));
  await bad({ title: '   ' }, 'Título');
  await bad({ title: 'x'.repeat(81) }, 'Título');
  await bad({ description: 'x'.repeat(141) }, 'Descripción');
  await bad({ link: 'javascript:alert(1)' }, 'link');
  await bad({ link: 'data://text/html,hola' }, 'link');
  await bad({ link: 'ftp://sitio.com' }, 'link');
  await bad({ link: 'no es un link' }, 'link');
  await bad({ image: '../../etc/passwd' }, 'image');
  await bad({ image: 'assets/home/../../server.js' }, 'image');
  await bad({ image: 'https://otro.com/x.png' }, 'image');
  await bad({ image: 'uploads/00000000000000000000000000000000.png' }, 'image'); // no existe en el disco
  await assert.rejects(store.create(null), (e) => e.status === 400);
});

test('link: sin protocolo se completa con https://, vacío es válido (tarjeta sin enlace)', async () => {
  const store = createCardStore({ dataDir: tmp('link') });
  assert.equal((await store.create(card({ link: 'miweb.com.ar/ruta' }))).link, 'https://miweb.com.ar/ruta');
  assert.equal((await store.create(card({ link: '' }))).link, '');
  assert.equal((await store.create(card({ link: undefined }))).link, '');
});

test('update y remove: 404 si la tarjeta ya no existe; update conserva el id', async () => {
  const store = createCardStore({ dataDir: tmp('upd') });
  const c = await store.create(card());
  const u = await store.update(c.id, card({ title: 'Nuevo título', tall: true }));
  assert.equal(u.id, c.id);
  assert.equal(u.title, 'Nuevo título');
  assert.equal(u.tall, true);
  await assert.rejects(store.update('c_noexiste1', card()), (e) => e.status === 404);
  await store.remove(c.id);
  await assert.rejects(store.remove(c.id), (e) => e.status === 404);
});

test('reorder: aplica el nuevo orden y rechaza listas incompletas, repetidas o ajenas', async () => {
  const store = createCardStore({ dataDir: tmp('ord') });
  const ids = store.view().cards.map((c) => c.id);
  const reversed = [...ids].reverse();
  await store.reorder(reversed);
  assert.deepEqual(store.view().cards.map((c) => c.id), reversed);
  await assert.rejects(store.reorder(reversed.slice(1)), (e) => e.status === 409);
  await assert.rejects(store.reorder([...reversed.slice(1), reversed[1]]), (e) => e.status === 409);
  await assert.rejects(store.reorder([...reversed.slice(1), 'c_ajena0001']), (e) => e.status === 409);
  await assert.rejects(store.reorder('no-es-lista'), (e) => e.status === 400);
  await assert.rejects(store.reorder(['../x']), (e) => e.status === 400);
});

test('máximo de 40 tarjetas', async () => {
  const store = createCardStore({ dataDir: tmp('max') });
  for (let i = store.view().cards.length; i < 40; i += 1) await store.create(card({ title: `T${i}` }));
  await assert.rejects(store.create(card()), (e) => e.status === 400 && /máximo/.test(e.message));
});

test('imágenes: se detecta el tipo por los bytes; al reemplazar o borrar se limpia el archivo subido', async () => {
  const dir = tmp('img');
  const store = createCardStore({ dataDir: dir });
  await assert.rejects(store.saveImage(Buffer.from('<?php echo 1; ?>  ......')), (e) => e.status === 400);
  await assert.rejects(store.saveImage(Buffer.alloc(0)), (e) => e.status === 400);
  const a = await store.saveImage(PNG);
  const b = await store.saveImage(WEBP);
  assert.match(a, /^uploads\/[a-f0-9]{32}\.png$/);
  assert.match(b, /^uploads\/[a-f0-9]{32}\.webp$/);
  const c = await store.create(card({ image: a }));
  assert.ok(fs.existsSync(path.join(dir, a)));
  await store.update(c.id, card({ image: b }));
  assert.equal(fs.existsSync(path.join(dir, a)), false, 'la imagen reemplazada se borra');
  await store.remove(c.id);
  assert.equal(fs.existsSync(path.join(dir, b)), false, 'la imagen de la tarjeta borrada se borra');
});

test('una imagen del repo (assets/home) nunca se borra del disco', async () => {
  const dir = tmp('static');
  const store = createCardStore({ dataDir: dir });
  const first = store.view().cards[0];
  await store.remove(first.id);
  assert.equal(store.view().cards.some((c) => c.id === first.id), false);
});

test('escrituras simultáneas no se pisan', async () => {
  const store = createCardStore({ dataDir: tmp('conc') });
  await Promise.all(Array.from({ length: 10 }, (_, i) => store.create(card({ title: `Paralela ${i}` }))));
  assert.equal(store.view().cards.length, 25);
});

test('cards.json roto: falla en vez de pisarlo con la semilla', () => {
  const dir = tmp('broken');
  fs.writeFileSync(path.join(dir, 'cards.json'), '{ esto no es json');
  const store = createCardStore({ dataDir: dir });
  assert.throws(() => store.view());
  assert.throws(() => store.publicView());
});

// ---------------------------------------------------------------- rutas

let server;
let base;
let token;
let dir;
const send = (url, { method = 'GET', json, body, type, auth = true } = {}) => {
  const headers = {};
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (type) headers['Content-Type'] = type;
  return fetch(base + url, { method, headers, body: json !== undefined ? JSON.stringify(json) : body });
};

before(async () => {
  dir = tmp('routes');
  const app = createApp({
    env: { ADMIN_USER: 'uziel', ADMIN_PASSWORD_HASH: bcrypt.hashSync('clave-de-prueba', 4), JWT_SECRET: 'secreto-de-prueba' },
    dataDir: dir,
    logger: silent,
  });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await send('/api/login', { method: 'POST', json: { usuario: 'uziel', password: 'clave-de-prueba' }, auth: false });
  token = (await res.json()).token;
});

after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('GET /api/cards es público y dice custom:false hasta la primera edición', async () => {
  const res = await send('/api/cards', { auth: false });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { custom: false });
});

test('todas las rutas de tarjetas del panel exigen sesión', async () => {
  for (const [method, url] of [['GET', '/api/admin/cards'], ['POST', '/api/admin/cards'], ['PUT', '/api/admin/cards/c_x'], ['DELETE', '/api/admin/cards/c_x'], ['PUT', '/api/admin/cards-order'], ['POST', '/api/admin/images']]) {
    const hasBody = (method === 'POST' || method === 'PUT') && !url.endsWith('images');
    const res = await send(url, { method, json: hasBody ? {} : undefined, auth: false });
    assert.equal(res.status, 401, `${method} ${url}`);
  }
});

test('flujo completo por HTTP: subir imagen, crear, editar, reordenar, ver en la landing y borrar', async () => {
  const up = await send('/api/admin/images', { method: 'POST', body: PNG, type: 'image/png' });
  assert.equal(up.status, 201);
  const { url: image } = await up.json();

  const served = await fetch(`${base}/${image}`);
  assert.equal(served.status, 200);
  assert.match(served.headers.get('cache-control'), /immutable/);
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG);

  const created = await (await send('/api/admin/cards', { method: 'POST', json: card({ title: 'Nueva', image, tall: true }) })).json();
  assert.equal(created.image, image);

  const pub = await (await send('/api/cards', { auth: false })).json();
  assert.equal(pub.custom, true);
  assert.equal(pub.cards.at(-1).title, 'Nueva');

  const edited = await send(`/api/admin/cards/${created.id}`, { method: 'PUT', json: card({ title: 'Editada', image, tall: true }) });
  assert.equal((await edited.json()).title, 'Editada');

  const ids = (await (await send('/api/admin/cards')).json()).cards.map((c) => c.id);
  const reordered = [ids.at(-1), ...ids.slice(0, -1)];
  assert.equal((await send('/api/admin/cards-order', { method: 'PUT', json: { ids: reordered } })).status, 200);
  assert.equal((await (await send('/api/cards', { auth: false })).json()).cards[0].id, created.id);

  const stale = await send('/api/admin/cards-order', { method: 'PUT', json: { ids: reordered.slice(1) } });
  assert.equal(stale.status, 409);

  assert.equal((await send(`/api/admin/cards/${created.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${base}/${image}`)).status, 404, 'la imagen se borra con la tarjeta');
  assert.equal((await send(`/api/admin/cards/${created.id}`, { method: 'DELETE' })).status, 404);
});

test('subida: rechaza tipos no soportados, contenido que no es imagen y archivos de más de 8 MB', async () => {
  assert.equal((await send('/api/admin/images', { method: 'POST', body: 'hola', type: 'text/plain' })).status, 415);
  assert.equal((await send('/api/admin/images', { method: 'POST', body: Buffer.from('<html>no soy una imagen</html>'), type: 'image/png' })).status, 400);
  assert.equal((await send('/api/admin/images', { method: 'POST', body: Buffer.alloc(9 * 1024 * 1024, 1), type: 'image/png' })).status, 413);
});

test('/uploads solo sirve nombres generados por el servidor (nada de recorrer carpetas ni cards.json)', async () => {
  for (const p of ['/uploads/cards.json', '/uploads/../cards.json', '/uploads/%2e%2e/cards.json', '/uploads/', '/uploads/ABC.png', '/uploads/00000000000000000000000000000000.png']) {
    assert.equal((await fetch(base + p)).status, 404, p);
  }
});

test('errores de validación llegan como JSON con el campo y un mensaje legible', async () => {
  const res = await send('/api/admin/cards', { method: 'POST', json: card({ link: 'javascript:alert(1)' }) });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, 'dato_invalido');
  assert.equal(body.field, 'link');
  assert.match(body.error, /http/);
});
