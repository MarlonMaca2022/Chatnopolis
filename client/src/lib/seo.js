import { useEffect } from 'react';
import { LEGAL_PAGES } from './legal';
import { HERO } from './home';

// Título y descripción de cada página. Fuente única: server/seo.js los recibe por
// el build del servidor (entry-server.jsx) y los escribe en el <head> de cada
// respuesta, que es lo que leen Google y las vistas previas de WhatsApp/redes; en
// el navegador, usePageTitle() (lo llama App.jsx con la ruta actual) cambia el
// título de la pestaña al navegar sin recargar.
//
// Lo que NO vive acá a propósito: el noindex y la etiqueta de contenido adulto.
// Esos los decide server/seo.js solo, para que sigan saliendo aunque el build del
// servidor falle.
//
// Títulos de hasta ~60 caracteres y descripciones de hasta ~155: más largo,
// Google lo corta.

export const SITE_NAME = 'Chatnopolis';

const legal = (page) => ({ title: `${page.title} | ${SITE_NAME}`, description: page.tagline });

export const PAGE_META = {
  '/': {
    title: `${HERO.title} | ${SITE_NAME}`,
    description:
      'Elige un apodo, entra a una sala y conversa en tiempo real con gente de habla hispana. Gratis, sin email y sin descargar nada. Solo mayores de 18.',
  },
  '/terminos': legal(LEGAL_PAGES.terminos),
  '/privacidad': legal(LEGAL_PAGES.privacidad),
  '/seguridad': legal(LEGAL_PAGES.seguridad),
  '/entrar': {
    title: `Entrar al chat | ${SITE_NAME}`,
    description: 'Entra como invitado con solo un apodo, o con tu cuenta de Chatnopolis.',
  },
  '/chat': { title: SITE_NAME, description: '' },
};

// Todas las rutas que existen en la app: cualquier otra es un 404 para el servidor
// (el navegador igual redirige a la homepage).
export const APP_PATHS = Object.keys(PAGE_META);

export function usePageTitle(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  useEffect(() => {
    const meta = PAGE_META[path];
    if (meta) document.title = meta.title;
  }, [path]);
}
