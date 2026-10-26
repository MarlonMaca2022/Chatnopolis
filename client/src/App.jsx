import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AuthPage from './pages/AuthPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import AgeGate from './components/AgeGate.jsx';
import { getSession } from './lib/session';
import { PUBLIC_ROUTES } from './publicRoutes.jsx';
import { usePageTitle } from './lib/seo';

function RequireSession({ children }) {
  return getSession() ? children : <Navigate to="/entrar" replace />;
}

export default function App() {
  // Título de la pestaña al navegar sin recargar (el servidor ya lo pone al cargar)
  usePageTitle(useLocation().pathname);

  return (
    <Routes>
      {/* Homepage y legales: públicas, sin el aviso de edad (no tienen nada
          explícito) y prerenderizadas en el servidor. Ver publicRoutes.jsx. */}
      {PUBLIC_ROUTES.map((r) => (
        <Route key={r.path} path={r.path} element={r.element} />
      ))}
      {/* El aviso de edad guarda la entrada, no el chat: a /chat solo se llega desde acá. */}
      <Route
        path="/entrar"
        element={
          <AgeGate>
            <AuthPage />
          </AgeGate>
        }
      />
      <Route
        path="/chat"
        element={
          <RequireSession>
            <ChatPage />
          </RequireSession>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
