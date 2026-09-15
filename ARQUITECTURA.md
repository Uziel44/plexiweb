# Checklist de arquitectura — Landing page moderna (Vite + Tailwind + JS modular)

Lista de referencia para levantar o auditar un proyecto de este tipo. Pensada para copiar a otros proyectos similares.

## 1. Punto de entrada y build

- [ ] `index.html` en la raíz como único punto de entrada HTML.
- [ ] `vite.config.js`: plugin de Tailwind, `manualChunks` para separar librerías de terceros (vendor) del código propio.
- [ ] `package.json` con scripts estándar: `dev`, `build`, `preview`.
- [ ] `.gitignore` cubriendo `node_modules/`, `dist/`, archivos locales/`.env`.
- [ ] Decidir explícitamente: ¿proyecto con build (Vite) o HTML estático sin build? No mezclar ambos supuestos en la misma entrega.

## 2. CSS en capas

- [ ] Un archivo raíz que importe todo (`main.css`) y declare los tokens de diseño (`@theme` en Tailwind v4, o `:root` con variables CSS).
- [ ] Nombres de tokens de color por **rol**, no por el color literal (ej. `brand`, `ink`, no `orange` si en realidad pinta celeste).
- [ ] Separar en archivos por responsabilidad: `base.css` (reset, tipografía, fondos), `components.css` (botones, cards, header, nav), `animations.css` (keyframes).
- [ ] Bloque `@media (prefers-reduced-motion: reduce)` que anule animaciones y dependa de `.js` en el `<html>`.
- [ ] Ojo con `@apply` de utilidades propias: en Tailwind v4 no se puede encadenar `@apply` sobre una clase custom (`.btn-primary { @apply btn ... }` rompe el build) — solo sobre utilidades nativas.

## 3. JavaScript modular

- [ ] `main.js` como único orquestador: importa CSS, importa módulos, los inicializa en orden.
- [ ] Un módulo por responsabilidad (`navigation.js`, `accordion.js`, `smooth-scroll.js`, `animations.js`, etc.), sin funciones globales ni `onclick` inline en el HTML.
- [ ] `type="module"` en el `<script>` del HTML.
- [ ] Evitar acoplar el revelado de contenido (opacidad/animaciones de entrada) a una librería de scroll con inercia (Lenis, GSAP ScrollTrigger) sin salvaguarda: si la sincronización falla, el contenido puede quedar invisible para siempre.
  - Preferir `IntersectionObserver` nativo para revelado de contenido crítico — no depende de qué mueva el scroll.
  - Siempre agregar un `setTimeout` de seguridad que fuerce visibilidad si la animación no se disparó en X segundos.
- [ ] Verificar la versión real de cada librería instalada contra las opciones que se le pasan (una opción con nombre viejo se ignora en silencio, no tira error).

## 4. Accesibilidad

- [ ] `skip-link` al contenido principal.
- [ ] `:focus-visible` consistente en toda la página.
- [ ] Componentes interactivos (acordeón, menú, tabs) con `aria-expanded`, `aria-controls`, `role="region"` según corresponda.
- [ ] Navegación por teclado completa en componentes custom (flechas, Home, End, Escape).
- [ ] Contraste de color y tamaños de foco verificados, no solo "se ve bien".

## 5. SEO y metadatos

- [ ] `<title>` y `<meta name="description">` específicos, no genéricos.
- [ ] Open Graph (`og:title`, `og:description`, `og:image`, `og:url`) y `twitter:card`.
- [ ] `<link rel="canonical">`.
- [ ] Datos estructurados JSON-LD si aplica (negocio local, artículo, producto, etc.).
- [ ] Favicon y `apple-touch-icon`.
- [ ] `theme-color` para navegadores móviles.

## 6. Rendimiento

- [ ] Nada de CDN de frameworks CSS en producción (Tailwind Play CDN, etc.) — siempre compilado.
- [ ] Imágenes con `width`/`height` explícitos (evita layout shift) y `loading="lazy"` salvo la crítica del above-the-fold.
- [ ] `fetchpriority="high"` y `<link rel="preload">` para la imagen o recurso que sea el LCP.
- [ ] `preconnect` a orígenes externos críticos (fuentes, analytics).
- [ ] Code-splitting: separar librerías de terceros del bundle propio para que cacheen independiente.
- [ ] Revisar peso real de imágenes fuente (fotos de cámara/celular sin optimizar pueden pesar 500KB–1MB cada una).

## 7. Contenido e imágenes: procedencia y licencias

- [ ] Verificar que cada imagen usada sea propiedad del cliente o de licencia libre — nunca asumir que una foto "de archivo" del proyecto es genérica.
- [ ] Si se reemplaza una imagen por stock externo (Unsplash, etc.): **verificar con una petición real (`curl`) que la URL responde 200 y es una imagen**, no asumir por el ID.
- [ ] `source.unsplash.com` (Unsplash Source, búsqueda por keyword) está descontinuado — no usar. Usar URLs directas `images.unsplash.com/photo-<id>` verificadas.
- [ ] Siempre agregar `data-fallback` o `onerror` a imágenes externas: si el servicio externo cae, no debe romper el layout.
- [ ] No dejar archivos de imagen originales sueltos en la raíz del proyecto una vez migrados a `public/` o `assets/` — genera ambigüedad sobre cuál es la fuente real.

## 8. Analytics y scripts de terceros

- [ ] Tags de analytics (GTM, gtag, Meta Pixel, etc.) documentados y con su propio bloque comentado en el `<head>`.
- [ ] Verificar que no dupliquen o choquen con el bundler (por ejemplo, no cargarlos también vía npm si ya están inline).

## 9. Documentación del proyecto

- [ ] `README.md` que explique cómo correr el proyecto (`dev`, `build`, `preview`) y qué carpeta se sube al hosting.
- [ ] Si el proyecto pasó de "HTML suelto" a "proyecto con build", dejarlo explícito y remarcado — es el error más común de quien no sabe que ya no puede abrir `index.html` con doble clic.
- [ ] Registrar decisiones de nombres/tokens que no sean obvias por el código (por qué un color se llama así, por qué se sacó tal sección).

## 10. Control de versiones

- [ ] Repo git inicializado desde el principio, no al final.
- [ ] `.gitignore` correcto antes del primer commit grande (evitar commitear `node_modules/` o `dist/`).
- [ ] Si hay carpetas hermanas con versiones previas/duplicadas del mismo sitio, dejar claro cuál es la fuente de verdad para no sincronizar o confundir accidentalmente.

## 11. Verificación antes de dar por terminado un cambio

- [ ] Correr `build` después de cada tanda de cambios, no acumular sin validar.
- [ ] Servir el `dist/` real (`preview`) y no confiar solo en que "compiló sin error" — un build limpio no garantiza que el contenido se vea.
- [ ] Verificar con `curl` (o equivalente) que cada asset referenciado (imágenes, CSS, JS) responde 200, no solo que la ruta "se ve bien" en el código.
- [ ] Ante un reporte de "no se ve X", diagnosticar por capas: ¿el HTML lo tiene? ¿el build lo incluye? ¿el navegador tiene caché vieja? ¿el JS se ejecuta sin errores? — en ese orden, antes de reescribir código a ciegas.
