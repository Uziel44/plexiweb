(() => {
  'use strict';

  // ---- Configuración ----
  const TOKEN_KEY = 'plexiweb_admin_token';
  const NO_METRICS_KEY = 'plexiweb_no_metricas'; // metricas.js no cuenta las visitas de este navegador
  const MAX_WIDTH = 900;     // ancho máximo de la imagen subida, en píxeles (las tarjetas se ven a ~300 px)
  const MAX_HEIGHT = 6000;   // alto máximo: las capturas de toda la página son muy largas
  const IMG_QUALITY = 0.82;
  const TALL_RATIO = 1.6;    // alto/ancho desde el que se sugiere "imagen larga" (efecto de deslizamiento)

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
  const tabs = $('#tabs');
  const panelMetricas = $('#panel-metricas');
  const panelTarjetas = $('#panel-tarjetas');
  const editor = $('#editor');
  const confirmDlg = $('#confirm');

  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  const errorText = (status) => ({
    404: 'Esa tarjeta ya no existe. Actualizamos la lista.',
    413: 'La imagen es demasiado grande. Probá con otra.',
    415: 'Ese tipo de archivo no sirve. Usá una imagen JPG, PNG o WebP.',
    429: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.',
    503: 'El panel todavía no está habilitado en el servidor.',
  }[status] || `Algo salió mal (código ${status}). Intentá de nuevo en un momento.`);

  // Llamada a la API. Si el servidor dice 401 (fuera del login) la sesión venció: vuelve al login.
  const api = async (path, { method = 'GET', json, body, type } = {}) => {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload = body;
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(json); }
    else if (type) headers['Content-Type'] = type;

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
      const detail = [400, 401, 409, 429, 503].includes(res.status) && data && typeof data.error === 'string' ? data.error : '';
      throw new ApiError(res.status, detail || errorText(res.status));
    }
    return data;
  };
  const expired = (err) => err instanceof ApiError && err.status === 401;
  const messageOf = (err) => (err instanceof ApiError ? err.message : 'Algo salió mal. Intentá de nuevo.');

  // ---- Entrar / salir ----
  function showLogin(message = '') {
    saveToken('');
    cards = [];
    [editor, confirmDlg].forEach((d) => { if (d.open) d.close(); });
    panelMetricas.hidden = true;
    panelTarjetas.hidden = true;
    tabs.hidden = true;
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
    tabs.hidden = false;
    logoutBtn.hidden = false;
    // Las visitas de quien administra desde este navegador no se cuentan en las métricas (ver metricas.js)
    try { localStorage.setItem(NO_METRICS_KEY, '1'); } catch (_) { /* sin almacenamiento */ }
    selectTab('metricas');
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

  // ---- Pestañas ----
  function selectTab(name) {
    const m = name === 'metricas';
    panelMetricas.hidden = !m;
    panelTarjetas.hidden = m;
    $('#tab-metricas').setAttribute('aria-pressed', String(m));
    $('#tab-tarjetas').setAttribute('aria-pressed', String(!m));
    if (m) loadMetricas(); else loadCards();
  }
  $('#tab-metricas').addEventListener('click', () => selectTab('metricas'));
  $('#tab-tarjetas').addEventListener('click', () => selectTab('tarjetas'));
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

    // Cada día: visitas arriba de la barra, fecha (día/mes) y personas distintas debajo
    const max = Math.max(1, ...d.daily.map((x) => x.visits));
    const days = el('div', 'days');
    d.daily.forEach((x) => {
      const c = el('div', 'day');
      c.title = `${x.day}: ${x.visits} visitas, ${x.unique} personas distintas`;
      const bar = el('i'); bar.style.height = `${Math.max(2, Math.round((x.visits / max) * 100))}px`;
      const val = el('b', x.visits ? 'val' : 'val zero', String(x.visits));
      c.append(val, bar, el('small', 'date', `${x.day.slice(8)}/${x.day.slice(5, 7)}`), el('small', 'ppl', `${x.unique} pers.`));
      days.append(c);
    });
    const total = d.daily.reduce((sum, x) => sum + x.visits, 0);
    body.append(block('Visitas por día (últimos 14 días)', days,
      el('p', 'foot', `Número grande = visitas del día; abajo, personas distintas. Total de los 14 días: ${total} visitas.`)));

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

  // ---- Tarjetas del portfolio (GET/POST/PUT/DELETE /api/admin/cards, PUT /api/admin/cards-order) ----
  const list = $('#tarjetas-lista');
  const tMsg = $('#tarjetas-msg');
  const tStatus = $('#tarjetas-status');
  const tLoading = $('#tarjetas-loading');
  const tAviso = $('#tarjetas-aviso');
  let cards = [];
  let tBusy = false;
  let dragId = null;

  const say = (text) => { tStatus.textContent = ''; setTimeout(() => { tStatus.textContent = text; }, 30); };
  // Las imágenes del repo y las subidas viven en la raíz del sitio: "assets/home/x.jpg", "uploads/xxxx.webp"
  const imgSrc = (image) => `/${String(image).replace(/^\/+/, '')}`;

  async function loadCards() {
    if (tBusy) return;
    tBusy = true;
    tLoading.hidden = false;
    tMsg.textContent = '';
    try {
      const data = await api('/api/admin/cards');
      cards = data.cards;
      tAviso.hidden = data.custom;
      renderCards();
    } catch (err) {
      if (!expired(err)) tMsg.textContent = messageOf(err);
    } finally {
      tBusy = false;
      tLoading.hidden = true;
    }
  }

  function cardItem(card, index) {
    const li = el('li', 'card');
    li.dataset.id = card.id;
    li.draggable = true;

    const num = el('span', 'num', String(index + 1));
    num.title = `Lugar ${index + 1}`;
    const grip = el('span', 'grip', '⠿');
    grip.setAttribute('aria-hidden', 'true');
    grip.title = 'Arrastrá para cambiar de lugar';

    const thumb = el('div', 'thumb');
    const img = el('img');
    img.src = imgSrc(card.image);
    img.alt = '';
    img.loading = 'lazy';
    thumb.append(img);

    const text = el('div', 'card-text');
    text.append(el('b', undefined, card.title));
    if (card.description) text.append(el('span', 'muted small', card.description));
    if (card.link) text.append(el('span', 'link small', card.link.replace(/^https?:\/\//, '')));
    else text.append(el('span', 'muted small', 'Sin link'));
    if (card.tall) text.append(el('span', 'tag', 'Imagen larga'));

    const actions = el('div', 'card-actions');
    const mk = (label, aria, onClick, cls = 'btn ghost') => {
      const b = el('button', cls, label);
      b.type = 'button';
      b.setAttribute('aria-label', `${aria}: ${card.title}`);
      b.addEventListener('click', onClick);
      return b;
    };
    const up = mk('↑', 'Subir', () => moveCard(index, index - 1, card.id), 'btn ghost icon');
    const down = mk('↓', 'Bajar', () => moveCard(index, index + 1, card.id), 'btn ghost icon');
    up.disabled = index === 0;
    down.disabled = index === cards.length - 1;
    actions.append(up, down, mk('Editar', 'Editar', () => openEditor(card)), mk('Eliminar', 'Eliminar', () => askDelete(card), 'btn ghost danger-text'));

    li.append(num, grip, thumb, text, actions);

    // Arrastrar y soltar (en el celular quedan las flechas)
    li.addEventListener('dragstart', (e) => {
      dragId = card.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.id); // Firefox lo exige para empezar a arrastrar
      requestAnimationFrame(() => li.classList.add('dragging'));
    });
    li.addEventListener('dragend', () => { dragId = null; clearDropMarks(); li.classList.remove('dragging'); });
    li.addEventListener('dragover', (e) => {
      if (!dragId || dragId === card.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDropMarks();
      li.classList.add(dropAfter(e, li) ? 'drop-after' : 'drop-before');
    });
    li.addEventListener('drop', (e) => {
      if (!dragId || dragId === card.id) return;
      e.preventDefault();
      const from = cards.findIndex((c) => c.id === dragId);
      let to = cards.findIndex((c) => c.id === card.id) + (dropAfter(e, li) ? 1 : 0);
      if (from < to) to -= 1; // al sacar la tarjeta de su lugar, los índices de después bajan uno
      clearDropMarks();
      dragId = null;
      moveCard(from, to, card.id);
    });
    return li;
  }
  const dropAfter = (e, li) => { const r = li.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
  const clearDropMarks = () => list.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));

  function renderCards(focusId, focusWhat) {
    list.replaceChildren(...cards.map(cardItem));
    if (!cards.length) list.append(el('li', 'muted', 'No hay tarjetas. Creá la primera con “Nueva tarjeta”.'));
    if (focusId) {
      // Tras mover una tarjeta con las flechas el foco sigue en la misma flecha (si todavía se puede mover)
      const li = list.querySelector(`[data-id="${focusId}"]`);
      const btn = li && li.querySelectorAll('button')[focusWhat === 'down' ? 1 : 0];
      if (btn && !btn.disabled) btn.focus(); else if (li) li.querySelector('.card-actions button:not(:disabled)')?.focus();
    }
  }

  // Las guardadas van en fila: cada una manda el orden actual (el último gana), así varios clics rápidos no se pisan
  let saveChain = Promise.resolve();
  function moveCard(from, to, id) {
    if (from < 0 || to < 0 || to >= cards.length || from === to) return;
    const [moved] = cards.splice(from, 1);
    cards.splice(to, 0, moved);
    renderCards(id, to < from ? 'up' : 'down');
    say(`“${moved.title}” quedó en el lugar ${to + 1} de ${cards.length}.`);
    saveChain = saveChain.then(async () => {
      try {
        await api('/api/admin/cards-order', { method: 'PUT', json: { ids: cards.map((c) => c.id) } });
        tMsg.textContent = '';
      } catch (err) {
        if (expired(err)) return;
        tMsg.textContent = messageOf(err);
        await reloadCards();
      }
    });
  }
  async function reloadCards() {
    try {
      const data = await api('/api/admin/cards');
      cards = data.cards;
      tAviso.hidden = data.custom;
      renderCards();
    } catch (err) {
      if (!expired(err)) tMsg.textContent = messageOf(err);
    }
  }

  // -- Editor (alta y edición) --
  let editing = null;        // tarjeta que se edita (null = nueva)
  let image = null;          // { url: 'assets/home/x.jpg' | 'uploads/x.webp' } si ya está en el servidor, o { blob, preview } si es nueva
  let saving = false;
  const eMsg = $('#editor-msg');
  const preview = $('#f-preview');

  function setPreview(src) {
    preview.replaceChildren();
    if (!src) { preview.append(el('span', undefined, 'Sin imagen')); return; }
    const img = el('img');
    img.src = src;
    img.alt = '';
    preview.append(img);
  }
  function releaseImage() {
    if (image && image.preview) URL.revokeObjectURL(image.preview);
    image = null;
  }

  function openEditor(card) {
    editing = card || null;
    releaseImage();
    $('#editor-titulo').textContent = card ? 'Editar tarjeta' : 'Nueva tarjeta';
    $('#f-titulo').value = card ? card.title : '';
    $('#f-descripcion').value = card ? card.description : '';
    $('#f-link').value = card ? card.link : '';
    $('#f-larga').checked = card ? card.tall : true;
    image = card ? { url: card.image } : null;
    setPreview(card ? imgSrc(card.image) : null);
    $('#f-imagen-label').textContent = card ? 'Cambiar imagen' : 'Elegir imagen';
    eMsg.textContent = '';
    $('#editor-guardar').disabled = false;
    $('#editor-guardar').textContent = 'Guardar';
    editor.showModal();
    $('#f-titulo').focus();
  }
  $('#nueva').addEventListener('click', () => openEditor(null));
  $('#editor-cancelar').addEventListener('click', () => { if (!saving) editor.close(); });
  editor.addEventListener('close', () => { releaseImage(); editing = null; });
  editor.addEventListener('cancel', (e) => { if (saving) e.preventDefault(); }); // Escape durante el guardado no cierra

  // Achica en el navegador antes de subir (las capturas y fotos del celular pesan muchísimo). Sale en WebP; si el navegador no lo soporta, en JPG.
  const toBlob = (canvas, type) => new Promise((resolve) => canvas.toBlob(resolve, type, IMG_QUALITY));
  function prepareImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = async () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAX_WIDTH / img.naturalWidth, MAX_HEIGHT / img.naturalHeight);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let blob = await toBlob(canvas, 'image/webp');
        if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg');
        blob ? resolve({ blob, ratio: h / w }) : reject(new Error('blob'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
      img.src = url;
    });
  }

  $('#f-imagen').addEventListener('change', async (e) => {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    if (!file) return;
    const msg = $('#f-imagen-msg');
    const original = msg.textContent;
    msg.textContent = 'Preparando la imagen…';
    try {
      const { blob, ratio } = await prepareImage(file);
      releaseImage();
      image = { blob, preview: URL.createObjectURL(blob) };
      setPreview(image.preview);
      $('#f-larga').checked = ratio >= TALL_RATIO; // las capturas largas se deslizan; las normales no
      eMsg.textContent = '';
      msg.textContent = `Imagen lista (${Math.max(1, Math.round(blob.size / 1024))} KB). Si es una captura larga, queda marcado el deslizamiento.`;
    } catch (_) {
      msg.textContent = original;
      eMsg.textContent = 'No pudimos leer ese archivo. Probá con una imagen JPG, PNG o WebP.';
    }
  });

  $('#editor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    const title = $('#f-titulo').value.trim();
    if (!title) { eMsg.textContent = 'Poné un título.'; $('#f-titulo').focus(); return; }
    if (!image) { eMsg.textContent = 'Elegí una imagen para la tarjeta.'; return; }

    saving = true;
    const isNew = !editing; // el diálogo vacía `editing` al cerrarse: se anota antes
    const send = $('#editor-guardar');
    send.disabled = true;
    send.textContent = 'Guardando…';
    eMsg.textContent = '';
    try {
      let path = image.url;
      if (image.blob) {
        send.textContent = 'Subiendo la imagen…';
        path = (await api('/api/admin/images', { method: 'POST', body: image.blob, type: image.blob.type })).url;
      }
      const payload = {
        title,
        description: $('#f-descripcion').value,
        link: $('#f-link').value,
        image: path,
        tall: $('#f-larga').checked,
      };
      const saved = !isNew
        ? await api(`/api/admin/cards/${encodeURIComponent(editing.id)}`, { method: 'PUT', json: payload })
        : await api('/api/admin/cards', { method: 'POST', json: payload });
      saving = false;
      editor.close();
      await reloadCards();
      tMsg.textContent = '';
      say(isNew ? `Creamos la tarjeta “${saved.title}” al final de la lista.` : `Guardamos los cambios de “${saved.title}”.`);
      if (isNew) list.querySelector(`[data-id="${saved.id}"]`)?.scrollIntoView({ block: 'center' });
    } catch (err) {
      if (!expired(err)) {
        eMsg.textContent = messageOf(err);
        if (err instanceof ApiError && err.status === 404) { saving = false; await reloadCards(); }
      }
    } finally {
      saving = false;
      send.disabled = false;
      send.textContent = 'Guardar';
    }
  });

  // -- Eliminar --
  let deleting = null;
  function askDelete(card) {
    deleting = card;
    $('#confirm-msg').textContent = `¿Eliminar la tarjeta “${card.title}”? Se saca de la web y no se puede deshacer.`;
    confirmDlg.showModal();
    $('#confirm-no').focus();
  }
  $('#confirm-no').addEventListener('click', () => { deleting = null; confirmDlg.close(); });
  $('#confirm-si').addEventListener('click', async () => {
    const card = deleting;
    if (!card) return;
    const btn = $('#confirm-si');
    btn.disabled = true;
    try {
      await api(`/api/admin/cards/${encodeURIComponent(card.id)}`, { method: 'DELETE' });
      confirmDlg.close();
      await reloadCards();
      say(`Eliminamos “${card.title}”.`);
    } catch (err) {
      confirmDlg.close();
      if (!expired(err)) { tMsg.textContent = messageOf(err); await reloadCards(); }
    } finally {
      deleting = null;
      btn.disabled = false;
    }
  });

  // ---- Arranque: si ya hay sesión en esta pestaña, se entra directo ----
  if (token) showPanel(); else showLogin();
})();
