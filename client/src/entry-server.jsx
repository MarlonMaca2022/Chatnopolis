import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { Route, Routes, StaticRouter } from 'react-router-dom';
import { PUBLIC_ROUTES } from './publicRoutes.jsx';
import { setServerData } from './lib/initialData';

// Entrada del render en el servidor. Se compila aparte (`vite build --ssr`, ver
// package.json) a client/dist-server y la usa server/seo.js. Solo conoce las rutas
// públicas: así no arrastra el chat (socket.io, el selector de emojis) al servidor.

export const PRERENDER_PATHS = PUBLIC_ROUTES.map((r) => r.path);

export function render(url, data = {}) {
  setServerData(data);
  try {
    return renderToString(
      <StrictMode>
        <StaticRouter location={url}>
          <Routes>
            {PUBLIC_ROUTES.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
          </Routes>
        </StaticRouter>
      </StrictMode>
    );
  } finally {
    setServerData(null);
  }
}
