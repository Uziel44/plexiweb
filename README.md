# Plexiweb

Landing page de Plexiweb. Sitio estático (HTML/CSS/JS), sin build ni dependencias — no hay `package.json`.

## Estructura

```
index.html        único punto de entrada
css/style.css      todos los estilos
js/script.js       toda la lógica (carrusel, menú, cookie banner)
assets/            imágenes (logo, portfolio, fondos)
```

## Previsualizar en local

No requiere instalación. Cualquier servidor estático sirve:

```bash
# con VS Code: extensión Live Server, o
npx serve .
# o
python -m http.server 8000
```

Abrir `index.html` con doble clic también funciona, salvo que se necesite `fetch`/rutas relativas estrictas.

## Deploy

Se sube la raíz del repo tal cual (no hay carpeta `dist/`). Publicado en Cloudflare Pages: `https://plexiweb.pages.dev/`.

## Agregar un proyecto al portfolio

En `index.html`, dentro de `#portfolio-track`, agregar otra tarjeta `<a class="portfolio-card">` igual a las existentes, en cualquier posición. El carrusel (flechas + dots) se recalcula solo desde `js/script.js` — no hace falta tocar CSS ni JS.

## Notas

- `assets/home/verax.png` es en realidad un archivo JPEG con esa extensión — funciona, pero si se vuelve a tocar conviene renombrarlo a `.jpg`.
- Ver [ARQUITECTURA.md](./ARQUITECTURA.md) para el checklist de arquitectura del proyecto.
