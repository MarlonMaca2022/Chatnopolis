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

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('io', io);
app.use(express.json());

app.use('/api', apiRoutes);
app.use('/uploads', express.static(UPLOADS_DIR));

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
});
