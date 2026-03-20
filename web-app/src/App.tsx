import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';

const HomePage = lazy(() => import('./pages/HomePage'));
const ProjectPage = lazy(() => import('./pages/ProjectPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function LoadingFallback() {
  return (
    <div className="h-screen bg-[#FAF9F6] flex items-center justify-center text-[#6B6960] text-sm">
      Loading...
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Full-screen IDE -- no sidebar */}
      <Route path="/project/:sessionId" element={
        <Suspense fallback={<LoadingFallback />}><ProjectPage /></Suspense>
      } />

      {/* Platform shell -- sidebar navigation */}
      <Route element={<AppShell />}>
        <Route path="/" element={<Suspense fallback={<LoadingFallback />}><HomePage /></Suspense>} />
        <Route path="/projects" element={<Suspense fallback={<LoadingFallback />}><ProjectsPage /></Suspense>} />
        <Route path="/templates" element={<Suspense fallback={<LoadingFallback />}><TemplatesPage /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<LoadingFallback />}><SettingsPage /></Suspense>} />
      </Route>
    </Routes>
  );
}
