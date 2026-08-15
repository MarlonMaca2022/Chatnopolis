import { Navigate, Route, Routes } from 'react-router-dom';
import AuthPage from './pages/AuthPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import LegalPage from './pages/LegalPage.jsx';
import AgeGate from './components/AgeGate.jsx';
import { getSession } from './lib/session';
import { LEGAL_PAGES } from './lib/legal';

function RequireSession({ children }) {
  return getSession() ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* El aviso de edad guarda la entrada, no el chat: a /chat solo se llega desde acá. */}
      <Route
        path="/"
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
      {/* Públicas a propósito: tienen que poder leerse sin entrar al chat. */}
      <Route path="/terminos" element={<LegalPage page={LEGAL_PAGES.terminos} />} />
      <Route path="/privacidad" element={<LegalPage page={LEGAL_PAGES.privacidad} />} />
      <Route path="/seguridad" element={<LegalPage page={LEGAL_PAGES.seguridad} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
