import HomePage from './pages/HomePage.jsx';
import LegalPage from './pages/LegalPage.jsx';
import RoomPage from './pages/RoomPage.jsx';
import { LEGAL_PAGES } from './lib/legal';
import { ROOM_PAGES } from './lib/roomPages';

// Páginas públicas que el servidor entrega ya renderizadas (server/seo.js): las lee
// Google sin ejecutar JS. App.jsx y entry-server.jsx usan esta misma lista, porque
// para hidratar el navegador tiene que armar exactamente el mismo árbol.
//
// Solo van páginas que no dependen del navegador al renderizar (nada de
// localStorage/sessionStorage fuera de efectos). /entrar no está por eso: el
// AgeGate lee localStorage al montar.
export const PUBLIC_ROUTES = [
  { path: '/', element: <HomePage /> },
  { path: '/terminos', element: <LegalPage page={LEGAL_PAGES.terminos} /> },
  { path: '/privacidad', element: <LegalPage page={LEGAL_PAGES.privacidad} /> },
  { path: '/seguridad', element: <LegalPage page={LEGAL_PAGES.seguridad} /> },
  // Una por sala con página propia (/chat-medellin…), todas con la misma plantilla
  ...ROOM_PAGES.map((page) => ({ path: page.path, element: <RoomPage page={page} /> })),
];
