const { users, rooms, messages, guestBans } = require('./db');
const { verifyToken } = require('./auth');
const { pruneRoom } = require('./cleanup');

const usersOnline = {}; // { socketId: { username, role, room, isMuted } }

// Duraciones de ban aceptadas, en minutos. Cualquier otro valor => permanente.
const BAN_DURATIONS = [10, 60, 240];

function setupSocket(io) {
  // Autenticación en el handshake: token JWT (registrados) o username (invitados).
  // El rol NUNCA viene del cliente — se deriva del token o se fuerza 'guest'.
  io.use((socket, next) => {
    const { token, username } = socket.handshake.auth || {};

    if (token) {
      const payload = verifyToken(token);
      if (!payload) return next(new Error('Sesión inválida o expirada'));
      const dbUser = users.findByUsername(payload.username);
      if (!dbUser) return next(new Error('Sesión inválida o expirada'));
      const ban = users.banStatus(dbUser.username);
      if (ban.banned) return next(new Error(banMessage(ban.until, 'Tu cuenta está baneada')));
      socket.user = { username: dbUser.username, role: dbUser.role, isMuted: !!dbUser.is_muted };
      return next();
    }

    const nick = (username || '').trim();
    if (!/^[a-zA-Z0-9_\-áéíóúñÁÉÍÓÚÑ ]{3,20}$/.test(nick)) {
      return next(new Error('Nick inválido (3-20 caracteres)'));
    }
    const guestBan = guestBans.status(nick);
    if (guestBan.banned) return next(new Error(banMessage(guestBan.until, 'Este nombre está baneado')));
    if (users.findByUsername(nick)) {
      return next(new Error('Ese nombre pertenece a un usuario registrado. Elige otro.'));
    }
    socket.user = { username: nick, role: 'guest', isMuted: false };
    next();
  });

  io.on('connection', (socket) => {
    socket.on('join', ({ room } = {}) => {
      const roomId = rooms.find(room) ? room : 'general';
      const me = socket.user;

      // Salir de la sala anterior si cambia
      const prev = usersOnline[socket.id];
      if (prev && prev.room !== roomId) {
        socket.leave(prev.room);
        updateRoomUsers(io, prev.room);
      }

      usersOnline[socket.id] = { ...me, room: roomId, socketId: socket.id };
      socket.join(roomId);

      // Historial persistido de la sala
      socket.emit('history', {
        room: roomId,
        messages: messages.roomHistory(roomId).map((m) => ({
          username: m.sender,
          text: m.text,
          imageUrl: m.imageUrl,
          imageExpired: !!m.imageExpired,
          createdAt: m.createdAt,
        })),
      });

      socket.to(roomId).emit('message', system(`${me.username} se ha unido.`));
      socket.emit('message', system(`Bienvenido a la sala, ${me.username}.`));
      updateRoomUsers(io, roomId);
    });

    socket.on('chatMessage', ({ text, imageUrl } = {}) => {
      const user = usersOnline[socket.id];
      if (!user) return;
      if (user.isMuted) {
        return socket.emit('message', system('Estás silenciado.', 'system-error'));
      }

      const cleanText = typeof text === 'string' ? text.trim().slice(0, 2000) : '';

      // Las fotos solo se permiten en privado 1 a 1. El archivo ya subido no se
      // borra acá (la URL viene del cliente y podría ser la de otro mensaje):
      // queda huérfano y lo recoge el barrido de server/cleanup.js.
      if (validImageUrl(imageUrl)) {
        socket.emit(
          'message',
          system('Las fotos solo se pueden enviar por mensaje privado.', 'system-error')
        );
        if (!cleanText) return;
      }
      if (!cleanText) return;

      messages.saveRoom(user.room, user.username, cleanText, null);
      pruneRoom(user.room);
      io.to(user.room).emit('message', {
        username: user.username,
        role: user.role,
        text: cleanText,
        imageUrl: null,
        createdAt: new Date().toISOString(),
      });
    });

    socket.on('privateMessage', ({ targetUsername, text, imageUrl } = {}) => {
      const user = usersOnline[socket.id];
      if (!user) return;
      if (user.isMuted) {
        return socket.emit('message', system('Estás silenciado.', 'system-error'));
      }

      const cleanText = typeof text === 'string' ? text.trim().slice(0, 2000) : '';
      const cleanImage = validImageUrl(imageUrl);
      if (!cleanText && !cleanImage) return;

      const targetSocketId = findSocketId(targetUsername);
      const data = {
        username: user.username,
        text: cleanText,
        imageUrl: cleanImage,
        isPrivate: true,
        from: user.username,
        to: targetUsername,
        createdAt: new Date().toISOString(),
      };

      messages.saveDM(user.username, targetUsername, cleanText || null, cleanImage);

      if (targetSocketId) io.to(targetSocketId).emit('message', data);
      socket.emit('message', data);
      if (!targetSocketId) {
        socket.emit('message', system(`${targetUsername} no está en línea; verá tu mensaje si es un usuario registrado.`, 'system'));
      }
    });

    socket.on('dm:history', ({ withUser } = {}) => {
      const user = usersOnline[socket.id];
      if (!user || typeof withUser !== 'string') return;
      socket.emit('dm:history', {
        withUser,
        messages: messages.dmHistory(user.username, withUser).map((m) => ({
          username: m.sender,
          text: m.text,
          imageUrl: m.imageUrl,
          imageExpired: !!m.imageExpired,
          isPrivate: true,
          from: m.sender,
          to: m.recipient,
          createdAt: m.createdAt,
        })),
      });
    });

    // --- Acciones de administración (rol verificado server-side) ---

    socket.on('admin:kick', (targetUsername) => {
      if (!isAdmin(socket) || targetUsername === socket.user.username) return;
      disconnectUser(io, targetUsername, 'Has sido expulsado por un administrador.');
    });

    socket.on('admin:ban', (payload) => {
      if (!isAdmin(socket)) return;

      // Acepta { username, durationMinutes }; durationMinutes null/ausente = permanente
      const targetUsername = typeof payload === 'string' ? payload : payload?.username;
      if (!targetUsername || targetUsername === socket.user.username) return;

      const minutes = BAN_DURATIONS.includes(payload?.durationMinutes)
        ? payload.durationMinutes
        : null;
      const until = minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null;

      if (users.findByUsername(targetUsername)) {
        users.setBanned(targetUsername, true, until);
      } else {
        guestBans.add(targetUsername, until);
      }

      disconnectUser(io, targetUsername, banMessage(until));
    });

    socket.on('admin:mute', (targetUsername) => {
      if (!isAdmin(socket) || targetUsername === socket.user.username) return;

      const dbUser = users.findByUsername(targetUsername);
      const targetSocket = liveSocket(io, targetUsername);
      if (!dbUser && !targetSocket) return;

      // El toggle se calcula desde donde está la verdad: la DB si es un usuario
      // registrado, la conexión viva si es un invitado.
      const isMuted = dbUser ? !dbUser.is_muted : !targetSocket.user.isMuted;

      if (dbUser) users.setMuted(targetUsername, isMuted);
      syncMuted(io, targetUsername, isMuted);
    });

    socket.on('disconnect', () => {
      const user = usersOnline[socket.id];
      if (user) {
        delete usersOnline[socket.id];
        io.to(user.room).emit('message', system(`${user.username} ha salido.`));
        updateRoomUsers(io, user.room);
      }
    });
  });
}

