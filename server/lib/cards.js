'use strict';

// Tarjetas del portfolio ("Nuestro Portfolio" de la landing): imagen + título + descripción + link.
// Se guardan en data/cards.json (escritura atómica, una a la vez) y las imágenes subidas desde el panel en
// data/uploads/ con nombre aleatorio. Mientras nadie edite nada, cards.json no existe y se muestran las tarjetas
// de seed-cards.json (las mismas que trae el HTML de la web): el panel arranca con lo que ya hay publicado.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

class AdminError extends Error {
  constructor(status, code, message, field) {
    super(message);
    this.name = 'AdminError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const invalid = (message, field) => new AdminError(400, 'dato_invalido', message, field);

const MAX_CARDS = 40;
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 140;
const LINK_MAX = 300;
// Imágenes que ya están en el repo (assets/home/) o subidas desde el panel (uploads/, nombre aleatorio).
const STATIC_IMAGE = /^assets\/home\/[\w-][\w.-]{0,119}\.(?:webp|jpe?g|png|avif)$/i;
const UPLOADED_IMAGE = /^uploads\/[a-f0-9]{32}\.(?:jpg|png|webp)$/;
const CARD_ID = /^c_[a-z0-9]{4,20}$/;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Tipo real según los primeros bytes: el Content-Type que manda el cliente no es de fiar.
function imageExtension(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function cleanText(value, label, max, { required = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw invalid(`${label}: tiene que ser texto.`, label);
  const text = value.replace(/\s+/g, ' ').trim();
  if (required && !text) throw invalid(`${label}: es obligatorio.`, label);
  if (text.length > max) throw invalid(`${label}: puede tener hasta ${max} caracteres.`, label);
  return text;
}

// Vacío = tarjeta sin enlace. Sin "https://" se lo agrega; solo http(s): nada de javascript: ni data:.
function cleanLink(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw invalid('Link: tiene que ser texto.', 'link');
  const text = value.trim();
  if (!text) return '';
  if (text.length > LINK_MAX) throw invalid(`Link: puede tener hasta ${LINK_MAX} caracteres.`, 'link');
  const full = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let url;
  try {
    url = new URL(full);
  } catch {
    throw invalid('Link: no parece una dirección web válida (ej: https://misitio.com).', 'link');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalid('Link: tiene que empezar con http:// o https://.', 'link');
  if (!url.hostname.includes('.')) throw invalid('Link: no parece una dirección web válida (ej: https://misitio.com).', 'link');
  return full;
}

function createCardStore({ dataDir, seedPath = path.join(__dirname, 'seed-cards.json') }) {
  const file = path.join(dataDir, 'cards.json');
  const uploadsDir = path.join(dataDir, 'uploads');

  // Una escritura a la vez: leer-modificar-escribir sin pisarse si llegan dos pedidos juntos.
  let chain = Promise.resolve();
  const locked = (task) => {
    const run = chain.then(task);
    chain = run.catch(() => {});
    return run;
  };

  const readSeed = () => JSON.parse(fs.readFileSync(seedPath, 'utf8')).cards;
  // null = nadie editó todavía. Si cards.json existe pero está roto, falla (no se pisa con la semilla: se perderían los cambios).
  const readStored = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')).cards;
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  };
  const write = (cards) => {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify({ cards }, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  const mutate = (fn) =>
    locked(() => {
      const before = readStored() ?? readSeed();
      const after = fn(before.map((card) => ({ ...card })));
      write(after.cards);
      return after.result;
    });

  function checkImage(value) {
    if (typeof value !== 'string' || !(STATIC_IMAGE.test(value) || UPLOADED_IMAGE.test(value))) {
      throw invalid('Imagen: subí una imagen JPG, PNG o WebP.', 'image');
    }
    if (UPLOADED_IMAGE.test(value) && !fs.existsSync(path.join(dataDir, value))) {
      throw invalid('Imagen: esa imagen ya no está en el servidor. Subila de nuevo.', 'image');
    }
    return value;
  }

  function parse(input) {
    if (!isObject(input)) throw invalid('Faltan los datos de la tarjeta.');
    return {
      title: cleanText(input.title, 'Título', TITLE_MAX, { required: true }),
      description: cleanText(input.description, 'Descripción', DESCRIPTION_MAX),
      link: cleanLink(input.link),
      image: checkImage(input.image),
      tall: input.tall === true,
    };
  }

  // Borra del disco las imágenes subidas que ninguna tarjeta usa más (las de assets/home/ son del repo: no se tocan).
  function dropUnusedUploads(images, cards) {
    const used = new Set(cards.map((card) => card.image));
    for (const image of images) {
      if (UPLOADED_IMAGE.test(image) && !used.has(image)) fs.rmSync(path.join(dataDir, image), { force: true });
    }
  }

  const notFound = () => new AdminError(404, 'no_encontrada', 'Esa tarjeta ya no existe. Actualizamos la lista.');

  return {
    // Para el panel: siempre hay lista (semilla si nadie editó). `custom` dice si ya se editó alguna vez.
    view() {
      const stored = readStored();
      return { custom: stored !== null, cards: stored ?? readSeed() };
    },

    // Para la landing: solo manda las tarjetas si se editaron; si no, la web deja su HTML tal cual.
    publicView() {
      const stored = readStored();
      return stored === null ? { custom: false } : { custom: true, cards: stored };
    },

    create: (input) =>
      mutate((cards) => {
        if (cards.length >= MAX_CARDS) throw invalid(`Ya hay ${MAX_CARDS} tarjetas, que es el máximo. Eliminá alguna para sumar otra.`);
        const card = { id: `c_${crypto.randomBytes(5).toString('hex')}`, ...parse(input) };
        return { cards: [...cards, card], result: card };
      }),

    update: (id, input) =>
      mutate((cards) => {
        const index = cards.findIndex((card) => card.id === id);
        if (index === -1) throw notFound();
        const replaced = cards[index].image;
        const card = { id, ...parse(input) };
        cards[index] = card;
        dropUnusedUploads([replaced], cards);
        return { cards, result: card };
      }),

    remove: (id) =>
      mutate((cards) => {
        const index = cards.findIndex((card) => card.id === id);
        if (index === -1) throw notFound();
        const [removed] = cards.splice(index, 1);
        dropUnusedUploads([removed.image], cards);
        return { cards, result: undefined };
      }),

    // `ids` tiene que ser exactamente las tarjetas actuales, en el nuevo orden.
    reorder: (ids) =>
      mutate((cards) => {
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !CARD_ID.test(id))) {
          throw invalid('Orden inválido.');
        }
        const byId = new Map(cards.map((card) => [card.id, card]));
        if (ids.length !== cards.length || new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
          throw new AdminError(409, 'lista_desactualizada', 'La lista cambió mientras la editabas. La actualizamos: probá de nuevo.');
        }
        return { cards: ids.map((id) => byId.get(id)), result: undefined };
      }),

    async saveImage(buffer) {
      const ext = imageExtension(buffer);
      if (!ext) throw invalid('El archivo no es una imagen JPG, PNG o WebP válida.');
      fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o700 });
      const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
      await fs.promises.writeFile(path.join(uploadsDir, name), buffer, { flag: 'wx', mode: 0o600 });
      return `uploads/${name}`;
    },
  };
}

module.exports = { AdminError, createCardStore, imageExtension };
