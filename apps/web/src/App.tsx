import { Route, Routes } from 'react-router-dom';
import { Toaster } from './components/chrome';
import { Home } from './pages/Home';
import { CreateSession } from './pages/CreateSession';
import { HostPage } from './pages/HostPage';
import { ScreenPage } from './pages/ScreenPage';
import { GroupPage } from './pages/GroupPage';
import { Security } from './pages/Security';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/docente" element={<CreateSession />} />
        <Route path="/docente/:code" element={<HostPage />} />
        <Route path="/pantalla/:code" element={<ScreenPage />} />
        <Route path="/unirse" element={<GroupPage />} />
        <Route path="/grupo/:code" element={<GroupPage />} />
        <Route path="/seguridad" element={<Security />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </>
  );
}
