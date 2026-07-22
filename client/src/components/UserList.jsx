import { useEffect, useState } from 'react';
import { Ban, MessageSquare, MoreVertical, Shield, VolumeX, LogOut } from 'lucide-react';

export default function UserList({ users, currentUsername, isAdmin, onOpenDM, onAdminAction }) {
  const [openMenu, setOpenMenu] = useState(null);

  useEffect(() => {
    const close = () => setOpenMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  return (
    <aside className="w-64 bg-white border-l border-slate-200 flex-col hidden md:flex">
      <div className="p-6 border-b border-slate-100">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Usuarios en Línea ({users.length})
        </h3>
      </div>
      <div className="p-4 flex-1 overflow-y-auto">
        <ul className="space-y-3">
          {users.map((user) => {
            const isUserAdmin = user.role === 'admin';
            const isMe = user.username === currentUsername;
            return (
              <li
                key={user.username}
                className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg transition relative"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isUserAdmin ? 'bg-amber-500' : 'bg-green-500'}`} />
                  <span className="text-slate-600 font-medium flex items-center gap-1 truncate">
                    {user.username}
                    {isUserAdmin && <Shield size={12} className="text-amber-500 shrink-0" />}
                  </span>
                </div>

                {!isMe && (
                  <>
                    <button
                      className="text-slate-400 hover:text-slate-600 p-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenu(openMenu === user.username ? null : user.username);
                      }}
                    >
                      <MoreVertical size={16} />
                    </button>

                    {openMenu === user.username && (
                      <div
                        className="absolute right-0 top-8 w-44 bg-white rounded-lg shadow-xl border border-slate-100 z-50 flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            onOpenDM(user.username);
                            setOpenMenu(null);
                          }}
                          className="text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-brand-600 flex items-center gap-2"
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
                              className="text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600 flex items-center gap-2"
                            >
                              <VolumeX size={14} /> Silenciar
                            </button>
                            <button
                              onClick={() => {
                                onAdminAction('kick', user.username);
                                setOpenMenu(null);
                              }}
                              className="text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-orange-600 flex items-center gap-2"
                            >
                              <LogOut size={14} /> Expulsar
                            </button>
                            <button
                              onClick={() => {
                                onAdminAction('ban', user.username);
                                setOpenMenu(null);
                              }}
                              className="text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <Ban size={14} /> Banear
                            </button>
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
    </aside>
  );
}
