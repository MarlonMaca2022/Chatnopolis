const { users, rooms, messages, guestBans } = require('./db');
const { sessionAccount } = require('./auth');
const { pruneRoom } = require('./cleanup');
const { canonicalNick, isReservedNick } = require('./nicks');
const { TERMS_VERSION, CONSENT_REQUIRED, TERMS_OUTDATED } = require('./legal');
const { validGender } = require('./profile');
const {
  clientIp,
  allowConnection,
  allowMessage,
  allowQuery,
  shouldWarn,
  forgetSocket,
} = require('./ratelimit');

const usersOnline = {}; // { socketId: { username, canon, role, room, isMuted, gender } }

// Nicks de invitado tomados: canónica -> socketId. Un invitado no tiene cuenta, su
// identidad es el nombre, así que hay que reservarlo para que no haya dos iguales:
// con duplicados los DM y las acciones de moderación caen en la persona equivocada.
// Se reserva en el handshake (no en el `join`) porque entre uno y otro pasa tiempo
// y en esa ventana entrarían las dos conexiones.
const guestNicks = new Map();

// Duraciones de ban aceptadas, en minutos. Cualquier otro valor => permanente.
const BAN_DURATIONS = [10, 60, 240];

// Emojis con los que se puede reaccionar. Un set fijo: con texto libre cualquiera
// podría "reaccionar" con un párrafo.
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

// Cuánto del texto citado viaja con una respuesta
const REPLY_PREVIEW_LENGTH = 100;

// El mismo tope que el regex de nicks del handshake y que /register. Lo usamos
// para descartar destinatarios de privados que no pueden ser nadie.
const MAX_NICK_LENGTH = 20;

