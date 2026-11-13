/* ==========================================================================
   MÉTRICAS · PLEXIWEB
   Manda eventos anónimos a /api/metrics (ver server/server.js) para el panel
   /admin.html. Un identificador aleatorio por navegador para contar personas
   distintas, sin IP ni datos personales.

   Eventos: visita, click_whatsapp (cuál botón: data-cta), click_portfolio (qué proyecto).

   - Respeta el banner de cookies: si la persona rechazó las analíticas, no manda nada.
   - El panel deja en este navegador una marca para NO contar las visitas de quien administra.
   - Si la web se abre sin servidor (doble clic), no se manda nada.
   ========================================================================== */

(() => {
  'use strict';

  const EXCLUIR = 'plexiweb_no_metricas';
  const VISITANTE = 'plexiweb_visitante';
  const CONSENTIMIENTO = 'plexiweb-cookie-consent'; // lo guarda initCookieBanner() en js/script.js
  const API = '';

  const apagado = () => { window.Metricas = { track() {} }; };

  // Sin servidor (file://) no hay a dónde mandar los eventos
  if (location.protocol === 'file:') { apagado(); return; }

  try {
    if (localStorage.getItem(EXCLUIR) === '1') { apagado(); return; }
    const guardado = localStorage.getItem(CONSENTIMIENTO);
    if (guardado && JSON.parse(guardado).analytics === false) { apagado(); return; }
  } catch (_) { /* sin almacenamiento o formato viejo: se cuenta igual */ }

  const idVisitante = () => {
    try {
      let id = localStorage.getItem(VISITANTE);
      if (!id) {
        id = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(VISITANTE, id);
      }
      return id;
    } catch (_) {
      return undefined;
    }
  };

  const track = (tipo, datos) => {
    const cuerpo = JSON.stringify(Object.assign({ tipo, visitanteId: idVisitante() }, datos || {}));
    fetch(`${API}/api/metrics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo, keepalive: true }).catch(() => {});
  };

  // De dónde llegó: ?utm_source=... (por ejemplo el enlace de Instagram) o el sitio que la enlazó
  const origen = () => {
    const utm = new URLSearchParams(location.search).get('utm_source');
    if (utm && /^[\w.\-]{1,40}$/.test(utm)) return utm.toLowerCase();
    try {
      const host = new URL(document.referrer).hostname;
      return host && host !== location.hostname ? host.replace(/^www\./, '') : 'directo';
    } catch (_) {
      return 'directo';
    }
  };

  // Nombre corto del proyecto del portfolio: el host, más la carpeta si vive en github.io
  const proyecto = (href) => {
    try {
      const u = new URL(href, location.href);
      const host = u.hostname.replace(/^www\./, '');
      const carpeta = u.pathname.split('/').filter(Boolean)[0];
      return host.endsWith('github.io') && carpeta ? `${host}/${carpeta}` : host;
    } catch (_) {
      return '';
    }
  };

  window.Metricas = { track };

  track('visita', {
    origen: origen(),
    dispositivo: matchMedia('(max-width: 820px)').matches ? 'm' : 'd',
  });

  // Clic (o clic con la rueda, que abre en pestaña nueva) en un botón de WhatsApp o en un proyecto del portfolio
  const alClic = (e) => {
    if (!(e.target instanceof Element)) return;
    const wa = e.target.closest('a[href^="https://wa.me/"]');
    if (wa) { track('click_whatsapp', { cta: wa.dataset.cta || 'otro' }); return; }
    const card = e.target.closest('a.portfolio-card');
    if (card) {
      const p = proyecto(card.href);
      if (p) track('click_portfolio', { proyecto: p });
    }
  };
  document.addEventListener('click', alClic);
  document.addEventListener('auxclick', (e) => { if (e.button === 1) alClic(e); });
})();
