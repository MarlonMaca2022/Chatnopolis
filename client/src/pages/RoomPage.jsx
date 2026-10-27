import { Link } from 'react-router-dom';
import { ArrowRight, MapPin } from 'lucide-react';
import { ROOM_PAGES } from '../lib/roomPages';
import LegalFooter from '../components/LegalFooter.jsx';
import Ghost from '../components/Ghost.jsx';
import {
  Blobs,
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
} from '../components/Landing.jsx';

// Plantilla de las páginas de sala (/chat-medellin, /chat-colombia…). Todas iguales:
// lo que cambia es la entrada de lib/roomPages.js que llega en `page`. Pública y
// prerenderizada como la homepage (publicRoutes.jsx), sin nada explícito: el aviso
// de edad y la casilla 18+ siguen en /entrar, delante del chat.
export default function RoomPage({ page }) {
  const tone = TONES[page.tone] || TONES.teal;
  const entry = entryFor(page.roomId);

  return (
    <div className="bg-app min-h-screen font-sans text-ink">
      <Header />
      <main>
        <Hero page={page} tone={tone} entry={entry} />
        <IntroSection intro={page.intro} />
        <ReasonsSection reasons={page.reasons} tone={tone} />
        <LocalSection local={page.local} tone={tone} />
        <StepsSection />
        <div className="pt-16">
          <SafetySection extra={page.safety} />
        </div>
        <FaqSection items={page.faq} />
        <OtherRooms current={page} />
        <FinalCta title={page.cta.title} text={page.cta.text} to={entry} cta={page.hero.cta} />
      </main>
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pb-10">
        <LegalFooter />
      </footer>
    </div>
  );
}

function Title({ page, tone, className = '' }) {
  const [before, highlight, after] = page.hero.titleParts;
  return (
    <h1 className={`font-bold tracking-tight text-ink ${className}`}>
      {before}
      <span className={`bg-gradient-to-r ${tone.text} bg-clip-text text-transparent`}>{highlight}</span>
      {after}
    </h1>
  );
}

function HeroButtons({ page, entry }) {
  return (
    <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:justify-center">
      <Link to={entry} className={primaryButton}>
        {page.hero.cta} <ArrowRight size={18} />
      </Link>
      <a href="#preguntas" className={secondaryButton}>
        Preguntas frecuentes
      </a>
    </div>
  );
}

// Centrado: el fantasmita grande saludando como se saluda en ese lugar, y abajo una
// franja con los municipios o regiones, para que quien llega desde Google vea de
// entrada que la página es de su zona.
function Hero({ page, tone, entry }) {
  const places = page.local.groups[0].items;
  return (
    <section className="relative overflow-hidden">
      <Blobs />
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-10 sm:pt-16 text-center flex flex-col items-center">
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute -top-6 left-[70%] px-3 py-1.5 rounded-xl rounded-bl-none bg-panel border border-edge shadow-md text-sm font-semibold text-accent-ink whitespace-nowrap"
          >
            {page.hero.greeting}
          </div>
          <div className="ghost-float">
            <Ghost className="w-28 sm:w-32 h-auto drop-shadow-xl" />
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <HeroBadges />
        </div>
        <Title page={page} tone={tone} className="mt-5 text-5xl sm:text-6xl lg:text-7xl" />
        <p className="mt-5 text-lg text-ink-soft max-w-2xl">{page.hero.subtitle}</p>
        <HeroButtons page={page} entry={entry} />
      </div>
      <div className="relative border-y border-edge bg-panel/70">
        <ul className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap justify-center gap-2 text-sm">
          {places.map((place) => (
            <li key={place} className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-medium ${tone.chip}`}>
              <MapPin size={13} /> {place}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function IntroSection({ intro }) {
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <SectionTitle title={intro.title} />
      {intro.paragraphs.map((p) => (
        <p key={p} className="mt-4 text-lg text-ink-soft leading-relaxed">
          {p}
        </p>
      ))}
    </section>
  );
}

const REASON_TONES = [TONES.teal, TONES.violet, TONES.rose];

function ReasonsSection({ reasons }) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
      <SectionTitle title={reasons.title} />
      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {reasons.items.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="relative overflow-hidden p-6 rounded-2xl border border-edge bg-surface">
            <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${REASON_TONES[i].bar}`} />
            <span className={`flex items-center justify-center w-11 h-11 rounded-xl ${REASON_TONES[i].chip}`}>
              <Icon size={22} />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
            <p className="mt-1.5 text-ink-soft leading-relaxed">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LocalSection({ local, tone }) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
      <SectionTitle title={local.title} subtitle={local.text} />
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {local.groups.map((group) => (
          <div key={group.title} className="p-6 rounded-2xl border border-edge bg-surface">
            <h3 className="font-semibold text-ink">{group.title}</h3>
            <ul className="mt-4 flex flex-wrap gap-2 text-sm">
              {group.items.map((item) => (
                <li key={item} className={`px-3 py-1 rounded-full font-medium ${tone.chip}`}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-6 text-ink-soft leading-relaxed max-w-3xl">{local.note}</p>
    </section>
  );
}

// Enlaces a las otras páginas de sala y a la lista completa: además de servirle a
// quien navega, es por donde Google descubre el resto de las páginas.
function OtherRooms({ current }) {
  const others = ROOM_PAGES.filter((p) => p.path !== current.path);
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
      <SectionTitle title="Otras salas de Chatnopolis" />
      <ul className="mt-6 flex flex-wrap gap-3">
        {others.map((p) => (
          <li key={p.path}>
            <Link to={p.path} className={secondaryButton}>
              Chat de {p.name} <ArrowRight size={16} />
            </Link>
          </li>
        ))}
        <li>
          {/* <a> y no <Link>: el router no baja hasta el #ancla al navegar */}
          <a href="/#salas" className={secondaryButton}>
            Ver todas las salas <ArrowRight size={16} />
          </a>
        </li>
      </ul>
    </section>
  );
}
