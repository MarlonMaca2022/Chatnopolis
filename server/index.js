require('dotenv').config();
const express = require('express');
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
