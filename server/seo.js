const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { rooms } = require('./db');

// Todo el HTML de la SPA sale de acá, en dos partes:
// - El <head> de cada ruta: el index.html del build trae un bloque entre <!--seo-->
//   y <!--/seo--> que se reemplaza según la ruta pedida (título, descripción,
//   canonical, vista previa para redes, noindex, etiqueta adulta). Es lo que leen
//   Google, los filtros de control parental y las vistas previas de WhatsApp/redes,
//   que no ejecutan JS.
// - El contenido de las páginas públicas (homepage y legales), prerenderizado con
//   React (client/src/entry-server.jsx, compilado a client/dist-server). Así Google,
//   Bing y los buscadores con IA leen el texto sin ejecutar JS, y en el navegador
//   React se engancha a ese HTML (hydrateRoot en main.jsx).
// Los títulos y descripciones vienen del cliente (client/src/lib/seo.js) a través
// de ese mismo build. Si el render falla o no hay build del servidor, la página
// sale con el <head> por defecto y vacía, y React la arma en el navegador: el
// prerender mejora, nunca rompe.

const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
const SSR_ENTRY = path.join(__dirname, '..', 'client', 'dist-server', 'entry-server.js');
const SEO_BLOCK = /<!--seo-->([\s\S]*?)<!--\/seo-->/;
const ROOT = '<div id="root"></div>';

// Dominio público para canonical, vista previa y sitemap. Sin barra final.
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://chatnopolis.com').replace(/\/+$/, '');

// Marcadores de contenido adulto: los leen los filtros de control parental para
// bloquear la página en el equipo de un menor, y Google para SafeSearch. Van por
// página y no en todo el sitio: la portada, las salas y las legales no tienen nada
// explícito, y con la etiqueta global no aparecerían con SafeSearch activado. Lo
// adulto vive en los privados, que solo existen dentro de /chat.
// Si algún día hay una sala +18, su /sala/:id se suma acá.
const ADULT_PATHS = new Set(['/chat']);
const ADULT_META = [
  '<meta name="rating" content="adult" />',
  '<meta name="RATING" content="RTA-5042-1996-1400-1577-RTA" />',
];

// Nada que indexar: /chat sin sesión redirige a /entrar, y /entrar es un formulario
// que no tiene que competir en Google con la homepage. No van en el Disallow de
// robots.txt a propósito: si Google no puede entrar, tampoco ve el noindex, y una
// URL bloqueada pero enlazada puede aparecer igual en los resultados.
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
  if (!SEO_BLOCK.test(template)) {
    console.warn(
      'SEO: client/dist/index.html no tiene el bloque <!--seo-->...<!--/seo-->; las páginas salen sin etiquetas propias. Volvé a correr npm run build.'
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
      ssr = {
        render: mod.render,
        prerender: new Set(mod.PRERENDER_PATHS),
        known: new Set(mod.APP_PATHS),
        meta: mod.PAGE_META,
        siteName: mod.SITE_NAME,
      };
      ssrMtime = mtime;
    })
    .catch((err) => console.error('SEO: no se pudo cargar el render del servidor:', err.message))
    .finally(() => {
      ssrLoading = false;
    });
}
refreshRenderer();

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Dentro de <script> un "</script>" en los datos cerraría el bloque: los "<" van escapados.
const jsonForScript = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

// "/terminos/" es la misma página que "/terminos"
const normalize = (pathname) => pathname.replace(/\/+$/, '') || '/';

