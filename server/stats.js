// Cuánta gente usa el chat, en totales por día: entradas (invitados y registrados),
// el máximo de personas conectadas a la vez y los mensajes enviados. Solo números:
// la base nunca guarda quién entró ni cuándo. Las cuentas de admin no cuentan,
// porque inflarían los números con la propia moderación.
const { stats } = require('./db');

// Los días se cortan a medianoche de Colombia, no de UTC: si no, lo que pasa de
// 7 p. m. en adelante caería en el día siguiente. Colombia no tiene horario de
// verano, así que el desfase es fijo.
const UTC_OFFSET_HOURS = -5;

// Cuántos días muestra el panel
const REPORT_DAYS = 30;

const dayOf = (ms) => new Date(ms + UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
const today = () => dayOf(Date.now());

// Quién ya entró hoy, para no contar dos veces a la misma persona cuando recarga,
// cambia de red o vuelve más tarde. Por canónica, como toda identidad (ver
// server/nicks.js). Vive solo en memoria y se vacía al cambiar el día: es lo que
// permite que la base guarde números y no nombres. El costo es que un reinicio del
// servidor (un deploy) vuelve a contar a quien entre después ese mismo día.
let seen = { day: null, canons: new Set() };

function recordVisit(user) {
  if (user.role === 'admin') return;
  const day = today();
  if (seen.day !== day) seen = { day, canons: new Set() };
  if (seen.canons.has(user.canon)) return;
  seen.canons.add(user.canon);
  stats.add(day, user.role === 'guest' ? 'visits_guest' : 'visits_user');
}

// `count` = personas distintas conectadas ahora (ver onlineNow en socket.js)
function recordOnline(count) {
  if (count > 0) stats.max(today(), 'peak_online', count);
}

function recordMessage(isPrivate) {
  stats.add(today(), isPrivate ? 'messages_dm' : 'messages_room');
}

// Los últimos REPORT_DAYS días, del más reciente al más viejo. Los días anteriores
// al primer conteo van con null (el panel muestra "—"): no es que no haya entrado
// nadie, es que todavía no se medía. Las altas sí salen siempre.
function report() {
  const from = dayOf(Date.now() - (REPORT_DAYS - 1) * 86_400_000);
  const firstCounted = stats.firstDay();
  const byDay = {};
  const row = (day) =>
    (byDay[day] ??= {
      day,
      visitsGuest: 0,
      visitsUser: 0,
      peakOnline: 0,
      messagesRoom: 0,
      messagesDm: 0,
      registrations: 0,
    });
  const field = {
    visits_guest: 'visitsGuest',
    visits_user: 'visitsUser',
    peak_online: 'peakOnline',
    messages_room: 'messagesRoom',
    messages_dm: 'messagesDm',
  };
  stats.since(from).forEach(({ day, metric, value }) => {
    if (field[metric]) row(day)[field[metric]] = value;
  });
  stats
    .registrationsSince(from, `${UTC_OFFSET_HOURS} hours`)
    .forEach(({ day, n }) => (row(day).registrations = n));

  // Todos los días del rango, también los vacíos: un día sin nadie es un dato
  const days = [];
  for (let i = 0; i < REPORT_DAYS; i++) {
    const day = dayOf(Date.now() - i * 86_400_000);
    const entry = { ...row(day) };
    if (!firstCounted || day < firstCounted) {
      Object.assign(entry, {
        visitsGuest: null,
        visitsUser: null,
        peakOnline: null,
        messagesRoom: null,
        messagesDm: null,
      });
    }
    days.push(entry);
  }
  // Recortamos la cola de días sin ningún dato: antes de que existiera el sitio
  while (days.length > 1 && isEmpty(days[days.length - 1])) days.pop();
  return days;
}

const isEmpty = (d) => d.visitsGuest === null && d.registrations === 0;

module.exports = { recordVisit, recordOnline, recordMessage, report };
