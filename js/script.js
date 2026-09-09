document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initPortfolioCarousel();
  initCookieBanner();
});

function initMobileNav() {
  const header = document.querySelector('.site-header');
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('main-nav');
  if (!header || !toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const isOpen = header.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.innerHTML = isOpen ? '<i class="bi bi-x-lg"></i>' : '<i class="bi bi-list"></i>';
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      header.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '<i class="bi bi-list"></i>';
    });
  });
}

/**
 * Carrusel de portfolio: grid 2x2 (grid-auto-flow: column), cada "página"
 * son 2 columnas = 4 tarjetas. Lee las tarjetas directamente del DOM, así
 * que agregar un ".portfolio-card" nuevo en el HTML alcanza — los dots y
 * las flechas se recalculan solos, sin tocar este archivo.
 */
function initPortfolioCarousel() {
  const track = document.getElementById('portfolio-track');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  const dotsContainer = document.getElementById('portfolio-dots');
  if (!track || !dotsContainer) return;

  const cards = Array.from(track.children);
  if (!cards.length) return;

  const CARDS_PER_PAGE = 4; // 2 columnas x 2 filas
  const pageStarts = cards.filter((_, i) => i % CARDS_PER_PAGE === 0);
  const pageCount = pageStarts.length;

  const dots = pageStarts.map((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'dot';
    dot.setAttribute('aria-label', `Ir a la página ${i + 1}`);
    dot.addEventListener('click', () => scrollToPage(i));
    dotsContainer.appendChild(dot);
    return dot;
  });

  function scrollToPage(pageIndex) {
    const clamped = Math.max(0, Math.min(pageIndex, pageCount - 1));
    pageStarts[clamped].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }

  function getCurrentPage() {
    let closest = 0;
    let smallestDiff = Infinity;
    pageStarts.forEach((card, i) => {
      const diff = Math.abs(card.offsetLeft - track.scrollLeft);
      if (diff < smallestDiff) {
        smallestDiff = diff;
        closest = i;
      }
    });
    return closest;
  }

  function updateUI() {
    const page = getCurrentPage();
    const maxScroll = track.scrollWidth - track.clientWidth;
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === page));
    if (prevBtn) prevBtn.disabled = track.scrollLeft <= 2;
    if (nextBtn) nextBtn.disabled = track.scrollLeft >= maxScroll - 2;
  }

  function step(direction) {
    const colWidth = cards[0].getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || '0');
    track.scrollBy({ left: direction * 2 * (colWidth + gap), behavior: 'smooth' });
  }

  prevBtn?.addEventListener('click', () => step(-1));
  nextBtn?.addEventListener('click', () => step(1));

  let scrollTimeout;
  track.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(updateUI, 100);
  });

  window.addEventListener('resize', () => updateUI());

  updateUI();
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
