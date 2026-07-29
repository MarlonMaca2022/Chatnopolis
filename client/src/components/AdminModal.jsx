import { useEffect, useState } from 'react';
import { Shield, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';

// "43 min" / "2 h 10 min" / "permanente" — until null significa sin vencimiento
function formatUntil(until) {
  if (!until) return 'permanente';
  const minutes = Math.round((new Date(until).getTime() - Date.now()) / 60000);
  if (minutes <= 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${Math.floor(minutes / 60)} h`;
}

export default function AdminModal({ onClose }) {
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [guestBans, setGuestBans] = useState([]);
  const [newRoom, setNewRoom] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    try {
      const [roomsData, usersData, guestBansData] = await Promise.all([
        api.getRooms(),
        api.getUsers(),
        api.getGuestBans(),
      ]);
      setRooms(roomsData);
      setUsers(usersData);
      setGuestBans(guestBansData);
    } catch (err) {
      setError(err.message);
    }
  }

  // Envuelve una acción de moderación: limpia el error previo y refresca al terminar
  async function run(action) {
    setError('');
    try {
      await action();
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function createRoom(e) {
    e.preventDefault();
    if (!newRoom.trim()) return;
    setError('');
    try {
      await api.createRoom(newRoom.trim());
      setNewRoom('');
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteRoom(id) {
    if (!window.confirm('¿Eliminar esta sala?')) return;
    setError('');
    try {
      await api.deleteRoom(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-panel w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-edge flex justify-between items-center bg-app">
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            <Shield size={18} className="text-amber-500" /> Panel de Administración
          </h3>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition">
            <X size={22} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-8">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg border border-red-200 dark:bg-red-400/10 dark:border-red-400/25 dark:text-red-300">
              {error}
            </p>
          )}

          <div>
            <h4 className="text-sm font-bold text-ink-faint uppercase tracking-wider mb-4 border-b border-edge pb-2">
              Gestión de Salas
            </h4>
            <form onSubmit={createRoom} className="flex gap-2 mb-4">
              <input
                value={newRoom}
                onChange={(e) => setNewRoom(e.target.value)}
                placeholder="Nombre de nueva sala..."
                className="flex-1 px-3 py-2 bg-surface text-ink placeholder:text-ink-faint border border-edge rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent-strong transition"
              >
                Crear
              </button>
            </form>
            <ul className="space-y-2">
              {rooms.map((room) => (
                <li
                  key={room.id}
                  className="flex justify-between items-center p-2 bg-app rounded border border-edge text-ink-soft"
                >
                  <span># {room.name}</span>
                  {room.id !== 'general' && (
                    <button
                      onClick={() => deleteRoom(room.id)}
                      className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 text-sm p-1"
                      title="Eliminar sala"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold text-ink-faint uppercase tracking-wider mb-4 border-b border-edge pb-2">
              Usuarios Registrados
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-ink-soft">
                <thead className="text-xs text-ink uppercase bg-muted">
                  <tr>
                    <th className="px-4 py-2">Usuario</th>
                    <th className="px-4 py-2">Rol</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.username} className="border-b border-edge">
                      <td className="px-4 py-2 font-medium">{user.username}</td>
                      <td className="px-4 py-2">{user.role}</td>
                      <td className="px-4 py-2 space-x-1">
                        {user.isBanned && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-600 dark:bg-red-400/15 dark:text-red-300 rounded-full text-xs">
                            Baneado · {formatUntil(user.bannedUntil)}
                          </span>
                        )}
                        {user.isMuted && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300 rounded-full text-xs">
                            Silenciado
                          </span>
                        )}
                        {!user.isBanned && !user.isMuted && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300 rounded-full text-xs">
                            Activo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap space-x-2">
                        {user.isBanned && (
                          <button
                            onClick={() => run(() => api.unbanUser(user.username))}
                            className="text-xs text-red-600 dark:text-red-400 hover:underline"
                          >
                            Desbanear
                          </button>
                        )}
                        {user.isMuted && (
                          <button
                            onClick={() => run(() => api.unmuteUser(user.username))}
                            className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                          >
                            Desilenciar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-ink-faint uppercase tracking-wider mb-4 border-b border-edge pb-2">
              Invitados Baneados
            </h4>
            {guestBans.length === 0 ? (
              <p className="text-sm text-ink-faint">No hay invitados baneados.</p>
            ) : (
              <ul className="space-y-2">
                {guestBans.map((ban) => (
                  <li
                    key={ban.username}
                    className="flex justify-between items-center p-2 bg-app rounded border border-edge text-ink-soft"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="truncate font-medium">{ban.username}</span>
                      <span className="px-2 py-0.5 bg-red-100 text-red-600 dark:bg-red-400/15 dark:text-red-300 rounded-full text-xs shrink-0">
                        {formatUntil(ban.expiresAt)}
                      </span>
                    </span>
                    <button
                      onClick={() => run(() => api.unbanGuest(ban.username))}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline shrink-0"
                    >
                      Desbanear
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
