import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Hash, LogOut, Menu, Shield, User, ChevronRight, Users } from 'lucide-react';
import { getSession, clearSession } from '../lib/session';
import { api } from '../lib/api';
import MessageList from '../components/MessageList.jsx';
import MessageInput from '../components/MessageInput.jsx';
import UserList from '../components/UserList.jsx';
import AdminModal from '../components/AdminModal.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

const BAN_LABELS = { 10: '10 minutos', 60: '1 hora', 240: '4 horas' };

// Reintentos cuando el nick choca al reconectar: cubren de sobra el pingTimeout del
// servidor (~20 s), que es lo que tarda en soltar nuestro socket anterior.
const NICK_RETRY_MS = 3000;
const NICK_MAX_RETRIES = 10;

export default function ChatPage() {
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);
  const initialRoom = session?.roomId || 'general';

  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
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

  const username = session?.username;

  const pushMessage = useCallback((key, msg) => {
    setChats((prev) => ({ ...prev, [key]: [...(prev[key] || []), msg] }));
  }, []);

  useEffect(() => {
    if (!session) return;

    api.getRooms().then((rooms) => {
      setRoomsMap(Object.fromEntries(rooms.map((r) => [r.id, r.name])));
    }).catch(() => {});

    const socket = io({
      auth: session.token ? { token: session.token } : { username: session.username },
    });
    socketRef.current = socket;

    let hadConnected = false;   // ya entramos una vez => un choque de nick es nuestro socket viejo
    let nickRetries = 0;
    let nickRetryTimer;

    socket.on('connect', () => {
      setConnected(true);
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
      navigate('/');
    });

    socket.on('forceDisconnect', (reason) => {
      sessionStorage.setItem('disconnect_reason', reason);
      clearSession();
      navigate('/');
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
        key = data.from === session.username ? data.to : data.from;
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

    // Vuelve a "Conectando…" mientras se reconecta (incluidos los reintentos de nick)
    socket.on('disconnect', () => setConnected(false));

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

  function switchRoom(id) {
    if (id !== roomId) {
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
    if (activeView.type === 'dm') {
      socket.emit('privateMessage', { targetUsername: activeView.target, text, imageUrl });
    } else {
      socket.emit('chatMessage', { text, imageUrl });
    }
  }

  // durationMinutes solo aplica a 'ban' (null = permanente)
  function adminAction(action, targetUser, durationMinutes = null) {
    const isMuted = onlineUsers.find((u) => u.username === targetUser)?.isMuted;
    const prompts = {
      mute: isMuted ? `¿Quitar el silencio a ${targetUser}?` : `¿Silenciar a ${targetUser}?`,
      kick: `¿Expulsar a ${targetUser}? Podrá volver a entrar enseguida.`,
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
    navigate('/');
  }

  const headerTitle =
    activeView.type === 'room'
      ? `# ${roomsMap[roomId] || roomId}`
      : `@ ${activeView.target}`;

  const activeMessages = chats[activeView.target] || [];

  const sidebar = (
    <>
      <div className="p-6 border-b border-edge flex items-center justify-between">
        <h2 className="text-xl font-bold text-accent-ink">Chatnopolis</h2>
        <div className="flex items-center gap-3">
          {session.role === 'admin' && (
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
        <h3 className="text-xs font-semibold text-ink-faint uppercase tracking-wider mb-4">Salas</h3>
        <ul className="space-y-1 mb-6">
          {Object.entries(roomsMap).map(([id, name]) => {
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
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${
                  isActive
                    ? 'bg-accent-soft text-accent-ink font-bold border border-accent/40 shadow-sm'
                    : 'hover:bg-muted text-ink-soft'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-muted text-ink-soft flex items-center justify-center text-xs font-bold">
                    {dmUser.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate max-w-[120px]">{dmUser}</span>
                </div>
                {unread.has(dmUser) && <span className="w-2 h-2 bg-rose-500 rounded-full" />}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="p-4 border-t border-edge bg-app flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent-soft flex items-center justify-center text-accent-ink font-bold">
            <User size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink truncate max-w-[100px]">{username}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {connected ? 'En línea' : 'Conectando…'}
            </p>
          </div>
        </div>
        <button onClick={logout} className="p-2 text-ink-faint hover:text-red-500 transition" title="Cerrar Sesión">
          <LogOut size={18} />
        </button>
      </div>
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
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
                  {onlineUsers.length}
                </span>
              )}
            </button>
          </div>
          <button onClick={logout} className="text-ink-faint hover:text-red-500 shrink-0 pl-2">
            <LogOut size={20} />
          </button>
        </header>

        <div className="hidden md:flex h-14 items-center px-6 border-b border-edge bg-panel shrink-0">
          <h2 className="font-bold text-accent-ink">{headerTitle}</h2>
        </div>

        <MessageList messages={activeMessages} currentUsername={username} />

        {/* Las fotos solo se permiten en privado (server/socket.js lo reimpone) */}
        <MessageInput onSend={sendMessage} allowPhotos={activeView.type === 'dm'} />
      </main>

      {/* Sidebar derecha: usuarios en línea */}
      <UserList
        users={onlineUsers}
        currentUsername={username}
        isAdmin={session.role === 'admin'}
        onOpenDM={openDM}
        onAdminAction={adminAction}
        open={showUsers}
        onClose={() => setShowUsers(false)}
      />

      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} />}
    </div>
  );
}
