import { useEffect, useState } from 'react';

// Foto de perfil, o un círculo con la inicial del nick. `className` trae los
// colores del círculo según el contexto (propio, admin, privado…) y `size` el
// tamaño con su texto.
// Si la foto no carga (la cambiaron o un moderador la quitó y este mensaje todavía
// tiene la URL vieja) se vuelve a la inicial en vez de mostrar una imagen rota.
export default function Avatar({ name, src, className = 'bg-muted text-ink-soft', size = 'w-8 h-8 text-xs' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className={`${size} rounded-full shrink-0 object-cover bg-muted`}
      />
    );
  }
  return (
    <div
      className={`${size} ${className} rounded-full shrink-0 flex items-center justify-center font-bold select-none`}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
