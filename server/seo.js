const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { rooms } = require('./db');

// Todo el HTML de la SPA sale de acá, en dos partes:
// - El <head> de cada ruta: el index.html del build trae un marcador <!--seo--> y
//   se reemplaza según la ruta pedida. Es lo que leen los filtros de control
//   parental y las vistas previas de WhatsApp/redes, que no ejecutan JS.
// - El contenido de las páginas públicas (homepage y legales), prerenderizado con
//   React (client/src/entry-server.jsx, compilado a client/dist-server). Así Google,
//   Bing y los buscadores con IA leen el texto sin ejecutar JS, y en el navegador
//   React se engancha a ese HTML (hydrateRoot en main.jsx).
// Si el render falla o no hay build del servidor, la página sale vacía y React la
// arma en el navegador como antes: el prerender mejora, nunca rompe.

const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
const SSR_ENTRY = path.join(__dirname, '..', 'client', 'dist-server', 'entry-server.js');
const MARKER = '<!--seo-->';
const ROOT = '<div id="root"></div>';

// Marcadores de contenido adulto: los leen los filtros de control parental para
// bloquear la página en el equipo de un menor, y Google para SafeSearch. Van por
// página y no en todo el sitio: la portada, las salas y las legales no tienen nada
// explícito, y con la etiqueta global no aparecerían con SafeSearch activado. Lo
// adulto vive en los privados, que solo existen dentro de /chat.
// Si algún día hay una sala +18, su /sala/:id se suma acá.
const ADULT_PATHS = new Set(['/chat']);
const ADULT_META =
  '<meta name="rating" content="adult" />\n' +
  '    <meta name="RATING" content="RTA-5042-1996-1400-1577-RTA" />';

// Nada que indexar: /chat sin sesión redirige a /entrar, y /entrar es un formulario
// que no tiene que competir en Google con la homepage.
const NOINDEX_PATHS = new Set(['/chat', '/entrar']);

const TEMPLATE_PATH = path.join(CLIENT_DIST, 'index.html');
let template = null;
let templateMtime = 0;

// Se relee cuando cambia en disco: un `npm run build` sin reiniciar cambia los
// nombres de los assets, y el HTML viejo en memoria apuntaría a archivos borrados.
function loadTemplate() {
  const mtime = fs.statSync(TEMPLATE_PATH).mtimeMs;
  if (template !== null && mtime === templateMtime) return template;
  template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  templateMtime = mtime;
  if (!template.includes(MARKER)) {
    console.warn(
      `SEO: client/dist/index.html no tiene el marcador ${MARKER}; las páginas salen sin etiquetas propias. Volvé a correr npm run build.`
    );
  }
  return template;
}

// El módulo del render es ESM y este archivo CommonJS: se carga con import(), que
// es asincrónico. Mientras no termina (los primeros milisegundos tras arrancar),
// las páginas salen sin prerender. Se recarga si cambia en disco (un build sin
// reiniciar), con el mtime en la URL para saltear la caché de módulos.
let ssr = null;
let ssrMtime = 0;
let ssrLoading = false;

function refreshRenderer() {
  let mtime;
  try {
    mtime = fs.statSync(SSR_ENTRY).mtimeMs;
  } catch {
    return; // sin build del servidor: se sirve sin prerender
  }
  if (mtime === ssrMtime || ssrLoading) return;
  ssrLoading = true;
  import(`${pathToFileURL(SSR_ENTRY).href}?v=${mtime}`)
    .then((mod) => {
      ssr = { render: mod.render, paths: new Set(mod.PRERENDER_PATHS) };
      ssrMtime = mtime;
    })
    .catch((err) => console.error('SEO: no se pudo cargar el render del servidor:', err.message))
    .finally(() => {
      ssrLoading = false;
    });
}
refreshRenderer();

// Dentro de <script> un "</script>" en los datos cerraría el bloque: los "<" van escapados.
const jsonForScript = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

function bodyFor(pathname) {
  refreshRenderer();
  if (!ssr || !ssr.paths.has(pathname)) return ROOT;
  const data = { rooms: rooms.all().map(({ id, name }) => ({ id, name })) };
  try {
    const html = ssr.render(pathname, data);
    // Los mismos datos con los que se renderizó, para que el navegador hidrate igual
    return (
      `<div id="root">${html}</div>` +
      `<script type="application/json" id="initial-data">${jsonForScript(data)}</script>`
    );
  } catch (err) {
    console.error(`SEO: falló el prerender de ${pathname}:`, err.message);
    return ROOT;
  }
}

function headFor(pathname) {
  const tags = [];
  if (NOINDEX_PATHS.has(pathname)) tags.push('<meta name="robots" content="noindex" />');
  if (ADULT_PATHS.has(pathname)) tags.push(ADULT_META);
  return tags.join('\n    ');
}

// HTML completo para una ruta de la SPA. Reemplazos con función y no con texto:
// con texto, un "$&" en el nombre de una sala se interpretaría como patrón.
function renderPage(pathname) {
  const head = headFor(pathname);
  const body = bodyFor(pathname);
  return loadTemplate()
    .replace(MARKER, () => head)
    .replace(ROOT, () => body);
}

module.exports = { CLIENT_DIST, renderPage };
