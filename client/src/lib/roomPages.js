// Textos de las páginas de sala (/chat-medellin, /chat-colombia…). Módulo de datos
// a propósito, igual que home.js: una sola plantilla (pages/RoomPage.jsx) pinta
// todas las salas y lo único que cambia es esto. Una sala nueva con página propia
// es una entrada más en ROOM_PAGES; publicRoutes.jsx y lib/seo.js la toman solas.
//
// Reglas, las mismas que home.js:
// - Todo lo que se promete tiene que ser cierto HOY (gratis, sin registro, fotos
//   solo por privado que se borran a las 24 h, moderación, +18).
// - Nada de cifras de usuarios inventadas ni nada explícito: estas páginas van sin
//   la etiqueta adulta para aparecer con SafeSearch.
// - Cada página tiene que ser distinta de verdad (municipios, barrios, regiones,
//   cómo se habla): una copia que solo cambia el nombre de la ciudad no posiciona.
//
// `roomId` es el id de la sala en la base (rooms.id), NO la URL: Medellín quedó
// como "medell-n" porque la tilde se convirtió en guion al crearla. El botón de
// entrar lleva a /entrar?sala=<roomId>, así que tiene que coincidir.

import { Heart, Smile, Users } from 'lucide-react';
import { LEGAL } from './legal';

// Respuestas que valen para cualquier sala, con el nombre del lugar adentro
const commonFaq = (place) => [
  {
    q: '¿Tengo que descargar una aplicación?',
    a: `No. Chatnopolis funciona en el navegador del celular o del computador: abres la página, eliges un apodo y ya estás en la sala de ${place}.`,
  },
  {
    q: '¿Es seguro chatear con desconocidos?',
    a: 'Las salas tienen moderación: quien molesta puede ser silenciado, expulsado o bloqueado. Las fotos solo se mandan por privado y se borran del servidor a las 24 horas. Aun así, no compartas tu dirección, tus contraseñas ni tus datos bancarios con nadie.',
  },
  {
    q: `¿Por qué el chat es solo para mayores de ${LEGAL.edadMinima} años?`,
    a: `Porque en los mensajes privados se permite contenido adulto entre personas que lo consienten. Por eso la edad mínima es de ${LEGAL.edadMinima} años, sin excepciones.`,
  },
];

const MEET_SAFELY =
  'Si decides conocer a alguien en persona, quédense de ver en un lugar público y concurrido, avísale a alguien de confianza a dónde vas y nunca le envíes dinero a una persona que conociste por chat.';

