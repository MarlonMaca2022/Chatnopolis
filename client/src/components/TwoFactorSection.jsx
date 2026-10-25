import { useEffect, useState } from 'react';
import { Copy, KeyRound, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { replaceToken } from '../lib/session';

const inputClass =
  'w-full px-3 py-2 bg-surface text-ink placeholder:text-ink-faint border border-edge rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent';
const primaryButton =
  'px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent-strong disabled:opacity-60 transition';

// "ABCD EFGH …" — más fácil de tipear a mano si la cámara no lee el QR
const groupSecret = (secret) => secret.match(/.{1,4}/g).join(' ');

// Verificación en dos pasos de la cuenta con la que se entró. Vive en el panel de
// admin porque hoy es la única cuenta que la necesita; el servidor la soporta para
// cualquier registrado. Los campos se leen del formulario al enviar, como en AuthPage.
export default function TwoFactorSection({ socketId }) {
  // null mientras carga; después { enabled, recoveryLeft }
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null); // { secret, qr } durante la activación
  const [recoveryCodes, setRecoveryCodes] = useState(null); // solo justo después de activar
  const [disabling, setDisabling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = () => api.get2fa().then(setStatus).catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  // Envuelve cada paso: limpia el error previo y bloquea el botón mientras responde
  async function step(action) {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const startSetup = () => step(async () => setSetup(await api.setup2fa()));

  const confirmSetup = (e) => {
    e.preventDefault();
    const form = e.target;
    step(async () => {
      const data = await api.enable2fa(form.password.value, form.code.value.trim(), socketId);
      replaceToken(data.token);
      setSetup(null);
      setRecoveryCodes(data.recoveryCodes);
      load();
    });
  };

  const confirmDisable = (e) => {
    e.preventDefault();
    const form = e.target;
    step(async () => {
      const data = await api.disable2fa(form.password.value, form.code.value.trim(), socketId);
      replaceToken(data.token);
      setDisabling(false);
      load();
    });
  };

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setCopied(true);
    } catch {
      setError('No se pudo copiar. Selecciona los códigos y cópialos a mano.');
    }
  }

  return (
    <div>
      <h4 className="text-sm font-bold text-ink-faint uppercase tracking-wider mb-4 border-b border-edge pb-2">
        Verificación en dos pasos
      </h4>

      {error && (
        <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg border border-red-200 dark:bg-red-400/10 dark:border-red-400/25 dark:text-red-300">
          {error}
        </p>
      )}

      {!status && !error && <p className="text-sm text-ink-faint">Cargando…</p>}

      {/* Recién activada: los códigos de recuperación se muestran esta única vez */}
      {recoveryCodes && (
        <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-400/25 dark:bg-amber-400/10 space-y-3">
          <p className="text-sm text-ink">
            <strong>Guarda estos códigos de recuperación.</strong> Cada uno sirve una sola vez para
            entrar si pierdes el celular. No se van a volver a mostrar.
          </p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-ink">
            {recoveryCodes.map((code) => (
              <li key={code} className="px-2 py-1 bg-surface rounded border border-edge text-center">
                {code}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button onClick={copyCodes} className={`${primaryButton} flex items-center gap-2`}>
              <Copy size={14} /> {copied ? 'Copiados' : 'Copiar'}
            </button>
            <button
              onClick={() => setRecoveryCodes(null)}
              className="px-4 py-2 rounded-lg text-sm border border-edge text-ink-soft hover:bg-muted transition"
            >
              Ya los guardé
            </button>
          </div>
        </div>
      )}

      {status && !status.enabled && !setup && (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">
            Además de la contraseña, al entrar se pide un código de 6 dígitos de una app como Google
            Authenticator, Authy o 1Password. Si alguien consigue tu contraseña, sin tu celular no entra.
          </p>
          <button onClick={startSetup} disabled={busy} className={`${primaryButton} flex items-center gap-2`}>
            <KeyRound size={14} /> Activar
          </button>
        </div>
      )}

      {setup && (
        <form onSubmit={confirmSetup} className="space-y-4">
          <p className="text-sm text-ink-soft">
            1. Escanea este código con tu app de autenticación.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
            <img src={setup.qr} alt="Código QR para la app de autenticación" className="w-44 h-44 rounded-lg" />
            <div className="text-xs text-ink-faint space-y-1 min-w-0">
              <p>¿No puedes escanearlo? Carga esta clave a mano:</p>
              <code className="block font-mono text-sm text-ink break-all select-all">
                {groupSecret(setup.secret)}
              </code>
            </div>
          </div>
          <p className="text-sm text-ink-soft">2. Escribe el código que muestra la app y tu contraseña.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Código de 6 dígitos"
              className={`${inputClass} tracking-widest`}
            />
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Tu contraseña"
              className={inputClass}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={primaryButton}>
              {busy ? 'Verificando…' : 'Confirmar y activar'}
            </button>
            <button
              type="button"
              onClick={() => setSetup(null)}
              className="px-4 py-2 rounded-lg text-sm text-ink-soft hover:bg-muted transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {status?.enabled && !recoveryCodes && (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            Activa. Te quedan {status.recoveryLeft} códigos de recuperación.
          </p>
          {!disabling ? (
            <button
              onClick={() => setDisabling(true)}
              className="text-xs text-red-600 dark:text-red-400 hover:underline"
            >
              Desactivar
            </button>
          ) : (
            <form onSubmit={confirmDisable} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Tu contraseña"
                  className={inputClass}
                />
                <input
                  name="code"
                  required
                  autoComplete="one-time-code"
                  placeholder="Código o código de recuperación"
                  className={inputClass}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-60 transition"
                >
                  {busy ? 'Desactivando…' : 'Desactivar'}
                </button>
                <button
                  type="button"
                  onClick={() => setDisabling(false)}
                  className="px-4 py-2 rounded-lg text-sm text-ink-soft hover:bg-muted transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
