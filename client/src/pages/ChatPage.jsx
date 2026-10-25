import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { ArrowLeftRight, Hash, LogOut, Menu, Shield, ChevronRight, Users, X } from 'lucide-react';
import { getSession, setSession, clearSession } from '../lib/session';
import { api } from '../lib/api';
import MessageList from '../components/MessageList.jsx';
import MessageInput from '../components/MessageInput.jsx';
import UserList from '../components/UserList.jsx';
import AdminModal from '../components/AdminModal.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import LegalFooter from '../components/LegalFooter.jsx';
import Avatar from '../components/Avatar.jsx';
import { LogoMark } from '../components/Logo.jsx';
import ProfileModal from '../components/ProfileModal.jsx';
import { quoteLabel } from '../lib/messages';

const BAN_LABELS = { 10: '10 minutos', 60: '1 hora', 240: '4 horas' };

// Reintentos cuando el nick choca al reconectar: cubren de sobra el pingTimeout del
// servidor (~20 s), que es lo que tarda en soltar nuestro socket anterior.
const NICK_RETRY_MS = 3000;
const NICK_MAX_RETRIES = 10;

// Aplica `fn` a cada mensaje de cada conversación (y descarta los que no pasan `keep`)
function mapMessages(chats, fn, keep = () => true) {
  return Object.fromEntries(Object.entries(chats).map(([key, list]) => [key, list.filter(keep).map(fn)]));
}

