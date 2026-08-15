import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LEGAL, LEGAL_LINKS } from '../lib/legal';
import ThemeToggle from '../components/ThemeToggle.jsx';

// Renderiza cualquier entrada de LEGAL_PAGES. El contenido vive en lib/legal.js:
// este componente no sabe de qué página se trata.
export default function LegalPage({ page }) {
  // Con muchas secciones el índice ayuda; en las cortas es ruido.
  const showIndex = page.sections.length > 6;

  return (
    <div className="bg-app min-h-screen font-sans text-ink">
      <header className="sticky top-0 z-10 bg-panel border-b border-edge">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-ink-soft hover:text-accent transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Volver al chat</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10">
        <h1 className="text-3xl font-bold text-accent-ink">{page.title}</h1>
        <p className="mt-2 text-ink-soft">{page.tagline}</p>
        <p className="mt-4 text-sm text-ink-faint">
          {LEGAL.nombre} · Última actualización: {LEGAL.actualizado}
        </p>

        {showIndex && (
          <nav className="mt-8 p-4 rounded-xl bg-surface border border-edge">
            <p className="text-sm font-semibold text-ink-soft mb-2">Contenido</p>
            <ol className="space-y-1 text-sm">
              {page.sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-accent hover:underline">
                    {i + 1}. {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className="mt-10 space-y-10">
          {page.sections.map((section) => (
            <Section key={section.id} section={section} />
          ))}
        </div>

        <footer className="mt-14 pt-6 border-t border-edge text-sm text-ink-faint">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {LEGAL_LINKS.filter((l) => l.to !== `/${page.slug}`).map((l) => (
              <Link key={l.to} to={l.to} className="hover:text-accent transition-colors">
                {l.label}
              </Link>
            ))}
            <a href={`mailto:${LEGAL.contacto}`} className="hover:text-accent transition-colors">
              Contacto
            </a>
          </div>
          <p className="mt-3">Solo para mayores de {LEGAL.edadMinima} años.</p>
        </footer>
      </main>
    </div>
  );
}

function Section({ section }) {
  const danger = section.tone === 'danger';

  return (
    <section id={section.id} className="scroll-mt-20">
      <h2
        className={`text-xl font-semibold mb-3 ${
          danger ? 'text-red-700 dark:text-red-300' : 'text-accent-ink'
        }`}
      >
        {section.heading}
      </h2>

      {section.paragraphs?.map((text, i) => (
        <p key={i} className="text-ink-soft leading-relaxed mb-3">
          {text}
        </p>
      ))}

      {section.items && (
        <ul
          className={`mt-4 space-y-3 rounded-xl border p-4 ${
            danger
              ? 'border-red-200 bg-red-50 dark:border-red-400/25 dark:bg-red-400/10'
              : 'border-edge bg-surface'
          }`}
        >
          {section.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {typeof item === 'string' ? (
                <span className="text-ink-soft">{item}</span>
              ) : (
                <>
                  <strong className={danger ? 'text-red-700 dark:text-red-300' : 'text-ink'}>
                    {item.title}.
                  </strong>{' '}
                  <span className="text-ink-soft">{item.text}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
