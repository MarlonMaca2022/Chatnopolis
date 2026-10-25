import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { replaceToken } from '../lib/session';

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-edge bg-muted text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent';

// Cambiar la contraseña de la cuenta con la que se entró (Mi perfil, solo
// registrados). Arranca cerrada: se usa pocas veces y el formulario ocupa lugar.
// Al abrirla pregunta si la cuenta tiene 2FA, para pedir el código solo si hace
// falta. Es un <form> aparte del de Mi perfil: no se pueden anidar.
export default function PasswordSection({ socketId }) {
  const [open, setOpen] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function openForm() {
    setError('');
    setDone(false);
    setOpen(true);
    try {
      setNeedsCode((await api.get2fa()).enabled);
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const form = e.target;
    setError('');
    // Solo para avisar antes: la regla de largo la decide el servidor
    if (form.newPassword.value !== form.repeatPassword.value) {
      setError('Las dos contraseñas nuevas no coinciden');
      return;
    }
    setBusy(true);
    try {
      const data = await api.changePassword(
        form.currentPassword.value,
        form.newPassword.value,
        needsCode ? form.code.value.trim() : undefined,
        socketId
      );
      replaceToken(data.token);
      setOpen(false);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-edge pt-5">
      <p className="block text-sm font-medium text-ink-soft mb-2">Contraseña</p>

      {error && (
        <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg border border-red-200 dark:bg-red-400/10 dark:border-red-400/25 dark:text-red-300">
          {error}
        </p>
      )}
      {done && (
        <p className="mb-3 text-sm text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200 dark:bg-emerald-400/10 dark:border-emerald-400/25 dark:text-emerald-300">
          Contraseña cambiada. Se cerraron tus sesiones en los otros dispositivos.
        </p>
      )}

      {!open ? (
        <button
          type="button"
          onClick={openForm}
          className="px-4 py-2 rounded-full text-sm border border-edge text-ink-soft hover:bg-muted transition flex items-center gap-2"
        >
          <KeyRound size={14} /> Cambiar contraseña
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Contraseña actual"
            className={inputClass}
          />
          <input
            name="newPassword"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Nueva contraseña (mínimo 6 caracteres)"
            className={inputClass}
          />
          <input
            name="repeatPassword"
            type="password"
            required
            autoComplete="new-password"
            placeholder="Repite la nueva contraseña"
            className={inputClass}
          />
          {needsCode && (
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Código de tu app de verificación"
              className={inputClass}
            />
          )}
          <p className="text-xs text-ink-faint">
            Al cambiarla se cierra tu sesión en los demás dispositivos; en este sigues conectado.
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 py-2.5 bg-accent hover:bg-accent-strong disabled:opacity-60 text-white font-semibold rounded-lg transition"
            >
              {busy ? 'Cambiando…' : 'Cambiar contraseña'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError('');
              }}
              className="px-4 py-2.5 rounded-lg border border-edge text-ink-soft hover:bg-muted transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
