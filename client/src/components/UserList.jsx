import { useEffect, useState } from 'react';
import { Ban, MessageSquare, MoreVertical, Shield, Volume2, VolumeX, LogOut, X } from 'lucide-react';

// Duraciones aceptadas por el servidor (BAN_DURATIONS en server/socket.js).
// minutes null = permanente.
const BAN_OPTIONS = [
  { label: '10 min', minutes: 10 },
  { label: '1 hora', minutes: 60 },
  { label: '4 horas', minutes: 240 },
  { label: 'Permanente', minutes: null, full: true },
];

// `open` / `onClose` solo aplican al drawer móvil; en desktop la lista es fija.
export default function UserList({ users, currentUsername, isAdmin, onOpenDM, onAdminAction, open, onClose }) {
  const [openMenu, setOpenMenu] = useState(null);

  useEffect(() => {
    const close = () => setOpenMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const content = (
    <>
      <div className="p-6 border-b border-edge flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-ink-faint uppercase tracking-wider">
          Usuarios en Línea ({users.length})
        </h3>
        <button
          onClick={onClose}
          className="md:hidden text-ink-faint hover:text-ink shrink-0"
          title="Cerrar"
        >
          <X size={18} />
        </button>
      </div>
      <div className="p-4 flex-1 overflow-y-auto">
        <ul className="space-y-3">
          {users.map((user) => {
            const isUserAdmin = user.role === 'admin';
            const isMe = user.username === currentUsername;
            return (
              <li
                key={user.username}
                className="flex items-center justify-between p-2 hover:bg-muted rounded-lg transition relative"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      user.isMuted ? 'bg-ink-faint/50' : isUserAdmin ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                  />
                  <span
                    className={`font-medium flex items-center gap-1 truncate ${
                      user.isMuted ? 'text-ink-faint italic' : 'text-ink-soft'
                    }`}
                    title={user.isMuted ? 'Silenciado' : undefined}
                  >
                    {user.username}
                    {isUserAdmin && <Shield size={12} className="text-amber-500 shrink-0" />}
                    {user.isMuted && <VolumeX size={12} className="text-ink-faint shrink-0" />}
                  </span>
                </div>

                {!isMe && (
                  <>
                    <button
                      className="text-ink-faint hover:text-ink p-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenu(openMenu === user.username ? null : user.username);
                      }}
                    >
                      <MoreVertical size={16} />
                    </button>

                    {openMenu === user.username && (
                      <div
                        className="absolute right-0 top-8 w-52 bg-panel rounded-lg shadow-xl border border-edge z-50 flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            onOpenDM(user.username);
                            setOpenMenu(null);
                          }}
                          className="text-left px-4 py-2 text-sm text-ink-soft hover:bg-muted hover:text-accent flex items-center gap-2"
                        >
                          <MessageSquare size={14} /> Chat Privado
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => {
                                onAdminAction('mute', user.username);
                                setOpenMenu(null);
                              }}
                              className="text-left px-4 py-2 text-sm text-ink-soft hover:bg-muted hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-2"
                            >
                              {user.isMuted ? (
                                <>
                                  <Volume2 size={14} /> Desilenciar
                                </>
                              ) : (
                                <>
                                  <VolumeX size={14} /> Silenciar
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => {
                                onAdminAction('kick', user.username);
                                setOpenMenu(null);
                              }}
                              className="text-left px-4 py-2 text-sm text-ink-soft hover:bg-muted hover:text-orange-600 dark:hover:text-orange-400 flex items-center gap-2"
                            >
                              <LogOut size={14} /> Expulsar
                            </button>

                            <div className="px-4 pt-2 pb-1 text-xs font-semibold text-red-500 dark:text-red-400 uppercase tracking-wider flex items-center gap-2 border-t border-edge mt-1">
                              <Ban size={12} /> Banear
                            </div>
                            <div className="grid grid-cols-2 gap-1 px-2 pb-2">
                              {BAN_OPTIONS.map((option) => (
                                <button
                                  key={option.label}
                                  onClick={() => {
                                    onAdminAction('ban', user.username, option.minutes);
                                    setOpenMenu(null);
                                  }}
                                  className={`px-2 py-1.5 text-xs rounded border border-red-100 text-red-600 hover:bg-red-50 dark:border-red-400/25 dark:text-red-300 dark:hover:bg-red-400/10 transition ${
                                    option.full ? 'col-span-2' : ''
                                  }`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: columna fija a la derecha */}
      <aside className="w-64 bg-panel border-l border-edge flex-col hidden md:flex">{content}</aside>

      {/* Móvil: overlay deslizante */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={onClose}>
          <div className="absolute inset-0 bg-black/40" />
          <aside
            className="absolute right-0 top-0 bottom-0 w-64 bg-panel flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
