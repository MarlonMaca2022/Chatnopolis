import { useEffect, useState } from 'react';
import { Shield, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';

export default function AdminModal({ onClose }) {
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [newRoom, setNewRoom] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    try {
      const [roomsData, usersData] = await Promise.all([api.getRooms(), api.getUsers()]);
      setRooms(roomsData);
      setUsers(usersData);
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
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Shield size={18} className="text-amber-500" /> Panel de Administración
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <X size={22} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-8">
          {error && (
            <p className="text-sm text-red-500 bg-red-50 p-2 rounded-lg border border-red-200">{error}</p>
          )}

          <div>
            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 border-b pb-2">
              Gestión de Salas
            </h4>
            <form onSubmit={createRoom} className="flex gap-2 mb-4">
              <input
                value={newRoom}
                onChange={(e) => setNewRoom(e.target.value)}
                placeholder="Nombre de nueva sala..."
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm hover:bg-brand-600 transition"
              >
                Crear
              </button>
            </form>
            <ul className="space-y-2">
              {rooms.map((room) => (
                <li
                  key={room.id}
                  className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-200"
                >
                  <span># {room.name}</span>
                  {room.id !== 'general' && (
                    <button
                      onClick={() => deleteRoom(room.id)}
                      className="text-red-500 hover:text-red-700 text-sm p-1"
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
            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 border-b pb-2">
              Usuarios Registrados
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                  <tr>
                    <th className="px-4 py-2">Usuario</th>
                    <th className="px-4 py-2">Rol</th>
                    <th className="px-4 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.username} className="border-b border-slate-100">
                      <td className="px-4 py-2 font-medium">{user.username}</td>
                      <td className="px-4 py-2">{user.role}</td>
                      <td className="px-4 py-2 space-x-1">
                        {user.isBanned && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs">Baneado</span>
                        )}
                        {user.isMuted && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-600 rounded-full text-xs">
                            Silenciado
                          </span>
                        )}
                        {!user.isBanned && !user.isMuted && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-600 rounded-full text-xs">Activo</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
