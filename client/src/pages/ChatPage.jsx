import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Hash, LogOut, Menu, Shield, User, ChevronRight } from 'lucide-react';
import { getSession, clearSession } from '../lib/session';
import { api } from '../lib/api';
import MessageList from '../components/MessageList.jsx';
import MessageInput from '../components/MessageInput.jsx';
import UserList from '../components/UserList.jsx';
import AdminModal from '../components/AdminModal.jsx';

export default function ChatPage() {
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);
  const roomId = session?.roomId || 'general';

  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [chats, setChats] = useState({}); // { chatKey: [mensajes] }
  const [activeView, setActiveView] = useState({ type: 'room', target: roomId });
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;

  const [onlineUsers, setOnlineUsers] = useState([]);
  const [roomsMap, setRoomsMap] = useState({});
  const [dms, setDms] = useState([]); // usernames con chat abierto
  const [unread, setUnread] = useState(new Set());
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

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

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join', { room: roomId });
    });

    socket.on('connect_error', (err) => {
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
        key = roomId;
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

    socket.on('roomUsers', ({ users }) => setOnlineUsers(users));

    socket.on('roomsUpdate', (rooms) => {
      setRoomsMap(Object.fromEntries(rooms.map((r) => [r.id, r.name])));
    });

    return () => socket.disconnect();
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
  }

  function openRoom() {
    setActiveView({ type: 'room', target: roomId });
    setUnread((prev) => {
      const next = new Set(prev);
      next.delete(roomId);
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

  function adminAction(action, targetUser) {
    if (!window.confirm(`¿Estás seguro de ${action} a ${targetUser}?`)) return;
    socketRef.current?.emit(`admin:${action}`, targetUser);
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
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-xl font-bold text-brand-900">Chatnopolis</h2>
        {session.role === 'admin' && (
          <button
            onClick={() => setShowAdmin(true)}
            className="text-slate-400 hover:text-amber-600 transition"
            title="Panel de Administración"
          >
            <Shield size={18} />
          </button>
        )}
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Sala Actual</h3>
        <button
          onClick={openRoom}
          className={`w-full px-4 py-3 rounded-lg font-medium flex justify-between items-center mb-6 transition shadow-sm border ${
            activeView.type === 'room'
              ? 'bg-brand-50 text-brand-700 border-brand-200'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span className="flex items-center gap-2">
            <Hash size={14} /> {roomsMap[roomId] || roomId}
            {unread.has(roomId) && <span className="w-2 h-2 bg-rose-500 rounded-full" />}
          </span>
          <ChevronRight size={12} className="opacity-50" />
        </button>

        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Mensajes Directos</h3>
        <ul className="space-y-1 mb-6">
          {dms.map((dmUser) => {
            const isActive = activeView.type === 'dm' && activeView.target === dmUser;
            return (
              <li
                key={dmUser}
                onClick={() => openDM(dmUser)}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${
                  isActive
                    ? 'bg-brand-100 text-brand-700 font-bold border border-brand-200 shadow-sm'
                    : 'hover:bg-slate-50 text-slate-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold">
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

      <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold">
            <User size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-900 truncate max-w-[100px]">{username}</p>
            <p className="text-xs text-green-600">{connected ? 'En línea' : 'Conectando…'}</p>
          </div>
        </div>
        <button onClick={logout} className="p-2 text-slate-400 hover:text-red-500 transition" title="Cerrar Sesión">
          <LogOut size={18} />
        </button>
      </div>
    </>
  );

  return (
    <div className="bg-brand-50 h-screen overflow-hidden flex font-sans text-slate-800">
      {/* Sidebar izquierda (desktop) */}
      <aside className="w-64 bg-white border-r border-slate-200 flex-col hidden md:flex">{sidebar}</aside>

      {/* Sidebar móvil (overlay) */}
      {showSidebar && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowSidebar(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside
            className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebar}
          </aside>
        </div>
      )}

      {/* Chat principal */}
      <main className="flex-1 flex flex-col relative bg-white/50 min-w-0">
        <header className="md:hidden h-16 bg-white border-b border-slate-200 flex items-center px-4 justify-between shrink-0">
          <button onClick={() => setShowSidebar(true)} className="text-slate-500 hover:text-brand-600">
            <Menu size={22} />
          </button>
          <h2 className="font-bold text-lg text-brand-900">{headerTitle}</h2>
          <button onClick={logout} className="text-slate-400 hover:text-red-500">
            <LogOut size={20} />
          </button>
        </header>

        <div className="hidden md:flex h-14 items-center px-6 border-b border-slate-200 bg-white shrink-0">
          <h2 className="font-bold text-brand-900">{headerTitle}</h2>
        </div>

        <MessageList messages={activeMessages} currentUsername={username} />

        <MessageInput onSend={sendMessage} />
      </main>

      {/* Sidebar derecha: usuarios en línea */}
      <UserList
        users={onlineUsers}
        currentUsername={username}
        isAdmin={session.role === 'admin'}
        onOpenDM={openDM}
        onAdminAction={adminAction}
      />

      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} />}
    </div>
  );
}
