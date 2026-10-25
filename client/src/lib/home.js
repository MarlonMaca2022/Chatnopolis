// Textos de la homepage. Módulo de datos a propósito (sin JSX), igual que legal.js:
// el texto se corrige sin tocar componentes.
//
// Todo lo que acá se promete tiene que ser cierto HOY (fotos de 24 h, moderación,
// entrar sin registro…). Si cambia el sistema, cambia este texto en el mismo commit,
// igual que la política de privacidad.

import { Hash, MessageCircle, Moon, ShieldCheck, Smartphone, Timer } from 'lucide-react';
import { LEGAL } from './legal';

export const HERO = {
  title: 'Chat en español gratis y sin registro',
  // El mismo título partido para destacar una palabra con color en la portada
  titleParts: ['Chat en español ', 'gratis', ' y sin registro'],
  subtitle:
    'Elige un apodo, entra a una sala y conversa con gente en tiempo real. Sin email, sin descargar nada.',
  cta: 'Entrar al chat',
};

// Las 4 salas que trae la base nueva. Las que cree el admin usan roomDescription().
// Cuando existan las páginas por sala, esto pasa a rooms.description en la base.
const ROOM_DESCRIPTIONS = {
  general: 'De todo un poco: para presentarte, charlar de tu día o conocer gente nueva.',
  tecnologia: 'Programación, celulares, videojuegos y la última app que todos están usando.',
  musica: 'Lo que estás escuchando, conciertos, recomendaciones y discusiones de géneros.',
  cine: 'Películas, series y estrenos. Recomienda, debate y, por favor, avisa los spoilers.',
  colombia: 'Para hablar con gente de todo el país, o de afuera con ganas de conocer Colombia.',
  'medell-n': 'Parceros de Medellín y el Valle de Aburrá: planes, recomendaciones y buena charla.',
};

// "Chat de música" es lo que la gente busca; "Chat de General" no se dice.
export function roomTitle(room) {
  return room.id === 'general' ? 'Chat general' : `Chat de ${room.name}`;
}

export function roomDescription(room) {
  return ROOM_DESCRIPTIONS[room.id] || `Chat de ${room.name} en español, abierto a todos.`;
}

// Lo que se pinta mientras llega GET /api/rooms: así la página nunca sale sin salas.
export const DEFAULT_ROOMS = [
  { id: 'general', name: 'General' },
  { id: 'colombia', name: 'Colombia' },
  { id: 'musica', name: 'Música' },
  { id: 'cine', name: 'Cine y TV' },
];

export const STEPS = [
  { title: 'Elige un apodo', text: 'Sin email ni contraseña: entras como invitado.' },
  { title: 'Elige una sala', text: 'Entra a la que más te guste y cámbiate cuando quieras.' },
  { title: 'Conversa', text: 'Escribe en la sala o abre un privado con quien quieras.' },
];

// `icon`: componente de lucide-react
export const FEATURES = [
  {
    icon: Hash,
    title: 'Salas públicas',
    text: 'Conversaciones abiertas por tema, en tiempo real.',
  },
  {
    icon: MessageCircle,
    title: 'Mensajes privados',
    text: 'Habla a solas con otra persona y comparte fotos.',
  },
  {
    icon: Timer,
    title: 'Fotos que se borran',
    text: 'Las fotos de los privados se eliminan solas a las 24 horas.',
  },
  {
    icon: ShieldCheck,
    title: 'Moderación activa',
    text: 'Quien molesta puede ser silenciado, expulsado o bloqueado.',
  },
  {
    icon: Smartphone,
    title: 'En el celular',
    text: 'Funciona en el navegador del teléfono, sin instalar nada.',
  },
  {
    icon: Moon,
    title: 'Modo oscuro',
    text: 'Cómodo para la vista a cualquier hora.',
  },
];

export const SAFETY = {
  title: `Solo para mayores de ${LEGAL.edadMinima} años`,
  text: `En los mensajes privados se permite contenido adulto entre personas que lo consienten, por eso la edad mínima no se negocia. En las salas públicas no se permite contenido sexual. Si alguien te molesta o ves algo que no debería estar, escríbenos a ${LEGAL.contacto}.`,
};

export const FAQ = [
  {
    q: '¿Es gratis?',
    a: 'Sí. Entrar, usar las salas y mandar mensajes privados no cuesta nada.',
  },
  {
    q: '¿Hace falta registrarse?',
    a: 'No. Puedes entrar como invitado eligiendo solo un apodo. Si quieres conservar tu nombre y tus privados, puedes crear una cuenta gratis.',
  },
  {
    q: '¿Es anónimo?',
    a: 'Como invitado no te pedimos email, nombre real ni contraseña: solo un apodo. Lo que escribas en una sala lo ve toda la sala, así que no compartas datos personales.',
  },
  {
    q: '¿Qué pasa con mis fotos?',
    a: 'Solo se pueden mandar por privado, y se borran del servidor a las 24 horas.',
  },
  {
    q: `¿Por qué hay que tener ${LEGAL.edadMinima} años?`,
    a: `Porque en los privados se permite contenido adulto entre personas que lo consienten. Por eso el chat es solo para mayores de ${LEGAL.edadMinima}.`,
  },
];

// Conversación de muestra de la variante "Vitrina". Es ilustrativa: nombres y
// mensajes inventados, no sale de la base.
export const SAMPLE_CHAT = {
  room: 'Música',
  messages: [
    { user: 'Luna_22', text: '¿Alguien fue al concierto del sábado? 🎶', time: '21:04' },
    { user: 'Andrés', text: '¡Yo! El cierre estuvo increíble', time: '21:05' },
    { user: 'Tú', text: 'Me lo perdí 😩 ¿Grabaron algo?', time: '21:05', me: true },
    { user: 'Luna_22', text: 'Te paso un video por privado 😉', time: '21:06' },
  ],
};