export const ROOM_PAGES = [
  {
    path: '/chat-medellin',
    roomId: 'medell-n',
    name: 'Medellín',
    tone: 'emerald',
    meta: {
      title: 'Chat Medellín gratis: conoce gente paisa | Chatnopolis',
      description:
        'Chat de Medellín gratis y sin registro: conoce gente del Valle de Aburrá, haz amigos o encuentra el amor en línea. Entras con un apodo. Solo +18.',
    },
    hero: {
      titleParts: ['Chat de ', 'Medellín', ' gratis'],
      subtitle:
        'Conoce gente paisa, haz amigos o encuentra el amor en línea. En Chatnopolis entras con un apodo, sin registro y sin descargar nada.',
      greeting: '¡Quiubo, parce! 👋',
      cta: 'Entrar al chat de Medellín',
    },
    intro: {
      title: 'El chat de Medellín de Chatnopolis',
      paragraphs: [
        'La sala de Medellín es el punto de encuentro de Chatnopolis para la gente de la ciudad y de todo el Valle de Aburrá. Es un chat gratis y en tiempo real: eliges un apodo, entras y ya estás conversando con paisas que, como tú, tienen ganas de hablar un rato.',
        'No hace falta crear una cuenta, dar tu correo ni instalar una app: funciona desde el navegador del celular o del computador. Y si quieres conservar tu nombre y tus conversaciones privadas, puedes registrarte gratis cuando quieras.',
      ],
    },
    reasons: {
      title: 'Para qué sirve el chat de Medellín',
      items: [
        {
          icon: Users,
          title: 'Conocer gente',
          text: 'Habla en tiempo real con gente de tu misma ciudad. Desde un saludo en la sala hasta una buena charla sobre el Metro, el clima loco de la eterna primavera o el partido del domingo.',
        },
        {
          icon: Smile,
          title: 'Hacer amigos',
          text: 'Encuentra con quién compartir planes: un café en Laureles, una caminata por Santa Elena o alguien que te acompañe a un concierto. Primero se conversa y después se cuadra.',
        },
        {
          icon: Heart,
          title: 'Encontrar el amor',
          text: 'Muchas historias empiezan con un mensaje. Si alguien de la sala te cae bien, escríbele por privado y conózcanse con calma, a su ritmo.',
        },
      ],
    },
    local: {
      title: 'Gente de todo el Valle de Aburrá',
      text: 'La sala está abierta a toda el área metropolitana, no solo a Medellín. Aquí se cruzan el que vive en la loma y el del centro, el que madruga a coger el Metro y el que sale a parchar el fin de semana.',
      groups: [
        {
          title: 'Municipios del Valle de Aburrá',
          items: ['Medellín', 'Envigado', 'Itagüí', 'Bello', 'Sabaneta', 'La Estrella', 'Caldas', 'Copacabana', 'Girardota', 'Barbosa'],
        },
        {
          title: 'Algunos barrios de Medellín',
          items: ['Laureles', 'El Poblado', 'Belén', 'Robledo', 'Aranjuez', 'Manrique', 'Castilla', 'La América', 'San Javier', 'Buenos Aires'],
        },
      ],
      note: '¿Eres paisa y vives en otra ciudad o fuera de Colombia? También eres bienvenido: la sala sirve para no perder el acento ni el contacto con la tierrita.',
    },
    safety: MEET_SAFELY,
    faq: [
      {
        q: '¿Hay un chat de Medellín gratis y sin registro?',
        a: 'Sí. En la sala de Medellín de Chatnopolis entras con solo un apodo: no te pedimos correo, contraseña ni teléfono, y no cuesta nada. Si quieres, después puedes crear una cuenta gratis para conservar tu nombre.',
      },
      {
        q: '¿Puedo conocer gente de Envigado, Bello, Itagüí o Sabaneta?',
        a: 'Sí. La sala es para todo el Valle de Aburrá, así que caben Medellín y los municipios vecinos. Si alguien te interesa, ábrele un mensaje privado y sigan la conversación a solas.',
      },
      {
        q: '¿Sirve para encontrar pareja en Medellín?',
        a: 'Puede ser un buen comienzo. Mucha gente entra a conocer personas y, si hay química, sigue la conversación por privado. Tómate tu tiempo, conoce bien a la otra persona antes de verse y cuida tus datos personales.',
      },
      ...commonFaq('Medellín'),
    ],
    cta: {
      title: '¿Qué más pues? La sala te está esperando',
      text: 'Elige tu apodo y entra al chat de Medellín en menos de un minuto.',
    },
  },
  {
    path: '/chat-colombia',
    roomId: 'colombia',
    name: 'Colombia',
    tone: 'amber',
    meta: {
      title: 'Chat Colombia gratis: conoce gente colombiana | Chatnopolis',
      description:
        'Chat de Colombia gratis y sin registro: conoce gente de Bogotá, Medellín, Cali, Barranquilla y todo el país. Haz amigos o encuentra el amor. +18.',
    },
    hero: {
      titleParts: ['Chat de ', 'Colombia', ' gratis'],
      subtitle:
        'Conoce gente de todo el país, haz amigos o encuentra el amor en línea. En Chatnopolis entras con un apodo, sin registro y sin descargar nada.',
      greeting: '¡Hola, Colombia! 👋',
      cta: 'Entrar al chat de Colombia',
    },
    intro: {
      title: 'El chat de Colombia de Chatnopolis',
      paragraphs: [
        'La sala de Colombia es el lugar de Chatnopolis para hablar con gente de todo el país: de la capital, de la costa, del Eje Cafetero, del Pacífico o de los Llanos. Es un chat gratis y en tiempo real: eliges un apodo, entras y empiezas a conversar.',
        'No hace falta crear una cuenta, dar tu correo ni instalar una app: funciona desde el navegador del celular o del computador. Y si quieres conservar tu nombre y tus conversaciones privadas, puedes registrarte gratis cuando quieras.',
      ],
    },
    reasons: {
      title: 'Para qué sirve el chat de Colombia',
      items: [
        {
          icon: Users,
          title: 'Conocer gente',
          text: 'Habla con colombianos de otras ciudades y regiones, cada uno con su acento y sus historias. Una forma fácil de salir de la rutina y conocer gente nueva sin moverte de la casa.',
        },
        {
          icon: Smile,
          title: 'Hacer amigos',
          text: 'Encuentra gente con tus mismos gustos: la música, el fútbol, las series o los viajes por el país. Hay amistades que empiezan en una sala y terminan en un viaje para conocerse.',
        },
        {
          icon: Heart,
          title: 'Encontrar el amor',
          text: 'Si alguien te llama la atención, escríbele por privado. Muchas relaciones empiezan con una conversación, aunque los separen unos cuantos kilómetros.',
        },
      ],
    },
    local: {
      title: 'De todas las regiones de Colombia',
      text: 'Colombia se habla con muchos acentos y en la sala caben todos: el "parce" paisa, el "ajá" y el "mi llave" de la costa, el "ve" de Cali y el "sumercé" del altiplano cundiboyacense.',
      groups: [
        {
          title: 'Regiones',
          items: ['Región Andina', 'Costa Caribe', 'Pacífico', 'Eje Cafetero', 'Santanderes', 'Llanos Orientales', 'Amazonía'],
        },
        {
          title: 'Ciudades',
          items: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Pereira', 'Manizales', 'Cúcuta', 'Santa Marta', 'Ibagué', 'Villavicencio', 'Pasto'],
        },
      ],
      note: '¿Eres colombiano y vives en España, Estados Unidos, Chile o cualquier otro país? La sala también es para ti: un pedacito de Colombia para hablar con tu gente aunque estés lejos.',
    },
    safety: MEET_SAFELY,
    faq: [
      {
        q: '¿Hay un chat de Colombia gratis y sin registro?',
        a: 'Sí. En la sala de Colombia de Chatnopolis entras con solo un apodo: no te pedimos correo, contraseña ni teléfono, y no cuesta nada. Si quieres, después puedes crear una cuenta gratis para conservar tu nombre.',
      },
      {
        q: '¿Puedo chatear con colombianos si vivo fuera del país?',
        a: `Sí. La sala está abierta a cualquier persona mayor de ${LEGAL.edadMinima} años, estés donde estés. Es una buena forma de hablar con gente de tu tierra aunque vivas lejos.`,
      },
      {
        q: '¿Puedo hablar con gente de Bogotá, Cali, Barranquilla u otras ciudades?',
        a: 'Sí. La sala es para todo el país, así que puedes entrar desde cualquier ciudad y hablar con quien esté conectado. Si buscas gente de Medellín y el Valle de Aburrá, también está la sala de Medellín.',
      },
      {
        q: '¿Sirve para encontrar pareja en Colombia?',
        a: 'Puede ser un buen comienzo. Mucha gente entra a conocer personas y, si hay química, sigue la conversación por privado. Tómate tu tiempo, conoce bien a la otra persona antes de verse y cuida tus datos personales.',
      },
      ...commonFaq('Colombia'),
    ],
    cta: {
      title: '¿Con ganas de hablar con todo el país?',
      text: 'Elige tu apodo y entra al chat de Colombia en menos de un minuto.',
    },
  },
];

export const roomPageFor = (roomId) => ROOM_PAGES.find((page) => page.roomId === roomId);
