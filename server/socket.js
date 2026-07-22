const { users, rooms, messages, guestBans } = require('./db');
const { verifyToken } = require('./auth');

const usersOnline = {}; // { socketId: { username, role, room, isMuted } }

function setupSocket(io) {
  // Autenticación en el handshake: token JWT (registrados) o username (invitados).
  // El rol NUNCA viene del cliente — se deriva del token o se fuerza 'guest'.
  io.use((socket, next) => {
    const { token, username } = socket.handshake.auth || {};

    if (token) {
      const payload = verifyToken(token);
      if (!payload) return next(new Error('Sesión inválida o expirada'));
      const dbUser = users.findByUsername(payload.username);
      if (!dbUser || dbUser.is_banned) return next(new Error('Estás baneado (Cuenta).'));
      socket.user = { username: dbUser.username, role: dbUser.role, isMuted: !!dbUser.is_muted };
      return next();
    }

    const nick = (username || '').trim();
    if (!/^[a-zA-Z0-9_\-áéíóúñÁÉÍÓÚÑ ]{3,20}$/.test(nick)) {
      return next(new Error('Nick inválido (3-20 caracteres)'));
    }
    if (guestBans.has(nick)) return next(new Error('Estás baneado (Nombre).'));
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
      const cleanImage = validImageUrl(imageUrl);
      if (!cleanText && !cleanImage) return;

      messages.saveRoom(user.room, user.username, cleanText || null, cleanImage);
      io.to(user.room).emit('message', {
        username: user.username,
        role: user.role,
        text: cleanText,
        imageUrl: cleanImage,
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
          isPrivate: true,
          from: m.sender,
          to: m.recipient,
          createdAt: m.createdAt,
        })),
      });
    });

    // --- Acciones de administración (rol verificado server-side) ---

    socket.on('admin:kick', (targetUsername) => {
      if (!isAdmin(socket)) return;
      const targetSocketId = findSocketId(targetUsername);
      if (targetSocketId) {
        io.to(targetSocketId).emit('forceDisconnect', 'Has sido expulsado por un administrador.');
        io.sockets.sockets.get(targetSocketId)?.disconnect();
      }
    });

    socket.on('admin:ban', (targetUsername) => {
      if (!isAdmin(socket)) return;
      if (users.findByUsername(targetUsername)) {
        users.setBanned(targetUsername, true);
      } else {
        guestBans.add(targetUsername);
      }
      const targetSocketId = findSocketId(targetUsername);
      if (targetSocketId) {
        io.to(targetSocketId).emit('forceDisconnect', 'Has sido BANEADO por un administrador.');
        io.sockets.sockets.get(targetSocketId)?.disconnect();
      }
    });

    socket.on('admin:mute', (targetUsername) => {
      if (!isAdmin(socket)) return;
      if (users.findByUsername(targetUsername)) {
        users.toggleMuted(targetUsername);
      }
      const targetSocketId = findSocketId(targetUsername);
      if (targetSocketId) {
        const target = usersOnline[targetSocketId];
        target.isMuted = !target.isMuted;
        io.to(targetSocketId).emit(
          'message',
          system(target.isMuted ? 'Has sido silenciado.' : 'Ya puedes hablar.')
        );
      }
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
      .map(({ username, role }) => ({ username, role })),
  });
}

// Solo aceptamos imágenes subidas a nuestro propio servidor
function validImageUrl(url) {
  return typeof url === 'string' && /^\/uploads\/[\w.-]+$/.test(url) ? url : null;
}

module.exports = { setupSocket };