// --- Helpers ---

function system(text, type = 'system') {
  return { username: 'Sistema', text, type, createdAt: new Date().toISOString() };
}

// until null => permanente. `subject` dice qué está baneado (la cuenta o el nick).
function banMessage(until, subject = 'Has sido baneado') {
  return until
    ? `${subject}. Podrás volver a entrar en ${formatRemaining(until)}.`
    : `${subject} de forma permanente.`;
}

function formatRemaining(until) {
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 60_000) return 'menos de un minuto';

  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} minutos`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hoursText = hours === 1 ? '1 hora' : `${hours} horas`;
  return rest ? `${hoursText} y ${rest} minutos` : hoursText;
}

function disconnectUser(io, username, reason) {
  const socketId = findSocketId(username);
  if (!socketId) return;
  io.to(socketId).emit('forceDisconnect', reason);
  io.sockets.sockets.get(socketId)?.disconnect();
}

function liveSocket(io, username) {
  const socketId = findSocketId(username);
  return (socketId && io.sockets.sockets.get(socketId)) || null;
}

// Aplica un cambio de silencio a la sesión viva, si la hay. `usersOnline` vive en
// este módulo, así que las rutas REST también pasan por acá para no desincronizarla.
// Clave: escribimos en socket.user, que es de donde `join` reconstruye la entrada
// al cambiar de sala — si solo tocáramos usersOnline, el silencio se perdería.
function syncMuted(io, username, isMuted) {
  const target = liveSocket(io, username);
  if (!target) return;

  target.user.isMuted = isMuted;
  const online = usersOnline[target.id];
  if (online) {
    online.isMuted = isMuted;
    updateRoomUsers(io, online.room);
  }
  io.to(target.id).emit(
    'message',
    system(isMuted ? 'Has sido silenciado.' : 'Ya puedes hablar.')
  );
}

function isAdmin(socket) {
  const user = usersOnline[socket.id];
  return user && user.role === 'admin';
}

function findSocketId(username) {
  return Object.keys(usersOnline).find((id) => usersOnline[id].username === username);
}

function updateRoomUsers(io, room) {
  io.to(room).emit('roomUsers', {
    room,
    users: Object.values(usersOnline)
      .filter((u) => u.room === room)
      .map(({ username, role, isMuted }) => ({ username, role, isMuted: !!isMuted })),
  });
}

// Solo aceptamos imágenes subidas a nuestro propio servidor
function validImageUrl(url) {
  return typeof url === 'string' && /^\/uploads\/[\w.-]+$/.test(url) ? url : null;
}

module.exports = { setupSocket, syncMuted };
