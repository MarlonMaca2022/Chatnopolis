import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { LEGAL } from '../lib/legal';
import ThemeToggle from './ThemeToggle.jsx';

const KEY = 'chatnopolis-age-ack';

// Aviso de edad de la primera visita. Es un cartel disuasorio, no una verificación:
// la declaración que vale es el checkbox del formulario, que sí viaja al servidor
// (ver AuthPage y el handshake en server/socket.js).
//
// Solo se guarda el "sí". El "no" no se persiste a propósito: bloquear el navegador
// para siempre por un clic mal dado sería peor, y quien quiera saltearlo lo saltea
// igual recargando.
function ackStored() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export default function AgeGate({ children }) {
  const [state, setState] = useState(() => (ackStored() ? 'ok' : 'pending'));

  if (state === 'ok') return children;

  function accept() {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // Modo incógnito con storage bloqueado: se pregunta de nuevo la próxima vez.
    }
    setState('ok');
  }

  return (
    <div className="bg-app min-h-screen flex items-center justify-center font-sans text-ink p-4">
      <div className="w-full max-w-md p-8 bg-panel rounded-2xl shadow-xl border border-edge text-center">
        <div className="relative">
          <ThemeToggle className="absolute right-0 -top-2" />
        </div>

        {state === 'blocked' ? (
          <>
            <ShieldAlert size={36} className="mx-auto text-red-500 dark:text-red-400 mb-4" />
            <h1 className="text-2xl font-bold text-ink mb-3">No puedes entrar</h1>
            <p className="text-ink-soft leading-relaxed">
              Este chat es solo para personas de {LEGAL.edadMinima} años o más. Gracias por tu
              honestidad.
            </p>
            <p className="mt-4 text-sm text-ink-faint">
              Si necesitas hablar con alguien, busca una línea de ayuda de tu país o una persona
              adulta de confianza.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-accent-ink mb-2">Chatnopolis</h1>
            <p className="text-ink-soft mb-6">Un espacio tranquilo para conversar</p>

            <div className="p-4 rounded-xl bg-surface border border-edge text-left mb-6">
              <p className="font-semibold text-ink mb-2">
                Contenido para mayores de {LEGAL.edadMinima} años
              </p>
              <p className="text-sm text-ink-soft leading-relaxed">
                En las conversaciones privadas se permite contenido adulto entre personas que lo
                consienten. Para entrar tienes que tener {LEGAL.edadMinima} años o más.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={accept}
                className="w-full py-3 px-4 bg-accent hover:bg-accent-strong text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition duration-200"
              >
                Tengo {LEGAL.edadMinima} años o más
              </button>
              <button
                onClick={() => setState('blocked')}
                className="w-full py-3 px-4 rounded-lg border border-edge text-ink-soft hover:bg-muted transition-colors"
              >
                Soy menor de {LEGAL.edadMinima}
              </button>
            </div>

            <p className="mt-6 text-xs text-ink-faint">
              Al continuar aceptas los{' '}
              <Link to="/terminos" className="text-accent hover:underline">
                Términos
              </Link>{' '}
              y la{' '}
              <Link to="/privacidad" className="text-accent hover:underline">
                Política de privacidad
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
