import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clapperboard, Cpu, Flag, Hash, MapPin, MessagesSquare, Music } from 'lucide-react';
import { api } from '../lib/api';
import { initialData } from '../lib/initialData';
import { DEFAULT_ROOMS, FAQ, FEATURES, HERO, SAMPLE_CHAT, roomDescription, roomTitle } from '../lib/home';
import { roomPageFor } from '../lib/roomPages';
import LegalFooter from '../components/LegalFooter.jsx';
import {
  Blobs,
  ChatPreview,
  FaqSection,
  FinalCta,
  Header,
  HeroBadges,
  SafetySection,
  SectionTitle,
  StepsSection,
  TONES,
  entryFor,
  primaryButton,
  secondaryButton,
  toneAt,
} from '../components/Landing.jsx';

// Homepage pública: lo que lee Google y lo que ve quien llega por primera vez. No
// va detrás del aviso de edad (no tiene nada explícito); el aviso y la casilla 18+
// están en /entrar, delante del chat. Los textos viven en lib/home.js y las piezas
// que comparte con las páginas de sala, en components/Landing.jsx.

// Ícono y color de las salas conocidas; las que cree el admin toman # y el color
// que les toque por posición.
const ROOM_STYLES = {
  general: { icon: MessagesSquare, tone: 'teal' },
  colombia: { icon: Flag, tone: 'amber' },
  'medell-n': { icon: MapPin, tone: 'emerald' },
  musica: { icon: Music, tone: 'violet' },
  cine: { icon: Clapperboard, tone: 'rose' },
  tecnologia: { icon: Cpu, tone: 'sky' },
};

// Arranca con las salas con las que el servidor renderizó la página (tiene que ser
// la misma lista para hidratar) y después se pone al día con la API.
function useRooms() {
  const [rooms, setRooms] = useState(() => initialData('rooms') || DEFAULT_ROOMS);
  useEffect(() => {
    api
      .getRooms()
      .then((list) => list.length && setRooms(list))
      .catch(() => {});
  }, []);
  return rooms;
}

export default function HomePage() {
  const rooms = useRooms();

  return (
    <div className="bg-app min-h-screen font-sans text-ink">
      <Header />
      <main>
        <Hero />
        <RoomsSection rooms={rooms} />
        <StepsSection />
        <FeaturesSection />
        <SafetySection />
        <FaqSection items={FAQ} />
        <FinalCta />
      </main>
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pb-10">
        <LegalFooter />
      </footer>
    </div>
  );
}

function Hero() {
  const [before, highlight, after] = HERO.titleParts;

  return (
    <section className="relative overflow-hidden">
      <Blobs />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-12 sm:pt-20 lg:pt-28 sm:pb-16 grid gap-28 lg:gap-12 lg:grid-cols-2 items-center">
        <div>
          <HeroBadges />
          <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-ink">
            {before}
            <span className={`bg-gradient-to-r ${TONES.teal.text} bg-clip-text text-transparent`}>{highlight}</span>
            {after}
          </h1>
          <p className="mt-5 text-lg text-ink-soft max-w-xl">{HERO.subtitle}</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link to="/entrar" className={primaryButton}>
              {HERO.cta} <ArrowRight size={18} />
            </Link>
            <a href="#salas" className={secondaryButton}>
              Ver las salas
            </a>
          </div>
        </div>
        <ChatPreview sample={SAMPLE_CHAT} />
      </div>
    </section>
  );
}

// Una sala con página propia (lib/roomPages.js) lleva a esa página, que es la que
// invita a entrar; las demás, directo a /entrar con la sala elegida.
function RoomCard({ room, index }) {
  const style = ROOM_STYLES[room.id];
  const Icon = style?.icon || Hash;
  const tone = style ? TONES[style.tone] : toneAt(index);
  const page = roomPageFor(room.id);
  return (
    <Link
      to={page ? page.path : entryFor(room.id)}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-edge bg-surface p-5 hover:-translate-y-1 hover:shadow-xl transition duration-200"
    >
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${tone.bar}`} />
      <span className={`flex items-center justify-center w-11 h-11 rounded-xl ${tone.chip}`}>
        <Icon size={22} />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-ink">{roomTitle(room)}</h3>
      <p className="mt-1.5 text-sm text-ink-soft leading-relaxed flex-1">{roomDescription(room)}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent group-hover:gap-2 transition-all">
        {page ? 'Conocer la sala' : 'Entrar a esta sala'} <ArrowRight size={16} />
      </span>
    </Link>
  );
}

function RoomsSection({ rooms }) {
  return (
    <section id="salas" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 scroll-mt-20">
      <SectionTitle title="Salas de chat" subtitle="Elige un tema y entra. Puedes cambiarte de sala cuando quieras." />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room, i) => (
          <RoomCard key={room.id} room={room} index={i} />
        ))}
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
      <SectionTitle title="Todo lo que necesitas para conversar" />
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="flex gap-4 p-5 rounded-2xl border border-edge bg-surface">
            <span className={`flex items-center justify-center w-10 h-10 shrink-0 rounded-xl ${toneAt(i).chip}`}>
              <Icon size={20} />
            </span>
            <div>
              <h3 className="font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-sm text-ink-soft leading-relaxed">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
