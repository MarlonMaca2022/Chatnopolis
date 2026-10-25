const fs = require('fs');
const path = require('path');

// El <head> de cada ruta se arma acá: el index.html del build trae un marcador
// <!--seo--> y el servidor lo reemplaza según la ruta pedida. El contenido visible
// lo sigue pintando React; esto es solo lo que leen Google, los filtros de
// control parental y las vistas previas de WhatsApp/redes, que no ejecutan JS.

const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
const MARKER = '<!--seo-->';

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

// /chat no tiene nada que indexar: sin sesión redirige a la portada.
const NOINDEX_PATHS = new Set(['/chat']);

let template = null;

function loadTemplate() {
  if (template !== null) return template;
  template = fs.readFileSync(path.join(CLIENT_DIST, 'index.html'), 'utf8');
  if (!template.includes(MARKER)) {
    console.warn(
      `SEO: client/dist/index.html no tiene el marcador ${MARKER}; las páginas salen sin etiquetas propias. Volvé a correr npm run build.`
    );
  }
  return template;
}

function headFor(pathname) {
  const tags = [];
  if (NOINDEX_PATHS.has(pathname)) tags.push('<meta name="robots" content="noindex" />');
  if (ADULT_PATHS.has(pathname)) tags.push(ADULT_META);
  return tags.join('\n    ');
}

// HTML completo para una ruta de la SPA.
function renderPage(pathname) {
  return loadTemplate().replace(MARKER, headFor(pathname));
}

module.exports = { CLIENT_DIST, renderPage };