export default function ChatPage() {
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);
  const initialRoom = session?.roomId || 'general';

  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  // Identifica la sesión viva ante el servidor al subir fotos. Cambia en cada
  // reconexión, así que es estado y no una lectura directa del socket.
  const [socketId, setSocketId] = useState(null);
  const [chats, setChats] = useState({}); // { chatKey: [mensajes] }
  const [roomId, setRoomId] = useState(initialRoom); // sala activa
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  const [activeView, setActiveView] = useState({ type: 'room', target: initialRoom });
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;

  const [onlineUsers, setOnlineUsers] = useState([]);
  const [roomsMap, setRoomsMap] = useState({});
  const [dms, setDms] = useState([]); // usernames con chat abierto
  const [unread, setUnread] = useState(new Set());
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showUsers, setShowUsers] = useState(false); // panel de usuarios en móvil
  const [showRoomPicker, setShowRoomPicker] = useState(false); // "Cambiar" sala (no admin)
  const [replyingTo, setReplyingTo] = useState(null); // mensaje que se está respondiendo

  // Una respuesta es de la conversación donde se eligió: al cambiar, se descarta.
  // El servidor igual ignora citas de otra sala u otro privado.
  useEffect(() => setReplyingTo(null), [activeView.type, activeView.target]);

  // Marcadores de contenido adulto, solo mientras se está en el chat. El servidor
  // ya los pone si /chat se carga directo (server/seo.js), pero lo normal es llegar
  // navegando desde la portada sin recargar el <head>. Al salir se sacan todos,
  // también los del servidor, para que la portada no se quede con ellos.
  useEffect(() => {
    const ratings = { rating: 'adult', RATING: 'RTA-5042-1996-1400-1577-RTA' };
    // Comparación exacta: "rating" y "RATING" son dos etiquetas distintas.
    const present = () => [...document.head.querySelectorAll('meta[name]')].filter((m) => m.name in ratings);
    const have = new Set(present().map((m) => m.name));
    for (const [name, content] of Object.entries(ratings)) {
      if (have.has(name)) continue;
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
    }
    return () => present().forEach((meta) => meta.remove());
  }, []);

  // Estado y no una lectura de `session`: el invitado puede cambiarse el nick desde
  // Mi perfil sin reconectar. El ref es para el handler `message`, registrado una vez.
  const [username, setUsername] = useState(session?.username);
  const usernameRef = useRef(username);
  usernameRef.current = username;
  const [showProfile, setShowProfile] = useState(false);

  // Foto de perfil vigente de cada conectado de la sala. Gana sobre la que trae el
  // mensaje: si alguien la cambió o un moderador la quitó, se ve la actual.
  const onlineAvatars = useMemo(
    () => Object.fromEntries(onlineUsers.map((u) => [u.username, u.avatarUrl])),
    [onlineUsers]
  );

  const pushMessage = useCallback((key, msg) => {
    setChats((prev) => ({ ...prev, [key]: [...(prev[key] || []), msg] }));
  }, []);

  useEffect(() => {
    if (!session) return;

    api.getRooms().then((rooms) => {
      setRoomsMap(Object.fromEntries(rooms.map((r) => [r.id, r.name])));
    }).catch(() => {});

    const socket = io({
      // El invitado no tiene cuenta donde guardar la aceptación: su consentimiento
      // viaja acá y el handshake lo exige (ver server/socket.js). Una sesión vieja,
      // guardada antes de que existieran los términos, es rechazada y vuelve al login.
      // Es una función para que cada reconexión lea el token guardado en ese momento:
      // activar el 2FA renueva el token, y reconectar con el viejo nos sacaría.
      auth: (cb) => {
        const current = getSession() || session;
        cb(
          current.token
            ? { token: current.token }
            : { username: current.username, gender: current.gender, terms: current.acceptedTerms === true }
        );
      },
    });
    socketRef.current = socket;

    let hadConnected = false;   // ya entramos una vez => un choque de nick es nuestro socket viejo
    let nickRetries = 0;
    let nickRetryTimer;

    socket.on('connect', () => {
      setConnected(true);
      setSocketId(socket.id);
      nickRetries = 0;
      hadConnected = true;
      socket.emit('join', { room: roomId });
    });

    socket.on('connect_error', (err) => {
      // Reconectando después de un corte (wifi -> datos): el servidor todavía puede
      // tener vivo nuestro socket anterior, y la reserva del nick con la que
      // chocamos es la nuestra. Reintentamos en silencio mientras el socket viejo
      // vence en el servidor, en vez de mandar al invitado de vuelta al login.
      // Un error de middleware no dispara la reconexión automática: hay que pedirla.
      if (err.data?.code === 'NICK_IN_USE' && hadConnected && nickRetries < NICK_MAX_RETRIES) {
        nickRetries += 1;
        nickRetryTimer = setTimeout(() => socket.connect(), NICK_RETRY_MS);
        return;
      }
      sessionStorage.setItem('disconnect_reason', err.message || 'No se pudo conectar');
      clearSession();
      navigate('/entrar');
    });

    socket.on('forceDisconnect', (reason) => {
      sessionStorage.setItem('disconnect_reason', reason);
      clearSession();
      navigate('/entrar');
    });

    socket.on('history', ({ room, messages }) => {
      setChats((prev) => ({ ...prev, [room]: messages }));
    });

    socket.on('dm:history', ({ withUser, messages }) => {
      if (messages.length === 0) return;
      setChats((prev) => {
        const existing = prev[withUser] || [];
        // Solo cargamos historial si el chat local está vacío (evita duplicados)
        return existing.length > 0 ? prev : { ...prev, [withUser]: messages };
      });
    });

    socket.on('message', (data) => {
      let key;
      if (data.isPrivate) {
        key = data.from === usernameRef.current ? data.to : data.from;
        setDms((prev) => (prev.includes(key) ? prev : [...prev, key]));
      } else {
        key = roomIdRef.current;
      }

      setChats((prev) => ({ ...prev, [key]: [...(prev[key] || []), data] }));

      const view = activeViewRef.current;
      const isVisible =
        (view.type === 'room' && !data.isPrivate) ||
        (view.type === 'dm' && data.isPrivate && (data.from === view.target || data.to === view.target));
      if (!isVisible) {
        setUnread((prev) => new Set(prev).add(key));
      }
    });

    // Vuelve a "Conectando…" mientras se reconecta (incluidos los reintentos de nick).
    // El socket id deja de ser válido acá: subir con uno viejo daría 401.
    socket.on('disconnect', () => {
      setConnected(false);
      setSocketId(null);
    });

    // Los ids son únicos en toda la tabla (salas y privados), así que alcanza con
    // buscarlo en cada conversación abierta.
    socket.on('reactions', ({ id, reactions }) => {
      setChats((prev) => mapMessages(prev, (m) => (m.id === id ? { ...m, reactions } : m)));
    });

    // El admin borró un mensaje de sala: sale de la lista, y las respuestas que lo
    // citaban pasan a "Mensaje eliminado".
    socket.on('messageDeleted', ({ id }) => {
      setChats((prev) =>
        mapMessages(prev, (m) => (m.replyTo?.id === id ? { ...m, replyTo: { id, deleted: true } } : m), (m) => m.id !== id)
      );
      setReplyingTo((current) => (current?.id === id ? null : current));
    });

    socket.on('roomUsers', ({ users }) => setOnlineUsers(users));

    socket.on('roomsUpdate', (rooms) => {
      setRoomsMap(Object.fromEntries(rooms.map((r) => [r.id, r.name])));
    });

    return () => {
      clearTimeout(nickRetryTimer);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!session) return null;

  const isAdmin = session.role === 'admin';
  // Mi entrada en la lista de la sala; mientras no llega, lo que sabe la sesión
  const me = onlineUsers.find((u) => u.username === username) || {
    username,
    role: session.role,
    gender: session.gender ?? null,
    avatarUrl: null,
  };

  // Cambio de nick/género de un invitado. Promesa para que el modal muestre el error.
  function saveGuestProfile(newName, gender) {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket?.connected) return reject(new Error('Sin conexión. Probá de nuevo en unos segundos.'));
      socket.emit('profile:update', { username: newName, gender }, (res) => {
        if (!res?.ok) return reject(new Error(res?.message || 'No se pudo guardar'));
        // La sesión guardada también: si se recarga o reconecta, entra con el nombre nuevo
        setSession({ ...getSession(), username: res.username, gender: res.gender });
        setUsername(res.username);
        resolve();
      });
    });
  }

  // "Crear una cuenta" desde Mi perfil: sale del chat y abre el registro con el
  // nick y el género precargados (AuthPage lee register_prefill).
  function createAccount() {
    sessionStorage.setItem('register_prefill', JSON.stringify({ username, gender: me.gender }));
    clearSession();
    navigate('/entrar');
  }

  function openDM(target) {
    setDms((prev) => (prev.includes(target) ? prev : [...prev, target]));
    setActiveView({ type: 'dm', target });
    setUnread((prev) => {
      const next = new Set(prev);
      next.delete(target);
      return next;
    });
    if (!(chats[target]?.length > 0)) {
      socketRef.current?.emit('dm:history', { withUser: target });
    }
    setShowSidebar(false);
    setShowUsers(false);
  }

  // Cerrar solo la saca de la lista: `chats[target]` se conserva, así que reabrirla
  // muestra lo hablado (para un invitado no hay historial en el servidor que lo
  // recupere). Si el otro vuelve a escribir, el handler `message` la reabre sola.
  function closeDM(target) {
    setDms((prev) => prev.filter((u) => u !== target));
    setUnread((prev) => {
      const next = new Set(prev);
      next.delete(target);
      return next;
    });
    if (activeView.type === 'dm' && activeView.target === target) {
      setActiveView({ type: 'room', target: roomId });
    }
  }

  function switchRoom(id) {
    setShowRoomPicker(false);
    if (id !== roomId) {
      // Los DM abiertos (`dms`/`chats`) no se tocan: siguen vivos en cualquier sala
      // El servidor sale de la sala anterior, entra a la nueva y reenvía historial
      socketRef.current?.emit('join', { room: id });
      setRoomId(id);
    }
    setActiveView({ type: 'room', target: id });
    setUnread((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setShowSidebar(false);
  }

  function sendMessage({ text, imageUrl }) {
    const socket = socketRef.current;
    if (!socket) return;
    const replyTo = replyingTo?.id;
    if (activeView.type === 'dm') {
      socket.emit('privateMessage', { targetUsername: activeView.target, text, imageUrl, replyTo });
    } else {
      socket.emit('chatMessage', { text, imageUrl, replyTo });
    }
    setReplyingTo(null);
  }

  function react(id, emoji) {
    socketRef.current?.emit('react', { id, emoji });
  }

  function deleteMessage(message) {
    const preview = quoteLabel(message).slice(0, 60);
    if (!window.confirm(`¿Borrar el mensaje de ${message.username}?\n\n"${preview}"`)) return;
    socketRef.current?.emit('admin:deleteMessage', message.id);
  }

  // durationMinutes solo aplica a 'ban' (null = permanente)
  function adminAction(action, targetUser, durationMinutes = null) {
    const isMuted = onlineUsers.find((u) => u.username === targetUser)?.isMuted;
    const prompts = {
      mute: isMuted ? `¿Quitar el silencio a ${targetUser}?` : `¿Silenciar a ${targetUser}?`,
      kick: `¿Expulsar a ${targetUser}? Podrá volver a entrar enseguida.`,
      removeAvatar: `¿Quitar la foto de perfil de ${targetUser}?`,
      ban: durationMinutes
        ? `¿Banear a ${targetUser} por ${BAN_LABELS[durationMinutes]}?`
        : `¿Banear a ${targetUser} de forma permanente?`,
    };
    if (!window.confirm(prompts[action])) return;

    socketRef.current?.emit(
      `admin:${action}`,
      action === 'ban' ? { username: targetUser, durationMinutes } : targetUser
    );
  }

  function logout() {
    clearSession();
    navigate('/entrar');
  }

  const headerTitle =
    activeView.type === 'room'
      ? `# ${roomsMap[roomId] || roomId}`
      : `@ ${activeView.target}`;

  const activeMessages = chats[activeView.target] || [];

  // El usuario común ve su sala y despliega las demás con "Cambiar"; el admin las ve
  // todas siempre porque moderar es recorrerlas. La sala propia se arma a mano (y no
  // filtrando `roomsMap`) para que esté desde el primer pintado, antes de que llegue
  // GET /api/rooms. Sigue siendo un botón: estando en un DM es la forma de volver.
  const visibleRooms = isAdmin
    ? Object.entries(roomsMap)
    : [
        [roomId, roomsMap[roomId] || roomId],
        ...(showRoomPicker ? Object.entries(roomsMap).filter(([id]) => id !== roomId) : []),
      ];

  const sidebar = (
    <>
      <div className="px-6 py-5 border-b border-edge flex items-center justify-between">
        <h2 className="text-accent-ink">
          <LogoMark className="block h-9 w-auto" />
          <span className="sr-only">Chatnopolis</span>
        </h2>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => setShowAdmin(true)}
              className="text-ink-faint hover:text-amber-500 transition"
              title="Panel de Administración"
            >
              <Shield size={18} />
            </button>
          )}
          <ThemeToggle />
        </div>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-ink-faint uppercase tracking-wider">
            {isAdmin ? 'Salas' : 'Tu sala'}
          </h3>
          {!isAdmin && (
            <button
              onClick={() => setShowRoomPicker((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-accent-ink hover:text-accent transition"
              aria-expanded={showRoomPicker}
            >
              <ArrowLeftRight size={12} />
              {showRoomPicker ? 'Cancelar' : 'Cambiar'}
            </button>
          )}
        </div>
        <ul className="space-y-1 mb-6">
          {visibleRooms.map(([id, name]) => {
            const isActive = activeView.type === 'room' && roomId === id;
            return (
              <li key={id}>
                <button
                  onClick={() => switchRoom(id)}
                  className={`w-full px-4 py-3 rounded-lg font-medium flex justify-between items-center transition shadow-sm border ${
                    isActive
                      ? 'bg-accent-soft text-accent-ink border-accent/40'
                      : 'bg-surface text-ink-soft border-edge hover:bg-muted'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Hash size={14} className="shrink-0" />
                    <span className="truncate">{name}</span>
                    {unread.has(id) && <span className="w-2 h-2 bg-rose-500 rounded-full shrink-0" />}
                  </span>
                  {isActive && <ChevronRight size={12} className="opacity-50 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>

        <h3 className="text-xs font-semibold text-ink-faint uppercase tracking-wider mb-4">Mensajes Directos</h3>
        <ul className="space-y-1 mb-6">
          {dms.map((dmUser) => {
            const isActive = activeView.type === 'dm' && activeView.target === dmUser;
            return (
              <li
                key={dmUser}
                onClick={() => openDM(dmUser)}
                className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${
                  isActive
                    ? 'bg-accent-soft text-accent-ink font-bold border border-accent/40 shadow-sm'
                    : 'hover:bg-muted text-ink-soft'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Avatar name={dmUser} src={onlineAvatars[dmUser]} />
                  <span className="truncate max-w-[120px]">{dmUser}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {unread.has(dmUser) && <span className="w-2 h-2 bg-rose-500 rounded-full" />}
                  {/* Con mouse aparece al pasar por encima; en el celular no hay hover,
                      así que se ve en la conversación abierta (tocarla la abre). */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeDM(dmUser);
                    }}
                    className={`p-1 rounded text-ink-faint hover:text-red-500 hover:bg-muted transition focus-visible:opacity-100 ${
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    title="Cerrar conversación"
                    aria-label={`Cerrar conversación con ${dmUser}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="p-4 border-t border-edge bg-app flex justify-between items-center">
        <button
          onClick={() => {
            setShowProfile(true);
            setShowSidebar(false);
          }}
          className="flex items-center gap-3 min-w-0 -m-1 p-1 rounded-lg text-left hover:bg-muted transition"
          title="Mi perfil"
        >
          <Avatar
            name={username}
            src={me.avatarUrl}
            size="w-10 h-10 text-sm"
            className="bg-accent-soft text-accent-ink"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink truncate max-w-[120px]">{username}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {connected ? 'En línea' : 'Conectando…'} · <span className="text-ink-faint">Mi perfil</span>
            </p>
          </div>
        </button>
        <button onClick={logout} className="p-2 text-ink-faint hover:text-red-500 transition" title="Cerrar Sesión">
          <LogOut size={18} />
        </button>
      </div>

      <LegalFooter compact className="bg-app" />
    </>
  );

  return (
    <div className="bg-app h-screen overflow-hidden flex font-sans text-ink">
      {/* Sidebar izquierda (desktop) */}
      <aside className="w-64 bg-panel border-r border-edge flex-col hidden md:flex">{sidebar}</aside>

      {/* Sidebar móvil (overlay) */}
      {showSidebar && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowSidebar(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside
            className="absolute left-0 top-0 bottom-0 w-64 bg-panel flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebar}
          </aside>
        </div>
      )}

      {/* Chat principal */}
      <main className="flex-1 flex flex-col relative bg-app min-w-0">
        <header className="md:hidden h-16 bg-panel border-b border-edge flex items-center px-4 gap-2 justify-between shrink-0">
          {/* El botón de usuarios va pegado al título, lejos del de salir */}
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setShowSidebar(true)} className="text-ink-faint hover:text-accent shrink-0">
              <Menu size={22} />
            </button>
            <h2 className="font-bold text-lg text-accent-ink truncate">{headerTitle}</h2>
            <button
              onClick={() => setShowUsers(true)}
              className="relative shrink-0 text-ink-faint hover:text-accent mr-2"
              title="Usuarios en línea"
            >
              <Users size={22} />
              {onlineUsers.length > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {onlineUsers.length}
                </span>
              )}
            </button>
          </div>
          <button onClick={logout} className="text-ink-faint hover:text-red-500 shrink-0 pl-2">
            <LogOut size={20} />
          </button>
        </header>

        <div className="hidden md:flex h-14 items-center justify-between gap-4 px-6 border-b border-edge bg-panel shrink-0">
          <h2 className="font-bold text-accent-ink truncate">{headerTitle}</h2>
          {/* Conectados de la sala actual: la misma cuenta que la lista de la derecha */}
          <span className="flex items-center gap-1.5 text-sm text-ink-soft shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{onlineUsers.length}</span>
            en línea
          </span>
        </div>

        <MessageList
          messages={activeMessages}
          currentUsername={username}
          avatars={onlineAvatars}
          canDelete={isAdmin && activeView.type === 'room'}
          onReact={react}
          onReply={setReplyingTo}
          onDelete={deleteMessage}
        />

        {/* Las fotos solo se permiten en privado (server/socket.js lo reimpone) */}
        <MessageInput
          onSend={sendMessage}
          allowPhotos={activeView.type === 'dm'}
          socketId={socketId}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      </main>

      {/* Sidebar derecha: usuarios en línea */}
      <UserList
        users={onlineUsers}
        currentUsername={username}
        isAdmin={isAdmin}
        onOpenDM={openDM}
        onAdminAction={adminAction}
        onEditProfile={() => {
          setShowUsers(false);
          setShowProfile(true);
        }}
        open={showUsers}
        onClose={() => setShowUsers(false)}
      />

      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} />}
      {showProfile && (
        <ProfileModal
          me={me}
          socketId={socketId}
          onClose={() => setShowProfile(false)}
          onGuestSave={saveGuestProfile}
          onCreateAccount={createAccount}
        />
      )}
    </div>
  );
}
