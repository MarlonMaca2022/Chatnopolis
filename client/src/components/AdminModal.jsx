import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Shield, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { clearSession } from '../lib/session';

// "43 min" / "2 h 10 min" / "permanente" — until null significa sin vencimiento
function formatUntil(until) {
  if (!until) return 'permanente';
  const minutes = Math.round((new Date(until).getTime() - Date.now()) / 60000);
  if (minutes <= 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${Math.floor(minutes / 60)} h`;
}

// Corta todas las sesiones de la cuenta, esta incluida. Es lo que hay que tocar si
// se sospecha que alguien más entró: su sesión deja de valer en el acto.
function SessionsSection() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function revokeAll() {
    if (!window.confirm('¿Cerrar la sesión en todos los dispositivos, incluido este?')) return;
    setError('');
    setBusy(true);
    try {
      await api.revokeSessions();
      sessionStorage.setItem('disconnect_reason', 'Cerraste la sesión en todos los dispositivos.');
      clearSession();
      navigate('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div>
      <h4 className="text-sm font-bold text-ink-faint uppercase tracking-wider mb-4 border-b border-edge pb-2">
        Sesiones
      </h4>
      {error && (
        <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg border border-red-200 dark:bg-red-400/10 dark:border-red-400/25 dark:text-red-300">
          {error}
        </p>
      )}
      <p className="text-sm text-ink-soft mb-3">
        Si crees que alguien más entró con tu cuenta, cierra todas las sesiones: la suya deja de
        funcionar al instante y tú vuelves a entrar con tu contraseña.
      </p>
      <button
        onClick={revokeAll}
        disabled={busy}
        className="px-4 py-2 rounded-lg text-sm flex items-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-400/25 dark:text-red-300 dark:hover:bg-red-400/10 disabled:opacity-60 transition"
      >
        <LogOut size={14} /> Cerrar sesión en todos los dispositivos
      </button>
    </div>
  );
}

// Contraseña nueva para otra cuenta (la persona la olvidó): el admin la elige y se la
// pasa por fuera del chat. Pide la contraseña del admin, y su código si tiene 2FA,
// porque el servidor los exige: con la sesión del admin sola no alcanza.
function ResetPasswordForm({ username, onDone, onCancel }) {
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get2fa().then((s) => setNeedsCode(s.enabled)).catch((err) => setError(err.message));
  }, []);

  async function submit(e) {
    e.preventDefault();
    const form = e.target;
    setError('');
    setBusy(true);
    try {
      await api.resetPassword(
        username,
        form.newPassword.value,
        form.adminPassword.value,
        needsCode ? form.code.value.trim() : undefined
      );
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const input =
    'w-full px-3 py-2 bg-surface text-ink placeholder:text-ink-faint border border-edge rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent';
  return (
    <form onSubmit={submit} className="p-3 bg-app rounded-lg border border-edge space-y-2">
      <p className="text-xs text-ink-soft">
        Nueva contraseña para <strong className="text-ink">{username}</strong>. Se cierran sus sesiones
        abiertas; pásale la contraseña por fuera del chat.
      </p>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-200 dark:bg-red-400/10 dark:border-red-400/25 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {/* Visible (type="text") a propósito: el admin la tiene que copiar para pasársela */}
        <input
          name="newPassword"
          type="text"
          required
          minLength={6}
          autoComplete="off"
          placeholder="Nueva contraseña"
          className={input}
        />
        <input
          name="adminPassword"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Tu contraseña de admin"
          className={input}
        />
        {needsCode && (
          <input
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Tu código de verificación"
            className={input}
          />
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs border border-edge text-ink-soft hover:bg-muted transition"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs hover:bg-accent-strong disabled:opacity-60 transition"
        >
          {busy ? 'Guardando…' : 'Restablecer'}
        </button>
      </div>
    </form>
  );
}

export default function AdminModal({ onClose }) {
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [resetting, setResetting] = useState(null); // usuario con el formulario de contraseña abierto
  const [notice, setNotice] = useState('');
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
            {notice && (
              <p className="mb-3 text-sm text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200 dark:bg-emerald-400/10 dark:border-emerald-400/25 dark:text-emerald-300">
                {notice}
              </p>
            )}
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
                    <Fragment key={user.username}>
                      <tr className="border-b border-edge">
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
                          {user.role !== 'admin' && (
                            <button
                              onClick={() => {
                                setNotice('');
                                setResetting(resetting === user.username ? null : user.username);
                              }}
                              className="text-xs text-accent-ink hover:underline"
                            >
                              Contraseña
                            </button>
                          )}
                        </td>
                      </tr>
                      {resetting === user.username && (
                        <tr className="border-b border-edge">
                          <td colSpan={4} className="px-4 py-3">
                            <ResetPasswordForm
                              username={user.username}
                              onCancel={() => setResetting(null)}
                              onDone={() => {
                                setResetting(null);
                                setNotice(`Listo: ${user.username} ya puede entrar con la contraseña nueva.`);
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

          <SessionsSection />
        </div>
      </div>
    </div>
  );
}
