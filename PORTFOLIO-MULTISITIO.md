# Portfolio multisitio — Plexiweb (AR / US / BR)

Este proyecto (`web.plexi.com.ar`) tiene dos sitios hermanos con el mismo portfolio.
**Cuando se pida agregar, quitar o reordenar una card de portfolio acá, aplicar el
mismo cambio en los tres repos**, salvo que el usuario diga explícitamente que es
solo para este sitio.

## Los tres repos

| Sitio | Ruta local | Remoto | Dominio | Idioma del HTML |
|---|---|---|---|---|
| AR (este repo) | `03plexiweb\plexiweb\plexiweb` | `github.com/Uziel44/plexiweb` | web.plexi.com.ar | Español fijo, sin i18n |
| US | `03plexiweb\plexiweb en\usplexi` | `github.com/Uziel44/usplexi` | plexiweb.app | Inglés base + selector EN/ES vía `js/i18n.js` |
| BR | `03plexiweb\plexiweb br\plexiwebbr` | `github.com/Uziel44/plexiwebbr` | br.plexiweb.app | Portugués fijo, sin i18n |

Los tres son repos git independientes con remotos distintos (no submódulos). Cada
uno necesita su propio `git add` / `commit` / `push`.

## Diferencias de formato por sitio (no copiar y pegar el HTML tal cual)

Las tres cards del portfolio tienen **estructura HTML distinta** entre sitios:

- **AR**: sin `.portfolio-name` (el nombre del proyecto no se muestra, solo el
  subtítulo). Sin `target="_blank"`. Imágenes `.png`/`.jpg` directo en
  `assets/home/`.
  ```html
  <a href="https://dominio.com" class="portfolio-card">
    <img src="assets/home/archivo.jpg" alt="Nombre proyecto" loading="lazy">
    <div class="portfolio-desc">Subtítulo corto en español</div>
  </a>
  ```

- **US**: con `.portfolio-name`, `target="_blank" rel="noopener"`, `width`/`height`
  explícitos, `decoding="async"`, e i18n: `data-i18n` en el subtítulo y
  `data-i18n-attr="alt:clave"` en la imagen. Usa `.webp` (con fallback — hay que
  generar tanto `.jpg`/`.png` como `.webp` en `assets/home/`). Las claves nuevas de
  `data-i18n` deben agregarse también al diccionario `es` en `js/i18n.js` (textos
  en inglés en el HTML, español vive en el JS).
  ```html
  <a href="https://dominio.com" target="_blank" rel="noopener" class="portfolio-card">
    <img src="assets/home/archivo.webp" alt="Project name website homepage" width="W" height="H" loading="lazy" decoding="async" data-i18n-attr="alt:clave-alt">
    <div class="portfolio-name">Project Name</div>
    <div class="portfolio-desc" data-i18n="clave-desc">Subtitle in English</div>
  </a>
  ```

- **BR**: con `.portfolio-name`, `target="_blank" rel="noopener"`,
  `width`/`height` explícitos, sin i18n (texto en portugués fijo). Imágenes
  `.png`/`.jpg` directo en `assets/home/`.
  ```html
  <a href="https://dominio.com" target="_blank" rel="noopener" class="portfolio-card">
    <img src="assets/home/archivo.png" alt="Página inicial do site de [rubro]" width="560" height="400" loading="lazy">
    <div class="portfolio-name">Nome do Projeto</div>
    <div class="portfolio-desc">Subtítulo curto em português</div>
  </a>
  ```

## Procedimiento al agregar una card nueva

1. **Confirmar con el usuario** (si no lo dio ya): subtítulo/rubro en español,
   y en qué columna/posición va. Traducir ese subtítulo a inglés y portugués
   antes de tocar US y BR — no dejar el español en esos sitios.
2. **Imagen fuente**: suele venir como archivo suelto en la raíz de uno de los
   tres repos. Copiarla a `assets/home/` de **cada uno de los tres repos** con
   el mismo nombre de archivo base (ajustando extensión si hace falta: US
   necesita además un `.webp`). Mover el archivo fuente original a
   `assets/_sources/` (AR) una vez copiado, para no dejar sueltos en la raíz.
3. **Editar `index.html`** en los tres repos, respetando el formato de cada
   uno (ver tabla arriba). Mismo dominio/link en los tres.
4. **US únicamente**: agregar las dos claves nuevas (`alt` y `desc`) al
   diccionario `es` de `js/i18n.js`, con su traducción al español.
5. **Verificar visualmente** cada sitio en un server local
   (`python -m http.server <puerto>`) antes de commitear — captura de pantalla
   del portfolio y consola sin errores.
6. **Commit y push por separado** en cada uno de los tres repos (cada uno con
   su propio mensaje de commit, mismo contenido semántico).
7. **Antes de pushear, hacer `git fetch` + revisar `git log main..origin/main`**
   en cada repo: los tres reciben actualizaciones de dominios desde otras
   sesiones con frecuencia. Si el remoto tiene commits nuevos, hacer
   `git merge origin/main --no-edit` y verificar que la card nueva sobrevivió
   el merge antes de pushear.

## Qué NO replicar automáticamente

- Cambios de copy/ventas, precios, SEO, footer, términos/privacidad: son
  específicos de cada mercado (AR vende en pesos a Argentina; US en dólares
  a EE. UU.; BR en reales a Brasil) y no se replican sin pedido explícito.
- El selector de idioma de US (EN/ES) es propio de ese sitio — no agregar
  i18n a AR o BR salvo pedido explícito y confirmado aparte.
