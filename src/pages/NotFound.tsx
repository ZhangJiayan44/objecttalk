import { Link } from 'react-router';
import { btn, Navbar } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-cream">
      <Navbar />
      <div className="mx-auto max-w-md px-4 pt-40 text-center">
        <div className="clay-card p-8">
          <div className="text-6xl">🧭</div>
          <h1 className="mt-3 text-3xl font-bold">Lost? Ask your guide!</h1>
          <p className="mt-2 text-muted">This page doesn’t exist. It’s not on your left, and not on mine either.</p>
          <Link to="/" className={btn('primary', 'md', 'mt-6')}>
            Take me home
          </Link>
        </div>
      </div>
    </div>
  );
}
