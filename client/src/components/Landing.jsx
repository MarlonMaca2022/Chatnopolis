import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Hash, LogIn, Mail, ShieldCheck } from 'lucide-react';
import { LEGAL } from '../lib/legal';
import { HERO, SAFETY, STEPS } from '../lib/home';
import ThemeToggle from './ThemeToggle.jsx';
import Ghost from './Ghost.jsx';
import { LogoMark, LogoWord } from './Logo.jsx';

// Piezas de las páginas públicas de presentación: la homepage (HomePage) y las
// páginas de sala (RoomPage). Mismo look en todas; lo que cambia llega por props.

// Colores decorativos, cada uno con su variante oscura (mismo patrón que los
// colores de estado del resto de la app). Clases completas y literales: Tailwind
// solo genera las que encuentra escritas.
export const TONES = {
  teal: { chip: 'bg-accent-soft text-accent-ink', bar: 'bg-accent', text: 'from-accent to-violet-500 dark:to-violet-400' },
  amber: {
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
    bar: 'bg-amber-400',
    text: 'from-amber-500 to-rose-500 dark:from-amber-300 dark:to-rose-400',
  },
  violet: {
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300',
    bar: 'bg-violet-500',
    text: 'from-violet-500 to-rose-500 dark:from-violet-400 dark:to-rose-400',
  },
  rose: {
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
    bar: 'bg-rose-500',
    text: 'from-rose-500 to-amber-500 dark:from-rose-400 dark:to-amber-300',
  },
  emerald: {
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    text: 'from-emerald-600 to-accent dark:from-emerald-400 dark:to-accent',
  },
  sky: {
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
    bar: 'bg-sky-500',
    text: 'from-sky-500 to-violet-500 dark:from-sky-400 dark:to-violet-400',
  },
};
const TONE_CYCLE = ['teal', 'violet', 'rose', 'amber', 'sky', 'emerald'];
export const toneAt = (i) => TONES[TONE_CYCLE[i % TONE_CYCLE.length]];

export const primaryButton =
  'inline-flex items-center justify-center gap-2 py-3 px-6 bg-accent hover:bg-accent-strong text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition duration-200';
export const secondaryButton =
  'inline-flex items-center justify-center gap-2 py-3 px-6 rounded-lg border border-edge bg-panel text-ink-soft hover:text-accent hover:border-accent transition-colors';

export const entryFor = (roomId) => `/entrar?sala=${encodeURIComponent(roomId)}`;

export function Header() {
  return (
    <header className="sticky top-0 z-30 bg-panel/90 backdrop-blur border-b border-edge">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 text-accent-ink" aria-label="Chatnopolis, inicio">
          <LogoMark className="h-8 w-auto" />
          <LogoWord className="hidden sm:block h-4 w-auto" />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            to="/entrar"
            className="inline-flex items-center gap-1.5 py-2 px-4 rounded-lg bg-accent hover:bg-accent-strong text-white text-sm font-semibold transition-colors"
          >
            Entrar <LogIn size={16} />
          </Link>
        </div>
      </div>
    </header>
  );
}

// Manchas de color difuminadas detrás de la portada. Solo decorativas. La máscara
// las desvanece hacia abajo para que no terminen en un corte recto.
export function Blobs() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
    >
      <div className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-accent/25 dark:bg-accent/15 blur-3xl" />
      <div className="absolute top-10 right-[-6rem] w-[24rem] h-[24rem] rounded-full bg-rose-300/35 dark:bg-rose-500/10 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 w-[22rem] h-[22rem] rounded-full bg-amber-200/45 dark:bg-amber-400/10 blur-3xl" />
    </div>
  );
}

// Gratis · Sin registro · Solo +18
export function HeroBadges() {
  const badges = [
    { label: 'Gratis', tone: TONES.teal },
    { label: 'Sin registro', tone: TONES.violet },
    { label: `Solo +${LEGAL.edadMinima}`, tone: TONES.rose },
  ];
  return (
    <ul className="flex flex-wrap gap-2 text-xs font-semibold">
      {badges.map(({ label, tone }) => (
        <li key={label} className={`px-3 py-1 rounded-full ${tone.chip}`}>
          {label}
        </li>
      ))}
    </ul>
  );
}

