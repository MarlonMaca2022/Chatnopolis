import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

const root = document.getElementById('root');
const app = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Las páginas públicas llegan ya renderizadas por el servidor (server/seo.js):
// React se engancha a ese HTML en vez de rehacerlo. El resto llega vacío.
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
