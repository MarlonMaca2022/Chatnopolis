const { users, rooms, messages, guestBans } = require('./db');
const { verifyToken } = require('./auth');
const { pruneRoom } = require('./cleanup');
const { canonicalNick } = require('./nicks');

const usersOnline = {}; // { socketId: { username, canon, role, room, isMuted } }

// Nicks de invitado tomados: canónica -> socketId. Un invitado no tiene cuenta, su
// identidad es el nombre, así que hay que reservarlo para que no haya dos iguales:
// con duplicados los DM y las acciones de moderación caen en la persona equivocada.
// Se reserva en el handshake (no en el `join`) porque entre uno y otro pasa tiempo
// y en esa ventana entrarían las dos conexiones.
const guestNicks = new Map();

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
      const dbUser = users.findByNick(payload.username);
      if (!dbUser) return next(new Error('Sesión inválida o expirada'));
      const ban = users.banStatus(dbUser.username);
      if (ban.banned) return next(new Error(banMessage(ban.until, 'Tu cuenta está baneada')));
      // Una cuenta sí puede tener varias sesiones abiertas (celular + compu): los
      // DM y la moderación se aplican a todas (ver socketIdsFor).
      socket.user = {
        username: dbUser.username,
        canon: canonicalNick(dbUser.username),
        role: dbUser.role,
        isMuted: !!dbUser.is_muted,
      };
      return next();
    }

    const nick = (username || '').trim();
    if (!/^[a-zA-Z0-9_\-áéíóúñÁÉÍÓÚÑ ]{3,20}$/.test(nick)) {
      return next(new Error('Nick inválido (3-20 caracteres)'));
    }
    const canon = canonicalNick(nick);
    const guestBan = guestBans.status(nick);
    if (guestBan.banned) return next(new Error(banMessage(guestBan.until, 'Este nombre está baneado')));
    // Por canónica: si no, "Admin" no colisiona con "admin" y el invitado entra
    // usando el nombre de un registrado (SQLite compara texto byte a byte).
    if (users.findByNick(nick)) {
      return next(new Error('Ese nombre pertenece a un usuario registrado. Elige otro.'));
    }
    // Si el que tenía la reserva ya no está conectado, el nombre se cede: así una
    // reserva colgada (conexión cortada antes de entrar) no bloquea el nick.
    const holder = guestNicks.get(canon);
    if (holder && holder !== socket.id && io.sockets.sockets.has(holder)) {
      // Nunca cedemos el nick al que llega — eso sería justo el robo de nombre que
      // estamos evitando. Va con código para que el cliente pueda reintentar: si al
      // invitado se le cortó la red, su socket viejo sigue vivo acá hasta el
      // pingTimeout y el que choca con la reserva es él mismo (ver ChatPage).
      return next(nickInUseError());
    }
    guestNicks.set(canon, socket.id);
    socket.user = { username: nick, canon, role: 'guest', isMuted: false };
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
      if (typeof targetUsername !== 'string' || !targetUsername.trim()) return;

      // Guardamos el nombre tal como está en la cuenta, no como lo escribió el
      // cliente: si no, el historial se partiría entre "Maria" y "maria".
      const to = users.findByNick(targetUsername)?.username || targetUsername.trim();
      const targetSocketIds = socketIdsFor(to);
      const data = {
        username: user.username,
        text: cleanText,
        imageUrl: cleanImage,
        isPrivate: true,
        from: user.username,
        to,
        createdAt: new Date().toISOString(),
      };

      messages.saveDM(user.username, to, cleanText || null, cleanImage);

      targetSocketIds.forEach((id) => io.to(id).emit('message', data));
      socket.emit('message', data);
      if (targetSocketIds.length === 0) {
        socket.emit('message', system(`${to} no está en línea; verá tu mensaje si es un usuario registrado.`, 'system'));
      }
    });

    socket.on('dm:history', ({ withUser } = {}) => {
      const user = usersOnline[socket.id];
      if (!user || typeof withUser !== 'string') return;

      // El historial de DM solo se entrega entre cuentas registradas. La identidad
      // de un invitado es su nick y cualquiera puede reclamarlo después de que se
      // va: servirlo dejaría que el próximo "Maria" leyera los privados de la
      // anterior. Para invitados el DM vive solo en la sesión abierta.
      const other = users.findByNick(withUser);
      if (user.role === 'guest' || !other) return;

      // Consultamos con el nombre de la cuenta, pero respondemos con la clave que
      // mandó el cliente: es con la que tiene abierta la conversación.
      socket.emit('dm:history', {
        withUser,
        messages: messages.dmHistory(user.username, other.username).map((m) => ({
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
      if (!isAdmin(socket) || isSelf(socket, targetUsername)) return;
      disconnectUser(io, targetUsername, 'Has sido expulsado por un administrador.');
    });

    socket.on('admin:ban', (payload) => {
      if (!isAdmin(socket)) return;

      // Acepta { username, durationMinutes }; durationMinutes null/ausente = permanente
      const targetUsername = typeof payload === 'string' ? payload : payload?.username;
      if (!targetUsername || isSelf(socket, targetUsername)) return;

      const minutes = BAN_DURATIONS.includes(payload?.durationMinutes)
        ? payload.durationMinutes
        : null;
      const until = minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null;

      const dbUser = users.findByNick(targetUsername);
      if (dbUser) {
        users.setBanned(dbUser.username, true, until);
      } else {
        guestBans.add(targetUsername, until);
      }

      disconnectUser(io, targetUsername, banMessage(until));
    });

    socket.on('admin:mute', (targetUsername) => {
      if (!isAdmin(socket) || isSelf(socket, targetUsername)) return;

      const dbUser = users.findByNick(targetUsername);
      const targetSockets = liveSockets(io, targetUsername);
      if (!dbUser && targetSockets.length === 0) return;

      // El toggle se calcula desde donde está la verdad: la DB si es un usuario
      // registrado, la conexión viva si es un invitado.
      const isMuted = dbUser ? !dbUser.is_muted : !targetSockets[0].user.isMuted;

      if (dbUser) users.setMuted(dbUser.username, isMuted);
      syncMuted(io, targetUsername, isMuted);
    });

    socket.on('disconnect', () => {
      // Liberar la reserva del nick, pero solo si sigue siendo nuestra: si el
      // invitado ya se reconectó con otro socket, la reserva es de ese.
      const canon = socket.user?.canon;
      if (socket.user?.role === 'guest' && guestNicks.get(canon) === socket.id) {
        guestNicks.delete(canon);
      }

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

// El `data` de un error de handshake llega al cliente como err.data
function nickInUseError() {
  const error = new Error('Ese nombre ya está en uso ahora mismo. Elige otro.');
  error.data = { code: 'NICK_IN_USE' };
  return error;
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
  socketIdsFor(username).forEach((socketId) => {
    io.to(socketId).emit('forceDisconnect', reason);
    io.sockets.sockets.get(socketId)?.disconnect();
  });
}

function liveSockets(io, username) {
  return socketIdsFor(username)
    .map((id) => io.sockets.sockets.get(id))
    .filter(Boolean);
}

// Aplica un cambio de silencio a la sesión viva, si la hay. `usersOnline` vive en
// este módulo, así que las rutas REST también pasan por acá para no desincronizarla.
// Clave: escribimos en socket.user, que es de donde `join` reconstruye la entrada
// al cambiar de sala — si solo tocáramos usersOnline, el silencio se perdería.
function syncMuted(io, username, isMuted) {
  // A todas las sesiones de esa identidad: una cuenta puede estar abierta en el
  // celular y en la compu, y silenciar solo una no serviría de nada.
  liveSockets(io, username).forEach((target) => {
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
  });
}

function isAdmin(socket) {
  const user = usersOnline[socket.id];
  return user && user.role === 'admin';
}

// Un admin no puede moderarse a sí mismo, ni escribiendo su nombre de otra forma.
function isSelf(socket, username) {
  return canonicalNick(username) === socket.user.canon;
}

// TODOS los sockets de una identidad. Antes devolvía solo el primero que
// encontraba: con dos invitados usando el mismo nick, los DM y las acciones de
// moderación caían en el equivocado.
function socketIdsFor(username) {
  const canon = canonicalNick(username);
  return Object.keys(usersOnline).filter((id) => usersOnline[id].canon === canon);
}

// La sesión detrás de un socketId, o null. Es lo que usa POST /api/upload para
// exigir que quien sube una foto esté realmente en el chat: los invitados no tienen
// cuenta ni token, así que su credencial es estar conectados. No es una restricción
// extra — para mandar la foto por privado hace falta el socket igual.
function sessionForSocket(socketId) {
  const user = typeof socketId === 'string' && usersOnline[socketId];
  return user ? { username: user.username, canon: user.canon, role: user.role, isMuted: !!user.isMuted } : null;
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

module.exports = { setupSocket, syncMuted, sessionForSocket };