// Dibujada con las mismas clases que MessageList para que se vea como el chat real.
// aria-hidden: la conversación es inventada, no es contenido de la página.
// `sample`: { room, messages: [{ user, text, time, me? }] }
export function ChatPreview({ sample, greeting = '¡Hola! 👋' }) {
  return (
    <div aria-hidden="true" className="relative w-full max-w-md mx-auto lg:ml-auto select-none">
      {/* El fantasmita se asoma por detrás de la ventana, con un globito */}
      <div className="absolute -top-[5.5rem] right-8 z-0 ghost-float">
        <Ghost className="w-24 h-auto drop-shadow-lg" />
      </div>
      <div className="absolute -top-20 right-32 z-20 px-3 py-1.5 rounded-xl rounded-br-none bg-panel border border-edge shadow-md text-sm font-semibold text-accent-ink whitespace-nowrap">
        {greeting}
      </div>

      <div className="relative z-10 rounded-2xl border border-edge bg-panel shadow-2xl shadow-accent/10 overflow-hidden">
        <div className="flex items-center justify-between px-4 h-12 border-b border-edge">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <Hash size={16} className="text-accent" /> {sample.room}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-ink-faint">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> en línea
          </span>
        </div>
        <div className="bg-app p-4 space-y-4">
          {sample.messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.me ? 'flex-row-reverse' : ''}`}>
              <div
                className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${
                  m.me
                    ? 'bg-accent-soft text-accent-ink'
                    : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300'
                }`}
              >
                {m.user.charAt(0)}
              </div>
              <div className={`flex flex-col gap-1 max-w-[75%] ${m.me ? 'items-end' : ''}`}>
                <div className={`flex items-baseline gap-2 ${m.me ? 'flex-row-reverse' : ''}`}>
                  <span className={`text-sm font-semibold ${m.me ? 'text-accent-ink' : 'text-ink'}`}>{m.user}</span>
                  <span className="text-xs text-ink-faint">{m.time}</span>
                </div>
                <div
                  className={`p-3 rounded-2xl shadow-sm text-sm leading-relaxed ${
                    m.me ? 'bg-accent text-white rounded-tr-none' : 'bg-surface text-ink border border-edge rounded-tl-none'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-edge">
          <div className="px-4 py-2.5 rounded-full bg-muted text-sm text-ink-faint">Escribe un mensaje…</div>
        </div>
      </div>
    </div>
  );
}

export function SectionTitle({ title, subtitle }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl sm:text-3xl font-bold text-ink">{title}</h2>
      {subtitle && <p className="mt-2 text-ink-soft">{subtitle}</p>}
    </div>
  );
}

const STEP_TONES = ['bg-accent', 'bg-violet-500', 'bg-rose-500'];

export function StepsSection() {
  return (
    <section className="bg-gradient-to-br from-accent-soft via-panel to-panel border-y border-edge">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <SectionTitle title="Cómo funciona" />
        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4 p-5 rounded-2xl bg-surface/70 border border-edge">
              <span
                className={`w-10 h-10 shrink-0 rounded-full ${STEP_TONES[i % STEP_TONES.length]} text-white font-bold flex items-center justify-center shadow-md`}
              >
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold text-ink">{step.title}</h3>
                <p className="mt-1 text-sm text-ink-soft leading-relaxed">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// `extra`: un párrafo más, propio de la página (p. ej. consejos para verse en persona)
export function SafetySection({ extra }) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
      <div className="flex flex-col sm:flex-row gap-5 p-6 sm:p-8 rounded-2xl bg-accent-soft border border-accent/20">
        <span className="flex items-center justify-center w-12 h-12 shrink-0 rounded-xl bg-accent text-white">
          <ShieldCheck size={26} />
        </span>
        <div>
          <h2 className="text-xl font-bold text-accent-ink">{SAFETY.title}</h2>
          <p className="mt-2 text-ink-soft leading-relaxed">{SAFETY.text}</p>
          {extra && <p className="mt-2 text-ink-soft leading-relaxed">{extra}</p>}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
            <Link to="/seguridad" className="text-accent-ink hover:underline">
              Consejos de seguridad
            </Link>
            <a href={`mailto:${LEGAL.contacto}`} className="inline-flex items-center gap-1.5 text-accent-ink hover:underline">
              <Mail size={15} /> {LEGAL.contacto}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// <details> nativo: se abre sin JS y el texto de las respuestas está en la página
// aunque esté cerrado, que es lo que lee Google.
export function FaqSection({ items, title = 'Preguntas frecuentes' }) {
  return (
    <section id="preguntas" className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 scroll-mt-20">
      <SectionTitle title={title} />
      <div className="mt-6 divide-y divide-edge rounded-2xl border border-edge bg-surface">
        {items.map(({ q, a }) => (
          <details key={q} className="group px-5">
            <summary className="flex items-center justify-between gap-4 py-4 cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronDown size={18} className="shrink-0 text-accent transition-transform group-open:rotate-180" />
            </summary>
            <p className="pb-4 -mt-1 text-ink-soft leading-relaxed">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function FinalCta({
  title = '¿Con ganas de conversar?',
  text = 'Hay una sala esperándote. Entras en menos de un minuto.',
  to = '/entrar',
  cta = HERO.cta,
}) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
      {/* En oscuro el acento es más claro y el blanco encima no contrasta: la franja
          pasa a accent-soft y el botón a acento lleno, como el resto de la app. */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent to-accent-strong dark:from-accent-soft dark:to-panel dark:border dark:border-edge px-6 py-12 sm:px-12">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-rose-300/30 dark:bg-rose-500/10 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row items-center gap-8 text-center sm:text-left">
          <div className="flex-1">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">{title}</h2>
            <p className="mt-2 text-white/85">{text}</p>
            <Link
              to={to}
              className="mt-6 inline-flex items-center gap-2 py-3 px-6 rounded-lg bg-white text-accent-ink dark:bg-accent dark:text-white font-semibold shadow-md hover:shadow-lg transition"
            >
              {cta} <ArrowRight size={18} />
            </Link>
          </div>
          <div className="ghost-float">
            <Ghost className="w-28 sm:w-36 h-auto drop-shadow-xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
