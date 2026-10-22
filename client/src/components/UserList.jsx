import { useEffect, useState } from 'react';
import { Ban, MessageSquare, MoreVertical, Shield, Volume2, VolumeX, LogOut, X } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { GENDERS, genderLabel } from '../lib/gender';

// Duraciones aceptadas por el servidor (BAN_DURATIONS en server/socket.js).
// minutes null = permanente.
const BAN_OPTIONS = [
  { label: '10 min', minutes: 10 },
  { label: '1 hora', minutes: 60 },
  { label: '4 horas', minutes: 240 },
  { label: 'Permanente', minutes: null, full: true },
];

// Filtros de la lista: 'todos' o un id de GENDERS. Quien no tiene género (cuentas
// anteriores a que existiera) solo aparece en Todos.
const FILTERS = [{ id: 'todos', plural: 'Todos' }, ...GENDERS];

// `open` / `onClose` solo aplican al drawer móvil; en desktop la lista es fija.
export default function UserList({ users, currentUsername, isAdmin, onOpenDM, onAdminAction, open, onClose }) {
  const [openMenu, setOpenMenu] = useState(null);
  // Uno solo para la columna y el drawer: los dos renderizan el mismo `content`
  const [filter, setFilter] = useState('todos');

  useEffect(() => {
    const close = () => setOpenMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const countFor = (id) => (id === 'todos' ? users.length : users.filter((u) => u.gender === id).length);
  const visibleUsers = filter === 'todos' ? users : users.filter((u) => u.gender === filter);

  const content = (
    <>
      <div className="px-5 pt-5 pb-4 border-b border-edge space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-ink-faint uppercase tracking-wider flex items-center gap-2">
            En línea
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300 normal-case tracking-normal">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {users.length}
            </span>
          </h3>
          <button
            onClick={onClose}
            className="md:hidden text-ink-faint hover:text-ink shrink-0"
            title="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por género">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={active}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                  active
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface text-ink-soft border-edge hover:bg-muted'
                }`}
              >
                {f.plural}
                <span className={`ml-1 ${active ? 'opacity-80' : 'text-ink-faint'}`}>{countFor(f.id)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="p-3 flex-1 overflow-y-auto">
        {visibleUsers.length === 0 && (
          <p className="text-sm text-ink-faint text-center py-6">Nadie con este filtro.</p>
        )}
        <ul className="space-y-1">
          {visibleUsers.map((user) => {
            const isUserAdmin = user.role === 'admin';
            const isMe = user.username === currentUsername;
            const gender = genderLabel(user.gender);
            return (
              <li
                key={user.username}
                className="flex items-center justify-between p-2 hover:bg-muted rounded-lg transition relative"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <Avatar
                      name={user.username}
                      size="w-9 h-9 text-sm"
                      className={
                        isUserAdmin
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300'
                          : 'bg-accent-soft text-accent-ink'
                      }
                    />
                    {/* Punto de estado: verde conectado, gris silenciado */}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-panel ${
                        user.isMuted ? 'bg-ink-faint' : 'bg-emerald-500'
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <span
                      className={`font-medium flex items-center gap-1 ${
                        user.isMuted ? 'text-ink-faint italic' : 'text-ink'
                      }`}
                      title={user.isMuted ? 'Silenciado' : undefined}
                    >
                      <span className="truncate">{user.username}</span>
                      {isUserAdmin && <Shield size={12} className="text-amber-500 shrink-0" />}
                      {user.isMuted && <VolumeX size={12} className="text-ink-faint shrink-0" />}
                      {isMe && (
                        <span className="px-1.5 rounded-full bg-accent-soft text-accent-ink text-[10px] font-bold uppercase shrink-0">
                          Tú
                        </span>
                      )}
                    </span>
                    {gender && (
                      <span className="inline-block mt-0.5 px-1.5 py-px rounded-md bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300 text-[11px] font-medium">
                        {gender}
                      </span>
                    )}
                  </div>
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
                        className="absolute right-0 top-full mt-1 w-52 bg-panel rounded-lg shadow-xl border border-edge z-50 flex flex-col overflow-hidden"
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
