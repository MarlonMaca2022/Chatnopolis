// Círculo con la inicial del nick. `className` trae los colores del contexto
// (propio, admin, privado…) y `size` el tamaño con su texto.
export default function Avatar({ name, className = 'bg-muted text-ink-soft', size = 'w-8 h-8 text-xs' }) {
  return (
    <div
      className={`${size} ${className} rounded-full shrink-0 flex items-center justify-center font-bold select-none`}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
