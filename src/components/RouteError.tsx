import { useRouteError } from 'react-router';
import { isModuleLoadError } from '@/lib/module-recovery';

export default function RouteError() {
  const loading = isModuleLoadError(useRouteError());
  return (
    <main className="flex min-h-dvh items-center justify-center bg-cream px-4">
      <div className="clay-card max-w-lg bg-white p-8 text-center" role="alert">
        <div className="text-5xl" aria-hidden="true">{loading ? '🔄' : '🧩'}</div>
        <h1 className="mt-4 font-display text-3xl font-bold">{loading ? "Let's refresh this page" : 'Something went wrong'}</h1>
        <p className="mt-3 text-muted">
          {loading ? 'The app may have been updated, or your connection was interrupted. Refresh to try again.' : 'Please refresh and try again.'}
          {' '}Your saved progress stays in this browser.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button className="rounded-2xl border-[3px] border-ink bg-cta px-5 py-3 font-bold text-white shadow-[3px_3px_0_#2d3748]" onClick={() => window.location.reload()}>Refresh page</button>
          <a className="rounded-2xl border-[3px] border-ink bg-white px-5 py-3 font-bold" href={import.meta.env.BASE_URL}>Back home</a>
        </div>
      </div>
    </main>
  );
}