function setupSocket(io) {
  // Autenticación en el handshake: token JWT (registrados) o username (invitados).
  // El rol NUNCA viene del cliente — se deriva del token o se fuerza 'guest'.
  io.use((socket, next) => {
    // Lo primero, antes de verificar nada: comprobar el token o buscar en la base
    // cuesta trabajo, y un bucle que abre conexiones sin parar nos lo haría pagar
    // en cada intento. Es un límite de ritmo, no de sesiones abiertas (una oficina
    // entera comparte una IP).
    if (!allowConnection(clientIp(socket.handshake))) {
      return next(new Error('Demasiadas conexiones desde tu red. Esperá un minuto.'));
    }

    const { token, username, terms, gender } = socket.handshake.auth || {};

    if (token) {
      const session = sessionAccount(token);
      if (!session) return next(new Error('Sesión inválida o expirada'));
      const { user: dbUser, payload } = session;
      const ban = users.banStatus(dbUser.username);
      if (ban.banned) return next(new Error(banMessage(ban.until, 'Tu cuenta está baneada')));
      // Un token firmado antes de que cambiaran los términos seguiría siendo válido:
      // acá es donde esa sesión se corta y vuelve al login a aceptarlos.
      if (dbUser.terms_version !== TERMS_VERSION) return next(new Error(TERMS_OUTDATED));
      // Una cuenta sí puede tener varias sesiones abiertas (celular + compu): los
      // DM y la moderación se aplican a todas (ver socketIdsFor).
      socket.user = {
        username: dbUser.username,
        canon: canonicalNick(dbUser.username),
        role: dbUser.role,
        isMuted: !!dbUser.is_muted,
        gender: dbUser.gender, // NULL en cuentas anteriores al género
        // Para cortar la conexión cuando vence el token y para revalidar al admin
        sessionVersion: payload.sv,
        expiresAt: payload.exp * 1000,
      };
      return next();
    }

    // El invitado no tiene cuenta donde guardar la aceptación, así que su
    // consentimiento viaja en cada handshake y vale para esa sesión. Va primero
    // porque es la comprobación más barata: un booleano, sin tocar la base.
    if (terms !== true) return next(new Error(CONSENT_REQUIRED));
    // Igual de barato: comparar contra una lista fija. Es obligatorio para que el
    // filtro de la lista de conectados sirva.
    if (!validGender(gender)) return next(new Error('Elige si eres hombre, mujer u otro.'));

    const nick = (username || '').trim();
    if (!/^[a-zA-Z0-9_\-áéíóúñÁÉÍÓÚÑ ]{3,20}$/.test(nick)) {
      return next(new Error('Nick inválido (3-20 caracteres)'));
    }
    if (isReservedNick(nick)) return next(new Error('Ese nombre está reservado. Elige otro.'));
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
    // sinceId: los privados anteriores a esta sesión no son de esta persona aunque
    // tengan su nick (ver dmVisibleFrom).
    socket.user = { username: nick, canon, role: 'guest', isMuted: false, gender, sinceId: messages.lastId() };
    next();
  });

  io.on('connection', (socket) => {
    // El token se mira una sola vez, en el handshake: sin esto, una conexión abierta
    // seguiría viva días después de que venció. Al reconectar, el token vencido ya no
    // pasa el handshake y el cliente vuelve al login.
    const { expiresAt } = socket.user;
    const expiryTimer =
      expiresAt &&
      setTimeout(() => {
        socket.emit('forceDisconnect', 'Tu sesión venció. Inicia sesión de nuevo.');
        socket.disconnect();
      }, Math.max(0, expiresAt - Date.now()));

    socket.on('join', ({ room } = {}) => {
      if (!allowQuery(socket.id)) return;
      const roomId = rooms.find(room) ? room : 'general';
      const me = socket.user;

      // Una sala a la vez por conexión: cambiar es salir de la anterior. Los privados
      // no dependen de esto — van a la persona (socketIdsFor), no a la sala.
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
        messages: historyPayload(messages.roomHistory(roomId)),
      });

      socket.to(roomId).emit('message', system(`${me.username} se ha unido.`));
      socket.emit('message', system(`Bienvenido a la sala, ${me.username}.`));
      updateRoomUsers(io, roomId);
    });

    socket.on('chatMessage', ({ text, imageUrl, replyTo } = {}) => {
      const user = usersOnline[socket.id];
      if (!user) return;
      if (user.isMuted) {
        return socket.emit('message', system('Estás silenciado.', 'system-error'));
      }
      if (!canSend(socket)) return;

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

      const quoted = quotable(socket, replyTo);
      const id = messages.saveRoom(user.room, user.username, cleanText, null, quoted?.id);
      pruneRoom(user.room);
      io.to(user.room).emit('message', {
        id,
        username: user.username,
        role: user.role,
        text: cleanText,
        imageUrl: null,
        replyTo: quoted ? replyPreview(quoted) : null,
        reactions: {},
        createdAt: new Date().toISOString(),
      });
    });

    socket.on('privateMessage', ({ targetUsername, text, imageUrl, replyTo } = {}) => {
      const user = usersOnline[socket.id];
      if (!user) return;
      if (user.isMuted) {
        return socket.emit('message', system('Estás silenciado.', 'system-error'));
      }

      if (!canSend(socket)) return;

      const cleanText = typeof text === 'string' ? text.trim().slice(0, 2000) : '';
      const cleanImage = validImageUrl(imageUrl);
      if (!cleanText && !cleanImage) return;

      // El destinatario no puede ser texto libre. Antes, un nombre inventado se
      // guardaba igual: cada emit escribía una fila que nadie iba a leer nunca, con
      // un `to` tan largo como el cliente quisiera (el tope de Socket.IO es 1 MB) y
      // sin nada que la podara después. Tiene que ser alguien real: una cuenta
      // registrada, o un invitado que esté conectado ahora mismo.
      const target = typeof targetUsername === 'string' ? targetUsername.trim() : '';
      if (!target || target.length > MAX_NICK_LENGTH) return;

      const account = users.findByNick(target);
      const targetSocketIds = socketIdsFor(target);
      if (!account && targetSocketIds.length === 0) {
        return socket.emit('message', system(`No encontramos a ${target}.`, 'system-error'));
      }

      // Guardamos el nombre tal como está en la cuenta, no como lo escribió el
      // cliente: si no, el historial se partiría entre "Maria" y "maria".
      const to = account?.username || target;
      // Además de verse, el citado tiene que ser de ESTA conversación: si no, se
      // podría citar un privado ajeno en una charla con otra persona.
      let quoted = quotable(socket, replyTo);
      if (quoted && !samePair(quoted, user.username, to)) quoted = null;
      const id = messages.saveDM(user.username, to, cleanText || null, cleanImage, quoted?.id);
      const data = {
        id,
        username: user.username,
        text: cleanText,
        imageUrl: cleanImage,
        isPrivate: true,
        from: user.username,
        to,
        replyTo: quoted ? replyPreview(quoted) : null,
        reactions: {},
        createdAt: new Date().toISOString(),
      };

      targetSocketIds.forEach((id) => io.to(id).emit('message', data));
      socket.emit('message', data);
      if (targetSocketIds.length === 0) {
        socket.emit('message', system(`${to} no está en línea; verá tu mensaje si es un usuario registrado.`, 'system'));
      }
    });

    socket.on('dm:history', ({ withUser } = {}) => {
      const user = usersOnline[socket.id];
      if (!user || typeof withUser !== 'string') return;
      if (!allowQuery(socket.id)) return;

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
        messages: historyPayload(messages.dmHistory(user.username, other.username), (m) => ({
          isPrivate: true,
          from: m.sender,
          to: m.recipient,
        })),
      });
    });

    // Reacción: toggle de un emoji del set fijo sobre un mensaje que esta persona ve.
    socket.on('react', ({ id, emoji } = {}) => {
      const user = usersOnline[socket.id];
      if (!user || !REACTIONS.includes(emoji)) return;
      if (user.isMuted) return;
      if (!canSend(socket)) return;
      const row = quotable(socket, id);
      if (!row) return;
      const reactions = messages.toggleReaction(row.id, user.canon, user.username, emoji);
      emitToAudience(io, row, 'reactions', { id: row.id, reactions });
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

    // Borra un mensaje de sala del todo: de la base (con sus reacciones, por el
    // CASCADE) y de la pantalla de todos los que están en esa sala.
    socket.on('admin:deleteMessage', (id) => {
      if (!isAdmin(socket) || !Number.isInteger(id)) return;
      const room = messages.removeRoomMessage(id);
      if (room) io.to(room).emit('messageDeleted', { id });
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
      forgetSocket(socket.id);
      clearTimeout(expiryTimer);

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

// ¿Puede este socket mandar un mensaje ahora? Si va demasiado rápido avisa, pero
// como mucho una vez cada tanto (shouldWarn): responder a cada mensaje bloqueado
// convertiría un flood de entrada en un flood de salida.
function canSend(socket) {
  if (allowMessage(socket.id)) return true;
  if (shouldWarn(socket.id)) {
    socket.emit('message', system('Vas demasiado rápido. Esperá unos segundos.', 'system-error'));
  }
  return false;
}

// --- Mensajes: respuestas y reacciones ---

// Desde qué id puede ver privados una identidad. Una cuenta registrada ve todo su
// historial; un invitado, solo lo de su sesión actual: su nick lo puede reclamar
// otra persona cuando se va, y citar o reaccionar a un privado anterior le
// mostraría a la nueva lo que se habló con la anterior (mismo motivo que corta
// dm:history para invitados). Un invitado desconectado no ve nada.
function dmVisibleFrom(username) {
  if (users.findByNick(username)) return 0;
  const online = socketIdsFor(username)[0];
  return online ? usersOnline[online].sinceId ?? Infinity : Infinity;
}

// El mensaje `id` si quien pregunta lo puede ver, o null: uno de la sala en la que
// está, o un privado del que es parte y que las dos puntas pueden ver. Es la puerta
// de entrada de citar y de reaccionar: la cita copia el texto del original, así
// que pasar un id ajeno sería una forma de leer mensajes de otros.
function quotable(socket, id) {
  const me = usersOnline[socket.id];
  if (!me || !Number.isInteger(id)) return null;
  const row = messages.find(id);
  if (!row) return null;
  if (row.room) return row.room === me.room ? row : null;
  const parties = [row.sender, row.recipient];
  if (!parties.some((name) => canonicalNick(name) === me.canon)) return null;
  return parties.every((name) => row.id > dmVisibleFrom(name)) ? row : null;
}

const samePair = (row, a, b) =>
  [row.sender, row.recipient].map(canonicalNick).sort().join('\n') ===
  [a, b].map(canonicalNick).sort().join('\n');

// Avisa de un cambio en un mensaje a quien lo ve: la sala, o las dos puntas del
// privado. Ojo: io.to([]) con la lista vacía le manda a TODOS, de ahí el chequeo.
function emitToAudience(io, row, event, data) {
  if (row.room) return io.to(row.room).emit(event, data);
  const ids = [...socketIdsFor(row.sender), ...socketIdsFor(row.recipient)];
  if (ids.length > 0) io.to(ids).emit(event, data);
}

// Lo que se muestra de un mensaje citado. Solo el comienzo del texto: es una
// referencia, no una copia.
function replyPreview(row) {
  return {
    id: row.id,
    username: row.sender,
    text: (row.text || '').slice(0, REPLY_PREVIEW_LENGTH),
    photo: !!(row.image_url || row.image_expired),
  };
}

// Filas de roomHistory/dmHistory -> mensajes para el cliente, con su cita y sus
// reacciones. `extra` agrega lo propio de cada historial (los campos del privado).
function historyPayload(rows, extra = () => ({})) {
  const reactions = messages.reactionsFor(rows.map((m) => m.id));
  return rows.map((m) => ({
    id: m.id,
    username: m.sender,
    text: m.text,
    imageUrl: m.imageUrl,
    imageExpired: !!m.imageExpired,
    createdAt: m.createdAt,
    replyTo:
      m.replyToId == null
        ? null
        : m.replyFoundId == null
          ? { id: m.replyToId, deleted: true }
          : {
              id: m.replyToId,
              username: m.replySender,
              text: (m.replyText || '').slice(0, REPLY_PREVIEW_LENGTH),
              photo: !!m.replyHasPhoto,
            },
    reactions: reactions[m.id] || {},
    ...extra(m),
  }));
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

// Se vuelve a mirar la base en cada acción: el rol del handshake puede haber cambiado
// o las sesiones de la cuenta pueden haberse cerrado mientras este socket seguía
// abierto. Son acciones esporádicas, así que la consulta no cuesta nada.
function isAdmin(socket) {
  const user = usersOnline[socket.id];
  if (!user || user.role !== 'admin') return false;
  const dbUser = users.findByNick(user.username);
  return (
    !!dbUser && dbUser.role === 'admin' && dbUser.session_version === socket.user.sessionVersion
  );
}

// Cierra todas las sesiones de una cuenta registrada: sube la versión (los tokens
// firmados hasta ahora dejan de valer) y desconecta los sockets abiertos, que si no
// seguirían vivos con el token viejo. `keepSocketId` es la pestaña desde la que se
// pidió el cambio, cuando el pedido le devuelve un token nuevo: esa sigue conectada
// con la versión nueva. Si el id no es de esta cuenta, simplemente no coincide.
// Recorre todos los sockets y no solo usersOnline: uno que pasó el handshake pero
// todavía no hizo `join` también tiene el token viejo.
function revokeSessions(io, username, { reason, keepSocketId } = {}) {
  const version = users.bumpSessionVersion(username);
  const canon = canonicalNick(username);
  [...io.sockets.sockets.values()].forEach((target) => {
    if (target.user?.canon !== canon || target.user.role === 'guest') return;
    if (target.id === keepSocketId) {
      target.user.sessionVersion = version;
      return;
    }
    target.emit('forceDisconnect', reason || 'Tu sesión se cerró. Inicia sesión de nuevo.');
    target.disconnect();
  });
  return version;
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
      .map(({ username, role, isMuted, gender }) => ({
        username,
        role,
        isMuted: !!isMuted,
        gender: gender || null,
      })),
  });
}

// Solo aceptamos imágenes subidas a nuestro propio servidor
function validImageUrl(url) {
  return typeof url === 'string' && /^\/uploads\/[\w.-]+$/.test(url) ? url : null;
}

module.exports = { setupSocket, syncMuted, sessionForSocket, revokeSessions };
