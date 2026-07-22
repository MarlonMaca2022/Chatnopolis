import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { api } from '../lib/api';
import { setSession } from '../lib/session';

const inputClass =
  'w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50 hover:bg-white transition-colors';
const smallInputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50';

const TABS = [
  { id: 'guest', label: 'Invitado' },
  { id: 'login', label: 'Entrar' },
  { id: 'register', label: 'Registro' },
];

export default function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('guest');
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState('general');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getRooms().then(setRooms).catch(() => {});
    // Mensaje de expulsión/ban guardado antes de redirigir
    const reason = sessionStorage.getItem('disconnect_reason');
    if (reason) {
      setError(reason);
      sessionStorage.removeItem('disconnect_reason');
    }
  }, []);

  function switchTab(id) {
    setTab(id);
    setError('');
    setNotice('');
  }

  async function handleGuest(e) {
    e.preventDefault();
    const username = e.target.username.value.trim();
    if (!username) return;
    setSession({ username, role: 'guest', roomId });
    navigate('/chat');
  }

  async function handleLogin(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api.login(e.target.username.value.trim(), e.target.password.value);
      setSession({ token: data.token, username: data.username, role: data.role, roomId });
      navigate('/chat');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const form = e.target;
    if (form.password.value !== form.confirmPassword.value) {
      return setError('Las contraseñas no coinciden.');
    }
    setBusy(true);
    setError('');
    try {
      await api.register({
        username: form.username.value.trim(),
        password: form.password.value,
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        country: form.country.value.trim(),
      });
      setNotice('Cuenta creada exitosamente. ¡Ahora inicia sesión!');
      setTab('login');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-brand-50 min-h-screen flex items-center justify-center font-sans text-slate-800 p-4">
      <div className="w-full max-w-lg p-8 bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 my-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-brand-900 mb-2">Chatnopolis</h1>
          <p className="text-slate-500">Un espacio tranquilo para conversar</p>
        </div>

        <div className="flex border-b border-slate-200 mb-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={`flex-1 py-2 focus:outline-none transition-colors ${
                tab === t.id
                  ? 'text-brand-600 border-b-2 border-brand-500 font-semibold'
                  : 'text-slate-500 hover:text-brand-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab !== 'register' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Elige una Sala</label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {tab === 'guest' && (
          <form onSubmit={handleGuest} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tu Nick / Apodo</label>
              <input name="username" required placeholder="Ej: Viajero_Astral" className={inputClass} />
            </div>
            <button
              type="submit"
              className="w-full py-3 px-4 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition duration-200 flex justify-center items-center gap-2"
            >
              <span>Entrar como Invitado</span>
              <LogIn size={18} />
            </button>
          </form>
        )}

        {tab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de Usuario</label>
              <input name="username" required placeholder="Tu usuario registrado" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
              <input name="password" type="password" required placeholder="••••••••" className={inputClass} />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition duration-200"
            >
              {busy ? 'Entrando…' : 'Iniciar Sesión'}
            </button>
          </form>
        )}

        {tab === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                <input name="name" required placeholder="Juan Pérez" className={smallInputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
                <input name="country" required placeholder="Ej: México" className={smallInputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email (Recuperación)</label>
              <input name="email" type="email" required placeholder="juan@ejemplo.com" className={smallInputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Usuario (Nick)</label>
              <input name="username" required placeholder="jperez2024" className={smallInputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                <input name="password" type="password" required placeholder="••••••••" className={smallInputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar</label>
                <input name="confirmPassword" type="password" required placeholder="••••••••" className={smallInputClass} />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition duration-200 mt-2"
            >
              {busy ? 'Creando…' : 'Crear Cuenta'}
            </button>
          </form>
        )}

        {error && (
          <div className="mt-4 text-center text-sm text-red-500 bg-red-50 p-2 rounded-lg border border-red-200">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-4 text-center text-sm text-emerald-600 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
            {notice}
          </div>
        )}
      </div>
    </div>
  );
}
