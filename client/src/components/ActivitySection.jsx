import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../lib/api';

// "2026-10-27" -> "lun 27 oct". Se parsea a mediodía UTC para que ninguna zona
// horaria lo corra al día anterior.
function formatDay(day) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

// null = ese día todavía no se medía
const show = (n) => (n === null ? '—' : n);
const visits = (d) => (d.visitsGuest === null ? null : d.visitsGuest + d.visitsUser);
const sent = (d) => (d.messagesRoom === null ? null : d.messagesRoom + d.messagesDm);

function Tile({ label, value, detail }) {
  return (
    <div className="p-3 bg-app rounded-lg border border-edge">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="text-2xl font-bold text-ink tabular-nums">{value}</p>
      {detail && <p className="text-xs text-ink-soft">{detail}</p>}
    </div>
  );
}

function DaysTable({ days }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-ink-soft">
        <thead className="text-xs text-ink uppercase bg-muted">
          <tr>
            <th className="px-3 py-2">Día</th>
            <th className="px-3 py-2 text-right">Entraron</th>
            <th className="px-3 py-2 text-right">Máx. a la vez</th>
            <th className="px-3 py-2 text-right">Mensajes</th>
            <th className="px-3 py-2 text-right">Cuentas nuevas</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day} className="border-b border-edge">
              <td className="px-3 py-1.5 whitespace-nowrap">{formatDay(d.day)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                <span className="font-medium text-ink">{show(visits(d))}</span>
                {visits(d) > 0 && (
                  <span className="block text-xs text-ink-faint whitespace-nowrap">
                    {d.visitsGuest} inv. · {d.visitsUser} reg.
                  </span>
                )}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{show(d.peakOnline)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{show(sent(d))}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{d.registrations}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Una sola serie (entradas por día), de izquierda (más viejo) a derecha (hoy). Los
// días sin medir no tienen barra. El detalle de cada día está en el title de la
// columna y en la tabla de abajo.
function DaysChart({ days }) {
  const ordered = [...days].reverse();
  const max = Math.max(1, ...ordered.map((d) => visits(d) ?? 0));
  return (
    <div>
      <div className="flex items-end gap-0.5 h-32 border-b border-edge" role="img" aria-label="Entradas por día">
        {ordered.map((d) => {
          const n = visits(d);
          return (
            <div
              key={d.day}
              className="group relative flex-1 h-full flex items-end hover:bg-muted rounded-t"
              title={
                n === null
                  ? `${formatDay(d.day)}: no se medía`
                  : `${formatDay(d.day)}: ${n} entraron (${d.visitsGuest} invitados, ${d.visitsUser} registrados)`
              }
            >
              {n > 0 && (
                <div
                  className="w-full bg-accent group-hover:bg-accent-strong rounded-t"
                  style={{ height: `${(n / max) * 100}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-ink-faint mt-1">
        <span>{formatDay(ordered[0].day)}</span>
        <span>hoy</span>
      </div>
    </div>
  );
}

// Cuánta gente usa el chat (server/stats.js). Solo totales: el servidor no guarda
// quién entró. El gráfico va a la vista y la tabla plegada, para no estirar el panel.
export default function ActivitySection() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setError('');
    setLoading(true);
    try {
      setData(await api.getStats());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const today = data?.days[0];

  return (
    <div>
      <h4 className="text-sm font-bold text-ink-faint uppercase tracking-wider mb-4 border-b border-edge pb-2 flex items-center justify-between">
        Actividad
        <button
          onClick={load}
          disabled={loading}
          title="Actualizar"
          className="text-ink-faint hover:text-ink disabled:opacity-60 transition normal-case"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </h4>
      {error && (
        <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg border border-red-200 dark:bg-red-400/10 dark:border-red-400/25 dark:text-red-300">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Tile
              label="Conectados ahora"
              value={data.online.total}
              detail={`${data.online.guests} inv. · ${data.online.users} reg.`}
            />
            <Tile label="Entraron hoy" value={show(visits(today))} />
            <Tile label="Máximo a la vez hoy" value={show(today.peakOnline)} />
          </div>

          <DaysChart days={data.days} />
          <details className="mt-3">
            <summary className="text-xs text-accent-ink cursor-pointer hover:underline">
              Ver los números día por día
            </summary>
            <div className="mt-2">
              <DaysTable days={data.days} />
            </div>
          </details>

          <p className="text-xs text-ink-faint mt-3">
            Cada persona cuenta una vez por día aunque entre varias veces; un invitado que vuelve con
            otro nick cuenta como otra persona. Tu cuenta de admin no se cuenta. "—" es un día en que
            todavía no se medía.
          </p>
        </>
      )}
    </div>
  );
}
