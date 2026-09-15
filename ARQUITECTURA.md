# Checklist de arquitectura — Plexiweb (HTML/CSS/JS estático, sin build)

Estado real del proyecto: **HTML estático servido tal cual**, sin Vite ni ningún bundler (no hay `package.json`). Un único `index.html`, un único `css/style.css`, un único `js/script.js` sin módulos. Este checklist refleja esa arquitectura — no agregues supuestos de un proyecto con build salvo que se decida migrar explícitamente.

## 1. Punto de entrada y estructura

- [x] `index.html` en la raíz del repo como único punto de entrada.
- [x] Sin build: se puede abrir/servir directo, sin `npm run build`.
- [x] `.gitignore` — creado (`.DS_Store`, `Thumbs.db`, `.qodo/`, `*.log`, `.vscode/`).
- [x] `README.md` — creado, documenta cómo previsualizar y el flujo de hosting.
- [ ] No mezclar con proyectos hermanos del mismo sitio: si hay otra carpeta `plexiweb` fuera del repo git (ej. `03plexiweb/plexiweb/` sin `.git`), dejar claro que **no** es la fuente de verdad — la fuente real es `03plexiweb/plexiweb/plexiweb/` (repo con `.git`, remoto `github.com/Uziel44/plexiweb`).

## 2. CSS

- [x] Un solo archivo `css/style.css` — para un sitio de una página está bien no fragmentar en capas (`base/components/animations`) salvo que crezca.
- [ ] Si el archivo supera unas ~1500 líneas o se agregan más páginas, considerar separar por responsabilidad (base, componentes, animaciones).
- [ ] Revisar que los tokens de color (si existen variables `:root`) estén nombrados por rol, no por color literal.
- [ ] Verificar `@media (prefers-reduced-motion: reduce)` para usuarios que lo prefieran.

## 3. JavaScript

- [x] `js/script.js` único, cargado al final del `<body>`.
- [ ] No usa `type="module"` — confirmar que es intencional (evita CORS al abrir con `file://` sin servidor). Si se sirve siempre por HTTP, migrar a `type="module"` facilita separar responsabilidades (carrusel, cookie banner, nav) en archivos propios más adelante.
- [ ] A medida que crezca `script.js`, separar por responsabilidad (`carousel.js`, `cookie-banner.js`, `nav-toggle.js`) en vez de un solo archivo con todo mezclado.
- [ ] Sin `onclick` inline en el HTML — mantenerlo así (usar `id` + listeners en JS, como el patrón actual de `nav-toggle`, `cookie-accept`, etc.).
- [ ] El carrusel de portfolio se recalcula solo al agregar tarjetas (según comentario en `index.html:90-92`) — si se toca esa lógica, verificar que se mantenga así.

## 4. Accesibilidad

- [x] `nav-toggle` con `aria-label`, `aria-expanded`, `aria-controls`.
- [x] Cookie banner con `role="dialog"` y `aria-label`.
- [x] Iconos sociales del footer (`href="#"` Facebook/Twitter/Instagram) — eran placeholders sin URL real; se quitaron (no hay redes reales todavía). El bloque `.footer-social`/`.social-icons` quedó sin uso en `css/style.css`, se puede limpiar si se toca ese CSS.
- [x] Links de footer "Webs para..." (`href="#"`) — apuntan ahora a `#pricing` en vez de `#` vacío. El link "Cookies" no se tocó (tiene funcionalidad real en `script.js`).
- [ ] Verificar navegación por teclado en el carrusel (flechas custom `#carousel-prev`/`#carousel-next`) y en el cookie banner (`Escape` para cerrar, foco atrapado mientras está abierto).
- [ ] Contraste de color revisado en botones y textos sobre las imágenes del hero/portfolio.

## 5. SEO y metadatos

- [x] `<title>` y `<meta name="description">` específicos (no genéricos).
- [x] Open Graph (`og:title`, `og:description`, `og:image`, `og:type`, `og:url`) presentes.
- [x] `google-site-verification` presente.
- [x] `twitter:card` agregado.
- [x] `<link rel="canonical">` agregado (`https://plexiweb.pages.dev/`).
- [x] JSON-LD `LocalBusiness` agregado.
- [x] Favicon y `apple-touch-icon` agregados, apuntan a `assets/logo/logo.png`.
- [x] `theme-color` agregado.
- [x] `og:image`/`twitter:image`/JSON-LD `image` apuntaban a `assets/02.jpeg`, que no existía en el repo (asset roto real, no solo un ítem de checklist) — se copió el archivo correcto a `assets/02.jpeg` dentro del repo.

