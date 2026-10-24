document.addEventListener('DOMContentLoaded', () => {
  const lenis = initSmoothScroll();
  initMobileNav();
  initCookieBanner();
  initRevealAnimations();
  initParallax(lenis);
});

/**
 * Scroll suave con inercia (mismo patrón que "02 electrotest", ahí vía Lenis
 * + npm/Vite; acá vía Lenis cargado por CDN como script clásico, porque este
 * sitio no tiene build step). Se omite si el usuario pide movimiento
 * reducido, dejando el scroll nativo del navegador.
 * @returns {object|null} instancia de Lenis, o null si no se activó
 */
function initSmoothScroll() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  if (typeof window.Lenis !== 'function') return null;

  const lenis = new window.Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    autoRaf: true,
    // En táctil se mantiene el scroll nativo: es más fluido y no rompe gestos.
    syncTouch: false,
    touchMultiplier: 1.6,
  });

  return lenis;
}

/**
 * Animaciones de entrada al hacer scroll (fade + slide), mismo gesto que
 * "02 electrotest" pero con IntersectionObserver nativo en vez de GSAP +
 * ScrollTrigger, ya que acá no hay esas dependencias instaladas.
 *
 * Marcado en el HTML:
 *   data-reveal="up|left|right|fade"  → dirección de la entrada (default: up)
 *   data-reveal-delay="0.15"          → retardo en segundos
 *   data-reveal-group="up"            → anima a los [data-reveal] hijos en cascada
 */
function initRevealAnimations() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const singles = Array.from(document.querySelectorAll('[data-reveal]:not([data-reveal-group] [data-reveal])'));
  const groups = Array.from(document.querySelectorAll('[data-reveal-group]'));

  if (prefersReducedMotion) {
    singles.forEach((el) => el.classList.add('is-revealed'));
    groups.forEach((group) => {
      group.classList.add('is-revealed');
      group.querySelectorAll('[data-reveal]').forEach((child) => child.classList.add('is-revealed'));
    });
    return;
  }

  singles.forEach((el) => {
    el.classList.add('reveal', `reveal-${el.dataset.reveal || 'up'}`);
    const delay = parseFloat(el.dataset.revealDelay || '0');
    if (delay) el.style.transitionDelay = `${delay}s`;
  });

  groups.forEach((group) => {
    const direction = group.dataset.revealGroup || 'up';
    const children = Array.from(group.querySelectorAll('[data-reveal]'));
    children.forEach((child, i) => {
      child.classList.add('reveal', `reveal-${direction}`);
      child.style.transitionDelay = `${i * 0.12}s`;
    });
  });

  const reveal = (el) => {
    // will-change recién se agrega acá (justo antes de animar) y se saca al
    // terminar la transición: así el navegador sólo promueve a capa GPU los
    // elementos que están animando en ese momento, no todos los [data-reveal]
    // de la página desde que carga.
    el.style.willChange = 'opacity, transform';
    el.classList.add('is-revealed');
    const clearWillChange = () => { el.style.willChange = ''; };
    el.addEventListener('transitionend', clearWillChange, { once: true });
    // Respaldo: si el elemento ya estaba fuera de layout/con la transición
    // cortada por un salto grande de scroll, "transitionend" puede no llegar
    // a disparar nunca. 1s cubre de sobra la transición de 0.9s declarada.
    window.setTimeout(clearWillChange, 1000);
  };

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        if (entry.target.hasAttribute('data-reveal-group')) {
          entry.target.querySelectorAll('[data-reveal]').forEach(reveal);
        } else {
          reveal(entry.target);
        }

        obs.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.01 },
  );

  singles.forEach((el) => observer.observe(el));
  groups.forEach((group) => observer.observe(group));

  // Salvaguarda: si por lo que sea el observer no disparó a tiempo (layout
  // inestable, navegador lento), se revela igual pasado un margen. Preferimos
  // perder la animación a que quede contenido invisible.
  window.setTimeout(() => {
    document.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach(reveal);
  }, 2500);
}

/**
 * Parallax en elementos marcados con data-parallax="0.2" (intensidad; negativo
 * invierte la dirección). Usado por el showcase de portfolio (3 columnas a
 * distinta velocidad, igual que tiendanube.com) y queda disponible para
 * cualquier otro elemento. Se desactiva con movimiento reducido. Si Lenis
 * está activo se engancha a su evento de scroll; si no, usa el scroll nativo.
 * @param {object|null} lenis
 */
function initParallax(lenis) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const elements = Array.from(document.querySelectorAll('[data-parallax]')).map((el) => ({
    el,
    intensity: parseFloat(el.dataset.parallax || '0.15'),
  }));
  if (!elements.length) return;

  let ticking = false;

  function update() {
    ticking = false;
    const viewportHeight = window.innerHeight;

    elements.forEach(({ el, intensity }) => {
      const rect = el.getBoundingClientRect();
      // Progreso 0→1 de cuánto atravesó el elemento la pantalla, para que el
      // desplazamiento sea proporcional a su posición y no salte al entrar.
      const progress = (viewportHeight - rect.top) / (viewportHeight + rect.height);
      const offset = (progress - 0.5) * intensity * rect.height;
      el.style.transform = `translateY(${offset}px)`;
    });
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  if (lenis) lenis.on('scroll', onScroll);
  else window.addEventListener('scroll', onScroll, { passive: true });

  window.addEventListener('resize', onScroll);
  update();
}

function initMobileNav() {
  const header = document.querySelector('.site-header');
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('main-nav');
  if (!header || !toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const isOpen = header.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
    toggle.innerHTML = isOpen
      ? '<i class="bi bi-x-lg" aria-hidden="true"></i>'
      : '<i class="bi bi-list" aria-hidden="true"></i>';
  });

  const closeMenu = () => {
    header.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menú');
    toggle.innerHTML = '<i class="bi bi-list" aria-hidden="true"></i>';
  };

  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('is-open')) {
      closeMenu();
      toggle.focus();
    }
  });
}

/**
 * Banner de cookies: guarda la elección en localStorage para no volver a
 * mostrarlo. "Preferencias" despliega un panel simple con un toggle de
 * cookies analíticas; el footer tiene un link para reabrirlo más adelante.
 */
function initCookieBanner() {
  const banner = document.getElementById('cookie-banner');
  const panel = document.getElementById('cookie-settings-panel');
  const analyticsToggle = document.getElementById('cookie-analytics-toggle');
  if (!banner) return;

  const STORAGE_KEY = 'plexiweb-cookie-consent';

  const hide = () => {
    banner.classList.remove('is-visible');
    banner.setAttribute('aria-hidden', 'true');
  };

  const show = () => {
    banner.classList.add('is-visible');
    banner.setAttribute('aria-hidden', 'false');
  };

  const saveConsent = (analytics) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ necessary: true, analytics }));
    hide();
  };

  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    setTimeout(show, 600);
  } else {
    try {
      const parsed = JSON.parse(saved);
      if (analyticsToggle) analyticsToggle.checked = !!parsed.analytics;
    } catch {
      /* consentimiento en formato viejo, se ignora */
    }
  }

  document.getElementById('cookie-accept')?.addEventListener('click', () => saveConsent(true));
  document.getElementById('cookie-reject')?.addEventListener('click', () => saveConsent(false));

  document.getElementById('cookie-settings')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (panel) panel.hidden = !panel.hidden;
  });

  document.getElementById('cookie-save')?.addEventListener('click', () => {
    saveConsent(!!analyticsToggle?.checked);
  });

  document.getElementById('footer-cookie-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (panel) panel.hidden = true;
    show();
  });
}
