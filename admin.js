(() => {
  'use strict';

  // ---- Configuración ----
  const TOKEN_KEY = 'plexiweb_admin_token';
  const NO_METRICS_KEY = 'plexiweb_no_metricas'; // metricas.js no cuenta las visitas de este navegador

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const el = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // El token vive en sessionStorage (se borra al cerrar la pestaña); si el navegador lo bloquea, queda en memoria
  let token = '';
  try { token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { /* sin almacenamiento */ }
  const saveToken = (value) => {
    token = value;
    try { value ? sessionStorage.setItem(TOKEN_KEY, value) : sessionStorage.removeItem(TOKEN_KEY); } catch (_) { /* sin almacenamiento */ }
  };

  const loginBox = $('#login');
  const loginMsg = $('#login-msg');
  const logoutBtn = $('#logout');
  const panelMetricas = $('#panel-metricas');

  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  const errorText = (status) => ({
    429: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.',
    503: 'El panel todavía no está habilitado en el servidor.',
  }[status] || `Algo salió mal (código ${status}). Intentá de nuevo en un momento.`);

  // Llamada a la API. Si el servidor dice 401 (fuera del login) la sesión venció: vuelve al login.
  const api = async (path, { method = 'GET', json } = {}) => {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(json); }

    let res;
    try { res = await fetch(path, { method, headers, body: payload }); }
    catch (_) { throw new ApiError(0, 'No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.'); }

    if (res.status === 401 && path !== '/api/login') {
      showLogin('Tu sesión venció. Entrá de nuevo.');
      throw new ApiError(401, '');
    }
    let data = null;
    try { data = await res.json(); } catch (_) { /* respuesta sin cuerpo */ }
    if (!res.ok) {
      // Los mensajes del servidor para estos códigos están escritos para quien usa el panel
      const detail = [400, 401, 429, 503].includes(res.status) && data && typeof data.error === 'string' ? data.error : '';
      throw new ApiError(res.status, detail || errorText(res.status));
    }
    return data;
  };
  const expired = (err) => err instanceof ApiError && err.status === 401;
  const messageOf = (err) => (err instanceof ApiError ? err.message : 'Algo salió mal. Intentá de nuevo.');

  // ---- Entrar / salir ----
  function showLogin(message = '') {
    saveToken('');
    panelMetricas.hidden = true;
    logoutBtn.hidden = true;
    loginBox.hidden = false;
    loginMsg.textContent = message;
    $('#login-pass').value = '';
    $('#login-send').disabled = false;
    $('#login-send').textContent = 'Entrar';
    (message ? $('#login-pass') : $('#login-user')).focus();
  }

  function showPanel() {
    loginBox.hidden = true;
    panelMetricas.hidden = false;
    logoutBtn.hidden = false;
    // Las visitas de quien administra desde este navegador no se cuentan en las métricas (ver metricas.js)
    try { localStorage.setItem(NO_METRICS_KEY, '1'); } catch (_) { /* sin almacenamiento */ }
    loadMetricas();
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const send = $('#login-send');
    send.disabled = true;
    send.textContent = 'Entrando…';
    loginMsg.textContent = '';
    try {
      const { token: t } = await api('/api/login', {
        method: 'POST',
        json: { usuario: $('#login-user').value, password: $('#login-pass').value },
      });
      saveToken(t);
      $('#login-pass').value = '';
      showPanel();
    } catch (err) {
      loginMsg.textContent = messageOf(err);
      send.disabled = false;
      send.textContent = 'Entrar';
      $('#login-pass').select();
    }
  });

  logoutBtn.addEventListener('click', () => showLogin());
  $('#metricas-refresh').addEventListener('click', () => loadMetricas());

  // ---- Métricas (GET /api/admin/metrics; los eventos los manda metricas.js) ----
  const body = $('#metricas-cuerpo');
  const mMsg = $('#metricas-msg');
  const mLoading = $('#metricas-loading');
  let mBusy = false;

  const stat = (n, label) => { const d = el('div', 'stat'); d.append(el('b', undefined, String(n)), el('span', undefined, label)); return d; };
  function table(headers, rows, vacio) {
    if (!rows.length) return el('p', 'muted', vacio);
    const t = el('table', 'rows');
    const thead = el('thead'); const trh = el('tr');
    headers.forEach((h) => trh.append(el('th', undefined, h)));
    thead.append(trh);
    const tb = el('tbody');
    rows.forEach((r) => { const tr = el('tr'); r.forEach((c) => tr.append(el('td', undefined, String(c)))); tb.append(tr); });
    t.append(thead, tb);
    return t;
  }
  const block = (titulo, ...nodes) => { const b = el('section', 'block'); b.append(el('h3', undefined, titulo), ...nodes); return b; };
  const DEVICES = { m: 'Celular', d: 'Computadora' };
  const CTAS = {
    header: 'Botón “Agendar reunión” (arriba)',
    hero: 'Botón “Contactanos” (portada)',
    'precio-estatico': 'Precios: “Quiero mi sitio estático”',
    'precio-dinamico': 'Precios: “Quiero mi sitio dinámico”',
    'precio-reunion': 'Precios: “Coordinar una reunión”',
    'bot-pedidos': '“Quiero mi bot de pedidos”',
    otro: 'Otro enlace de WhatsApp',
  };

  function renderMetricas(d) {
    body.replaceChildren();

    const t = d.traffic;
    const stats = el('div', 'stats');
    stats.append(stat(t.visits, 'visitas'), stat(t.unique, 'personas distintas'), stat(t.new, 'nuevas'), stat(t.returning, 'que volvieron'));
    body.append(stats);

    const clicks = el('div', 'stats');
    clicks.append(stat(d.whatsapp, 'clics a WhatsApp'), stat(d.portfolioClicks, 'clics a proyectos del portfolio'));
    body.append(clicks);

    const max = Math.max(1, ...d.daily.map((x) => x.visits));
    const days = el('div', 'days');
    d.daily.forEach((x) => {
      const c = el('div', 'day');
      c.title = `${x.day}: ${x.visits} visitas, ${x.unique} personas`;
      const bar = el('i'); bar.style.height = `${Math.round((x.visits / max) * 100)}%`;
      c.append(bar, el('small', undefined, x.day.slice(8)));
      days.append(c);
    });
    body.append(block('Visitas por día (últimos 14 días)', days));

    const f = d.funnel;
    body.append(block('Qué hace la gente',
      table(['Paso', 'Personas'], [
        ['Entraron a la web', f.visited],
        ['Abrieron un proyecto del portfolio', f.openedProject],
        ['Tocaron un botón de WhatsApp', f.clickedWhatsapp],
      ], 'Sin datos todavía.')));

    const two1 = el('div', 'two');
    two1.append(
      block('Proyectos del portfolio más abiertos', table(['Proyecto', 'Clics'], d.projects.map((p) => [p.id, p.clicks]), 'Todavía nadie abrió un proyecto.')),
      block('Botones de WhatsApp', table(['Botón', 'Clics'], d.ctas.map((c) => [CTAS[c.id] || c.id, c.clicks]), 'Todavía nadie tocó WhatsApp.')),
    );
    body.append(two1);

    const two2 = el('div', 'two');
    two2.append(
      block('De dónde llegan', table(['Origen', 'Visitas'], d.sources.map((o) => [o.id, o.visits]), 'Sin datos.')),
      block('Dispositivos', table(['Tipo', 'Visitas'], d.devices.map((o) => [DEVICES[o.id] || o.id, o.visits]), 'Sin datos.')),
    );
    body.append(two2);

    body.append(el('p', 'foot', 'Tus propias visitas desde este navegador no se cuentan, ni las de quien rechazó las cookies analíticas. No se guarda ningún dato personal de quienes visitan la web. Para medir un enlace en particular (por ejemplo el de Instagram) agregale ?utm_source=instagram.'));
  }

  async function loadMetricas() {
    if (mBusy) return;
    mBusy = true;
    mLoading.hidden = false;
    mMsg.textContent = '';
    try {
      renderMetricas(await api('/api/admin/metrics'));
    } catch (err) {
      if (!expired(err)) mMsg.textContent = messageOf(err);
    } finally {
      mBusy = false;
      mLoading.hidden = true;
    }
  }

  // ---- Arranque: si ya hay sesión en esta pestaña, se entra directo ----
  if (token) showPanel(); else showLogin();
})();
