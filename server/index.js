require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const apiRoutes = require('./routes');
const { setupSocket } = require('./socket');
const { startCleanupJobs } = require('./cleanup');
const { UPLOADS_DIR } = require('./uploads');
const { apiLimiter, TRUST_PROXY } = require('./ratelimit');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('io', io);
// Detrás de nginx la IP de origen viaja en X-Forwarded-For; sin esto todos los
// límites por IP verían una sola IP (la del proxy) y se aplicarían al tráfico
// entero. El `1` es "confío en un único proxy, el mío". Ver server/ratelimit.js.
if (TRUST_PROXY) app.set('trust proxy', 1);

// Cabeceras de seguridad. La que importa es la CSP: aunque alguien lograra meter
// un <script> en la página, el navegador solo ejecuta código servido por este
// mismo sitio. Todo lo del cliente es de origen propio (sin CDN, sin fuentes ni
// analítica de terceros), por eso casi todo es 'self'. Si algún día se suma un
// tercero, va acá o el navegador lo bloquea en silencio.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        // Sin 'unsafe-inline': por eso el script del tema vive en un archivo
        // (client/public/theme-init.js) y no inline en index.html.
        scriptSrc: ["'self'"],
        // Tampoco atributos onclick="..." en el HTML (React no los usa).
        scriptSrcAttr: ["'none'"],
        // emoji-picker-react mete su CSS con un <style> en tiempo de ejecución.
        // Un estilo inyectado no ejecuta código, así que se acepta ese riesgo
        // menor en vez de pasarle un nonce por respuesta.
        styleSrc: ["'self'", "'unsafe-inline'"],
        // data: = el QR del 2FA (lo genera el servidor). blob: = la vista
        // previa de la foto antes de mandarla (MessageInput).
        imgSrc: ["'self'", 'data:', 'blob:'],
        // 'self' cubre también el WebSocket de Socket.IO al mismo host.
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    // HSTS: el navegador recuerda que este sitio va solo por HTTPS y no vuelve a
    // intentar http://, ni aunque alguien en la misma wifi lo empuje a hacerlo.
    // Sobre http (desarrollo local) el navegador la ignora. Sin includeSubDomains
    // ni preload a propósito: obligarían a cualquier subdominio futuro a tener
    // HTTPS, y el preload no se deshace rápido.
    strictTransportSecurity: { maxAge: 180 * 24 * 60 * 60, includeSubDomains: false },
    // Lo que importa del Referer es no filtrar a otros sitios la ruta interna;
    // el valor por defecto de helmet (no-referrer) ya lo cumple.
  })
);

app.use(express.json({ limit: '32kb' }));

app.use('/api', apiLimiter, apiRoutes);
// nosniff: el tipo del archivo lo declara quien sube, no lo deducimos de los bytes.
// Con esta cabecera el navegador respeta el Content-Type que mandamos en vez de
// adivinar, así que un archivo con contenido de página web guardado como .jpg no
// se ejecuta. Content-Disposition lo refuerza: se muestra o se baja, no se navega.
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
    },
  })
);

// Frontend React compilado (client/dist) con fallback SPA
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^\/(?!api|uploads|socket\.io).*/, (req, res) =>
    res.sendFile(path.join(CLIENT_DIST, 'index.html'))
  );
}

setupSocket(io);
startCleanupJobs();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chatnopolis corriendo en http://localhost:${PORT}`);
  console.log(
    TRUST_PROXY
      ? 'Límites por IP: usando X-Forwarded-For (TRUST_PROXY=1).'
      : 'Límites por IP: usando la IP de la conexión. Si hay nginx delante, poné TRUST_PROXY=1 en el .env.'
  );
});
