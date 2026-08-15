import { Link } from 'react-router-dom';
import { LEGAL, LEGAL_LINKS } from '../lib/legal';

// Pie legal. `compact` es la variante del sidebar del chat, donde hay poco lugar.
// Los links abren en pestaña nueva porque desde el chat no queremos tirar abajo
// la sesión de socket para leer los términos.
export default function LegalFooter({ compact = false, className = '' }) {
  if (compact) {
    return (
      <div className={`px-4 py-2 border-t border-edge text-[11px] text-ink-faint ${className}`}>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {LEGAL_LINKS.map((l) => (
            <a
              key={l.to}
              href={l.to}
              target="_blank"
              rel="noreferrer"
              className="hover:text-accent transition-colors"
            >
              {l.label}
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`mt-6 pt-4 border-t border-edge text-center text-xs text-ink-faint ${className}`}>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {LEGAL_LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="hover:text-accent transition-colors">
            {l.label}
          </Link>
        ))}
      </div>
      <p className="mt-2">Solo para mayores de {LEGAL.edadMinima} años.</p>
    </div>
  );
}