function bodyFor(pathname) {
  if (!ssr || !ssr.prerender.has(pathname)) return ROOT;
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

function headFor(pathname, found, defaults) {
  const tags = [];
  const meta = ssr && (found ? ssr.meta[pathname] : { title: `Página no encontrada | ${ssr.siteName}` });
  const noindex = !found || NOINDEX_PATHS.has(pathname);

  if (meta) {
    tags.push(`<title>${escapeHtml(meta.title)}</title>`);
    if (meta.description) tags.push(`<meta name="description" content="${escapeHtml(meta.description)}" />`);
  } else {
    // Sin build del servidor no hay títulos por ruta: queda lo de index.html
    tags.push(defaults.trim());
  }

  if (noindex) {
    tags.push('<meta name="robots" content="noindex" />');
  } else if (meta) {
    const url = `${PUBLIC_URL}${pathname === '/' ? '/' : pathname}`;
    tags.push(
      `<link rel="canonical" href="${escapeHtml(url)}" />`,
      '<meta property="og:type" content="website" />',
      `<meta property="og:site_name" content="${escapeHtml(ssr.siteName)}" />`,
      '<meta property="og:locale" content="es_LA" />',
      `<meta property="og:url" content="${escapeHtml(url)}" />`,
      `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
      `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
      '<meta name="twitter:card" content="summary" />'
    );
    // Datos estructurados: le dicen a Google cómo se llama el sitio (el nombre que
    // muestra arriba del resultado en vez del dominio).
    if (pathname === '/') {
      const site = { '@context': 'https://schema.org', '@type': 'WebSite', name: ssr.siteName, url: `${PUBLIC_URL}/`, inLanguage: 'es' };
      tags.push(`<script type="application/ld+json">${jsonForScript(site)}</script>`);
    }
    // Páginas de sala (client/src/lib/roomPages.js): las preguntas de la página, que
    // ayudan a los buscadores con IA a entenderla y citarla, y la ruta
    // "Inicio › Chat de Medellín", que Google muestra en el resultado en vez de la URL.
    if (meta.faq?.length) {
      const faq = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: meta.faq.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      };
      tags.push(`<script type="application/ld+json">${jsonForScript(faq)}</script>`);
    }
    if (meta.breadcrumb) {
      const crumbs = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${PUBLIC_URL}/` },
          { '@type': 'ListItem', position: 2, name: meta.breadcrumb, item: url },
        ],
      };
      tags.push(`<script type="application/ld+json">${jsonForScript(crumbs)}</script>`);
    }
  }

  if (ADULT_PATHS.has(pathname)) tags.push(...ADULT_META);
  return tags.join('\n    ');
}

// HTML completo para una ruta de la SPA, con su código de estado. Una ruta que la
// app no tiene responde 404 (el navegador igual redirige a la homepage): con un 200
// Google la indexaría como una copia de la homepage. Sin build del servidor no se
// sabe qué rutas existen y todo responde 200, como antes.
// Reemplazos con función y no con texto: con texto, un "$&" en el nombre de una
// sala se interpretaría como patrón.
function renderPage(rawPath) {
  refreshRenderer();
  const pathname = normalize(rawPath);
  const found = !ssr || ssr.known.has(pathname);
  const page = loadTemplate();
  const defaults = (page.match(SEO_BLOCK) || [])[1] || '';
  const head = headFor(pathname, found, defaults);
  const body = found ? bodyFor(pathname) : ROOT;
  return {
    status: found ? 200 : 404,
    html: page.replace(SEO_BLOCK, () => head).replace(ROOT, () => body),
  };
}

// Las páginas que queremos en Google: las prerenderizadas que no llevan noindex
// (las de sala incluidas: publicRoutes.jsx las prerenderiza).
function indexablePaths() {
  const paths = ssr ? [...ssr.prerender] : ['/'];
  return paths.filter((p) => !NOINDEX_PATHS.has(p));
}

function robotsTxt() {
  return [
    'User-agent: *',
    // La API no es contenido, y las fotos de los privados no tienen que aparecer
    // en ningún buscador (los nombres son al azar, pero igual).
    'Disallow: /api/',
    'Disallow: /uploads/',
    'Disallow: /socket.io/',
    '',
    `Sitemap: ${PUBLIC_URL}/sitemap.xml`,
    '',
  ].join('\n');
}

function sitemapXml() {
  refreshRenderer();
  const urls = indexablePaths()
    .map((p) => `  <url><loc>${escapeHtml(`${PUBLIC_URL}${p}`)}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

module.exports = { CLIENT_DIST, renderPage, robotsTxt, sitemapXml };
