# PLEXIWEB: backend chico de la landing (login del panel /admin.html + metricas anonimas).
#
# Se construye desde el docker-compose de plexipedidos (servicio "plexiweb", build: /home/deploy/plexiweb).
# La web estatica NO va en la imagen: la sirve Caddy directo desde el clon (/srv/plexiweb). Caddy solo le
# manda /api/* a este contenedor, asi que si se cae la landing sigue en pie.
FROM node:22-alpine

WORKDIR /app/server

# Primero solo el manifest, para que Docker cachee `npm ci` mientras no cambien las dependencias.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/server.js ./
COPY server/lib ./lib

# data/ (metricas.ndjson) se monta como volumen: sin el, cada deploy borraria las metricas. Se crea con
# dueño "node" para que el volumen nuevo herede ese permiso y el proceso pueda escribir.
RUN mkdir -p data && chown node:node data
USER node

ENV NODE_ENV=production PORT=3006 HOST=0.0.0.0
EXPOSE 3006

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
