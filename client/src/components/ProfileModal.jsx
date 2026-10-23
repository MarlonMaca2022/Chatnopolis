import { useRef, useState } from 'react';
import { Camera, Loader2, UserPlus, X } from 'lucide-react';
import { api } from '../lib/api';
import { compressImage } from '../lib/compressImage';
import Avatar from './Avatar.jsx';
import GenderPicker from './GenderPicker.jsx';

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-edge bg-muted text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent';

const ROLE_LABELS = { guest: 'Invitado', user: 'Cuenta registrada', admin: 'Administrador' };

// Mi perfil. `me` es la entrada propia de roomUsers ({ username, role, gender,
// avatarUrl }): como el servidor la reenvía con cada cambio, lo que se guarda acá
// vuelve solo por esa vía y no hace falta estado propio de la foto ni del género.
// Invitado: cambia nick y género por el socket (`onGuestSave`). Registrado: su nick
// es fijo, el género va por REST y es el único que puede tener foto.
export default function ProfileModal({ me, onClose, onGuestSave, onCreateAccount }) {
  const isGuest = me.role === 'guest';
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function save(e) {
    e.preventDefault();
    const form = e.target;
    setError('');
    setSaved(false);
    setBusy(true);
    try {
      if (isGuest) {
        await onGuestSave(form.nick.value.trim(), form.gender.value);
      } else {
        await api.updateProfile(form.gender.value);
      }
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function pickPhoto(e) {
    const picked = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!picked) return;
    setError('');
    setPhotoBusy(true);
    try {
      // Se muestra chica: 512 px alcanzan de sobra y pesa una fracción
      const file = await compressImage(picked, { maxDimension: 512 }).catch(() => picked);
      await api.uploadAvatar(file);
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setError('');
    setPhotoBusy(true);
    try {
      await api.removeAvatar();
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-panel w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-edge flex justify-between items-center">
          <h3 className="text-lg font-bold text-ink">Mi perfil</h3>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition" title="Cerrar">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={save} className="p-6 overflow-y-auto space-y-5">
          <div className="flex items-center gap-4">
            <Avatar
              name={me.username}
              src={me.avatarUrl}
              size="w-16 h-16 text-2xl"
              className="bg-accent-soft text-accent-ink"
            />
            {isGuest ? (
              <p className="text-sm text-ink-soft">Crea una cuenta para poner foto de perfil.</p>
            ) : (
              <div className="flex flex-col items-start gap-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={pickPhoto}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={photoBusy}
                  className="px-4 py-2 rounded-full text-sm border border-edge text-ink-soft hover:bg-muted disabled:opacity-60 transition flex items-center gap-2"
                >
                  {photoBusy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  {me.avatarUrl ? 'Cambiar foto' : 'Poner foto'}
                </button>
                {me.avatarUrl && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    disabled={photoBusy}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline px-1"
                  >
                    Quitar foto
                  </button>
                )}
              </div>
            )}
          </div>
          {!isGuest && (
            <p className="text-xs text-ink-faint -mt-2">
              Se ve en las salas públicas: nada de desnudos ni contenido sexual.
            </p>
          )}

          <div>
            <p className="block text-sm font-medium text-ink-soft mb-1">Rol</p>
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-edge bg-surface">
              <span className="text-sm font-semibold text-ink">{ROLE_LABELS[me.role] || me.role}</span>
              {isGuest && (
                <button
                  type="button"
                  onClick={onCreateAccount}
                  className="text-sm font-medium text-accent-ink hover:text-accent flex items-center gap-1"
                >
                  <UserPlus size={14} /> Crear una cuenta
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1" htmlFor="profile-username">
              Nombre de usuario
            </label>
            {isGuest ? (
              // name="nick" y no "username": con "username" los gestores de contraseñas
              // toman el campo por un login y se meten a autocompletarlo
              <input
                id="profile-username"
                name="nick"
                required
                defaultValue={me.username}
                autoComplete="off"
                className={inputClass}
              />
            ) : (
              <>
                <p id="profile-username" className={`${inputClass} text-ink-soft`}>
                  {me.username}
                </p>
                <p className="mt-1 text-xs text-ink-faint">El nombre de una cuenta no se puede cambiar.</p>
              </>
            )}
          </div>

          <GenderPicker defaultValue={me.gender} />

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg border border-red-200 dark:bg-red-400/10 dark:border-red-400/25 dark:text-red-300">
              {error}
            </p>
          )}
          {saved && !error && (
            <p className="text-sm text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200 dark:bg-emerald-400/10 dark:border-emerald-400/25 dark:text-emerald-300">
              Cambios guardados.
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 bg-accent hover:bg-accent-strong disabled:opacity-60 text-white font-semibold rounded-lg transition"
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </div>
    </div>
  );
}
