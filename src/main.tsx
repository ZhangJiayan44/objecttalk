import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import './styles/index.css';
import * as Tooltip from '@radix-ui/react-tooltip';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Toaster } from 'sonner';
import RouteError from './components/RouteError';
import { installModuleRecovery } from './lib/module-recovery';

installModuleRecovery();

const Landing = lazy(() => import('./pages/Landing'));
const Play = lazy(() => import('./pages/Play'));
const RoomPage = lazy(() => import('./pages/Room'));
const JoinPage = lazy(() => import('./pages/Join'));
const Watch = lazy(() => import('./pages/Watch'));
const Demo = lazy(() => import('./pages/Demo'));
const Pitch = lazy(() => import('./pages/Pitch'));
const ReplayPage = lazy(() => import('./pages/Replay'));
const Studio = lazy(() => import('./pages/Studio'));
const Progress = lazy(() => import('./pages/Progress'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));
const DevModels = import.meta.env.DEV ? lazy(() => import('./pages/DevModels')) : null;

function PageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="clay-chip animate-pulse bg-white font-display text-lg">Loading…</div>
    </div>
  );
}

const page = (el: React.ReactNode) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;

const router = createBrowserRouter([{ errorElement: <RouteError />, children: [
  { path: '/', element: page(<Landing />) },
  { path: '/play', element: page(<Play />) },
  { path: '/room/:code', element: page(<RoomPage />) },
  { path: '/join/:code', element: page(<JoinPage />) },
  { path: '/watch/:code', element: page(<Watch />) },
  { path: '/demo', element: page(<Demo />) },
  { path: '/pitch', element: page(<Pitch />) },
  { path: '/replay/:id', element: page(<ReplayPage />) },
  { path: '/studio', element: page(<Studio />) },
  { path: '/progress', element: page(<Progress />) },
  { path: '/settings', element: page(<Settings />) },
  ...(DevModels ? [{ path: '/dev/models', element: page(<DevModels />) }] : []),
  { path: '*', element: page(<NotFound />) },
]}], { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Tooltip.Provider>
      <RouterProvider router={router} />
      <Toaster position="top-center" toastOptions={{ className: '!rounded-2xl !border-[3px] !border-ink !font-bold !shadow-[4px_4px_0_#2d3748]' }} />
    </Tooltip.Provider>
  </StrictMode>,
);
