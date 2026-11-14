# Plexiweb

Landing page de Plexiweb. Sitio estático (HTML/CSS/JS), sin build. Tiene un backend chico (`server/`) solo para el panel de métricas.

## Estructura

```
index.html        único punto de entrada
css/style.css      todos los estilos
js/script.js       toda la lógica (carrusel, menú, cookie banner)
metricas.js        manda eventos anónimos (visita, clic a WhatsApp, clic a un proyecto) a /api/metrics
admin.html/.js/.css  panel de métricas (/admin.html): login + resumen de 30 días
server/            backend Node/Express: login, métricas y tarjetas del portfolio (/api/*, /uploads/*; tests: `cd server && npm test`)
Dockerfile         imagen del backend (la web estática NO va en la imagen)
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

Publicado en `https://web.plexi.com.ar/`, en el droplet de DigitalOcean (`167.99.147.158`), detrás de Caddy:

- La web estática la sirve Caddy directo desde el clon `/home/deploy/plexiweb` (montado en solo lectura).
- Solo `/api/*` va al contenedor `plexiweb` (puerto 3006), definido en el `docker-compose.yml` y el `Caddyfile` del repo plexipedidos.
- Cada cambio: `python deploy_plexiweb_nyc1.py "mensaje"` (carpeta `12 pyth commitero`). Hace commit + push, `git pull` en el droplet y reconstruye el contenedor.
- Panel: `https://web.plexi.com.ar/admin.html`. Usuario y hash de la contraseña viven en `/home/deploy/plexiweb.env` del droplet (nunca en el repo).

## Agregar un proyecto al portfolio

Desde el panel: `https://web.plexi.com.ar/admin.html` → solapa **Tarjetas**. Ahí se crean tarjetas nuevas (se sube la imagen, se escribe título, texto y link), se edita cada una y se cambian de lugar arrastrándolas o con las flechas ↑ ↓. Los cambios se ven en la web al recargarla.

- La web dibuja las tarjetas del panel en las 4 columnas, de a una por columna en el orden de la lista (en tablet y mobile `initPortfolioColumns` las acomoda en 2 columnas, como siempre).
- Mientras nadie guarde un cambio en el panel (`GET /api/cards` responde `custom:false`), o si el backend no responde, la web muestra el HTML de `index.html` (`#portfolio-track`/`.portfolio-col`). Ese HTML es también la **semilla** del panel (`server/lib/seed-cards.json`, generada desde él): una vez que el panel guarda algo, editar el HTML ya no cambia lo que se ve.
- Las imágenes subidas viven en el volumen `plexiweb_data` del droplet (`uploads/`, servidas por `/uploads/*`); las de `assets/home/` son del repo.

## Notas

- `assets/home/verax.png` es en realidad un archivo JPEG con esa extensión — funciona, pero si se vuelve a tocar conviene renombrarlo a `.jpg`.
- Ver [ARQUITECTURA.md](./ARQUITECTURA.md) para el checklist de arquitectura del proyecto.