## 6. Rendimiento

- [x] Imágenes del portfolio (`assets/home/*.png`) con `width`/`height` explícitos.
- [x] `loading="lazy"` agregado a todas las imágenes del portfolio salvo la primera (Electrotest, visible sin scroll).
- [x] `preconnect` a `fonts.gstatic.com` agregado.
- [ ] Bootstrap Icons se carga completo vía CDN (`cdnjs`) solo para unos pocos íconos — evaluar si conviene un sprite/subset propio si el peso importa.
- [ ] Revisar peso real de `assets/home/*.png` y de las imágenes en `assets/images/` — fotos sin optimizar pueden pesar cientos de KB cada una.
- [ ] GTM se carga sync-blocking en el `<head>` (patrón estándar de Google) — aceptar el costo o evaluar `defer` si el LCP se ve afectado.
- [ ] `assets/home/verax.png` es en realidad un JPEG con extensión `.png` (detectado por firma de archivo) — funciona pero es engañoso; renombrar a `.jpg` si se vuelve a tocar ese asset.

## 7. Contenido e imágenes: procedencia

- [ ] Confirmar que `assets/home/*.png` (capturas de los proyectos del portfolio: Electrotest, Miyen dj, Plexi Gestión, Ilha Grande, Datovivo, Verax) sean del propio Plexiweb (son screenshots de trabajos propios, no stock — bajo riesgo).
- [ ] Hay imágenes sueltas fuera del repo (`02.jpeg`, `09.jpeg` en `03plexiweb/plexiweb/`, un nivel arriba de este repo git) — si se usan en el sitio, migrarlas a `assets/` dentro del repo; si no se usan, son basura de trabajo y no deberían confundirse con la fuente real.
- [ ] Agregar `onerror`/fallback a imágenes que dependan de fuentes externas (ninguna imagen del sitio parece ser externa hoy — todo vive en `assets/`, lo cual es bueno).

## 8. Analytics y scripts de terceros

- [x] Google Tag Manager (`GTM-M95P8XHG`) documentado con comentario en `<head>` y `<noscript>` al inicio del `<body>`.
- [x] Cookie banner propio con toggle de "Analítica" — verificar que el JS realmente condicione el disparo de GTM/analítica según ese toggle (no solo lo muestre visualmente).
- [ ] No hay otros scripts de terceros además de GTM, Google Fonts y Bootstrap Icons CDN — mantener esta lista corta y documentada si se agregan más (Meta Pixel, etc.).

## 9. Documentación del proyecto

- [x] `README.md` creado: cómo previsualizar localmente, deploy (Cloudflare Pages, `plexiweb.pages.dev`), y el flujo para agregar un proyecto nuevo al carrusel de portfolio.
- [ ] Documentar por qué existe `assets/home/` separado de `assets/images/` (naming no obvio por el código).

## 10. Control de versiones

- [x] Repo git inicializado, remoto en `https://github.com/Uziel44/plexiweb.git`, rama `main`.
- [x] `.gitignore` agregado (ver sección 1).
- [ ] Ojo con la carpeta padre `03plexiweb/plexiweb/` (sin `.git`) que contiene `09.jpeg` suelto y otra carpeta `.qodo/` — no es parte de este repo. Se usó `09.jpeg` como fuente para `assets/02.jpeg` (imagen de tarjeta OG) porque el usuario confirmó que es la imagen correcta; evitar copiar/pegar el resto de esa carpeta asumiendo que es parte del repo.

## 11. Verificación antes de dar por terminado un cambio

- [ ] Al no haber build, "verificar" significa: abrir/servir `index.html` real y mirarlo en el navegador — no hay paso de compilación que pueda ocultar errores de sintaxis CSS/JS.
- [ ] Verificar con `curl` (o el navegador) que cada asset referenciado (`css/style.css`, `js/script.js`, imágenes en `assets/`) responde 200.
- [ ] Revisar la consola del navegador por errores de JS después de cualquier cambio en `script.js` — al no ser módulos, un error temprano puede frenar la ejecución del resto del archivo (carrusel, nav, cookies) en cascada.
- [ ] Ante un reporte de "no se ve X": ¿está en el HTML? ¿el CSS lo target-ea bien? ¿hay un error de JS previo en consola que cortó la ejecución? ¿caché del navegador? — en ese orden.
