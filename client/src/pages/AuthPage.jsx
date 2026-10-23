import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { api } from '../lib/api';
import { setSession } from '../lib/session';
import { LEGAL } from '../lib/legal';
import ThemeToggle from '../components/ThemeToggle.jsx';
import LegalFooter from '../components/LegalFooter.jsx';
import GenderPicker from '../components/GenderPicker.jsx';

const inputClass =
  'w-full px-4 py-3 rounded-lg border border-edge bg-muted text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent hover:bg-surface transition-colors';
const smallInputClass =
  'w-full px-3 py-2 rounded-lg border border-edge bg-muted text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent';

const TABS = [
  { id: 'guest', label: 'Invitado' },
  { id: 'login', label: 'Entrar' },
  { id: 'register', label: 'Registro' },
];

// Declaración de edad + aceptación. Los links van con <a target="_blank"> y no con
// <Link>: los campos del formulario no son estado controlado (se leen del DOM al
// enviar), así que navegar en la misma pestaña perdería lo que la persona escribió.
function ConsentCheck({ checked, onChange }) {
  return (
    <label className="flex items-start gap-3 text-sm text-ink-soft cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-edge accent-accent cursor-pointer"
      />
      <span className="leading-snug">
        Confirmo que tengo {LEGAL.edadMinima} años o más y acepto los{' '}
        <a href="/terminos" target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Términos
        </a>{' '}
        y la{' '}
        <a href="/privacidad" target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Política de privacidad
        </a>
        .
      </span>
    </label>
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('guest');
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState('general');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  // El servidor pidió re-aceptar los términos en este login (cuenta vieja o versión
  // nueva). Devolvió 200 pero SIN token, así que no hay sesión hasta que se acepte.
  const [termsOutdated, setTermsOutdated] = useState(false);
  // La cuenta tiene verificación en dos pasos: mismo patrón, 200 sin token hasta
  // que se manda el código. Usuario y contraseña siguen en el formulario.
  const [needsCode, setNeedsCode] = useState(false);
  // Nick y género del invitado que tocó "Crear una cuenta" en Mi perfil
  const [prefill, setPrefill] = useState(null);

  useEffect(() => {
    api.getRooms().then(setRooms).catch(() => {});
    try {
      const saved = JSON.parse(sessionStorage.getItem('register_prefill'));
      if (saved) {
        setPrefill(saved);
        setTab('register');
      }
    } catch {
      // un valor roto no impide entrar
    }
    sessionStorage.removeItem('register_prefill');
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
    setAccepted(false);
    setTermsOutdated(false);
    setNeedsCode(false);
  }

  const consentMissing = `Tienes que confirmar que eres mayor de ${LEGAL.edadMinima} y aceptar los términos.`;

  async function handleGuest(e) {
    e.preventDefault();
    const username = e.target.username.value.trim();
    if (!username) return;
    if (!accepted) return setError(consentMissing);
    // El flag y el género viajan al handshake del socket (ver ChatPage), que es
    // quien los exige.
    const gender = e.target.gender.value;
    setSession({ username, gender, role: 'guest', roomId, acceptedTerms: true });
    navigate('/chat');
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (termsOutdated && !accepted) return setError(consentMissing);
    setBusy(true);
    setError('');
    try {
      const data = await api.login(
        e.target.username.value.trim(),
        e.target.password.value,
        termsOutdated ? accepted : undefined,
        needsCode ? e.target.code.value.trim() : undefined
      );
      // Sin token: las credenciales estaban bien, pero faltan los términos.
      if (data.termsOutdated) {
        setTermsOutdated(true);
        setNotice('Actualizamos los términos. Léelos y confirma para continuar.');
        return;
      }
      // Sin token: falta el código de la app de autenticación.
      if (data.needsCode) {
        setNeedsCode(true);
        setNotice('Escribe el código de 6 dígitos de tu app de autenticación.');
        return;
      }
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
    if (!accepted) return setError(consentMissing);
    setBusy(true);
    setError('');
    try {
      await api.register({
        username: form.username.value.trim(),
        password: form.password.value,
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        country: form.country.value.trim(),
        gender: form.gender.value,
        acceptedTerms: accepted,
      });
      setNotice('Cuenta creada exitosamente. ¡Ahora inicia sesión!');
      setTab('login');
      setAccepted(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-app min-h-screen flex items-center justify-center font-sans text-ink p-4">
      <div className="w-full max-w-lg p-8 bg-panel rounded-2xl shadow-xl border border-edge my-8">
        <div className="relative text-center mb-6">
          <ThemeToggle className="absolute right-0 top-0" />
          <h1 className="text-3xl font-bold text-accent-ink mb-2">Chatnopolis</h1>
          <p className="text-ink-soft">Un espacio tranquilo para conversar</p>
        </div>

        <div className="flex border-b border-edge mb-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={`flex-1 py-2 focus:outline-none transition-colors ${
                tab === t.id
                  ? 'text-accent border-b-2 border-accent font-semibold'
                  : 'text-ink-faint hover:text-accent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab !== 'register' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-ink-soft mb-1">Elige una Sala</label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-edge bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent"
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
              <label className="block text-sm font-medium text-ink-soft mb-1">Tu Nick / Apodo</label>
              <input name="username" required placeholder="Ej: Viajero_Astral" className={inputClass} />
            </div>
            <GenderPicker />
            <ConsentCheck checked={accepted} onChange={setAccepted} />
            <button
              type="submit"
              className="w-full py-3 px-4 bg-accent hover:bg-accent-strong text-white font-semibold rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition duration-200 flex justify-center items-center gap-2"
            >
              <span>Entrar como Invitado</span>
              <LogIn size={18} />
            </button>
          </form>
        )}

        {tab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">Nombre de Usuario</label>
              <input name="username" required placeholder="Tu usuario registrado" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">Contraseña</label>
              <input name="password" type="password" required placeholder="••••••••" className={inputClass} />
            </div>
            {/* Solo aparece si el servidor pidió re-aceptar: al usuario habitual no lo molesta. */}
            {termsOutdated && <ConsentCheck checked={accepted} onChange={setAccepted} />}
            {needsCode && (
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">Código de verificación</label>
                <input
                  name="code"
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className={`${inputClass} tracking-widest`}
                />
                <p className="mt-1 text-xs text-ink-faint">
                  El de tu app de autenticación, o uno de tus códigos de recuperación.
                </p>
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 px-4 bg-accent hover:bg-accent-strong disabled:opacity-60 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition duration-200"
            >
              {busy ? 'Entrando…' : 'Iniciar Sesión'}
            </button>
          </form>
        )}

        {tab === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">Nombre Completo</label>
                <input name="name" required placeholder="Juan Pérez" className={smallInputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">País</label>
                <input name="country" required placeholder="Ej: México" className={smallInputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">Email (Recuperación)</label>
              <input name="email" type="email" required placeholder="juan@ejemplo.com" className={smallInputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1">Usuario (Nick)</label>
              <input
                name="username"
                required
                placeholder="jperez2024"
                defaultValue={prefill?.username}
                className={smallInputClass}
              />
            </div>
            <GenderPicker defaultValue={prefill?.gender} />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">Contraseña</label>
                <input name="password" type="password" required placeholder="••••••••" className={smallInputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1">Confirmar</label>
                <input name="confirmPassword" type="password" required placeholder="••••••••" className={smallInputClass} />
              </div>
            </div>
            <ConsentCheck checked={accepted} onChange={setAccepted} />
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition duration-200 mt-2"
            >
              {busy ? 'Creando…' : 'Crear Cuenta'}
            </button>
          </form>
        )}

        {error && (
          <div className="mt-4 text-center text-sm text-red-600 bg-red-50 p-2 rounded-lg border border-red-200 dark:bg-red-400/10 dark:border-red-400/25 dark:text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-4 text-center text-sm text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200 dark:bg-emerald-400/10 dark:border-emerald-400/25 dark:text-emerald-300">
            {notice}
          </div>
        )}

        <LegalFooter />
      </div>
    </div>
  );
}
