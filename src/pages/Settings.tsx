import { Settings2 } from 'lucide-react';
import { Footer, Navbar } from '@/components/ui';
import { SettingsControls } from '@/components/ui/SettingsControls';

export default function Settings() {
  return (
    <div className="min-h-dvh bg-cream">
      <Navbar />
      <main className="mx-auto max-w-xl px-4 pt-28 pb-16">
        <div className="mb-8">
          <span className="clay-chip bg-lavender"><Settings2 size={16} strokeWidth={3} /> Settings</span>
          <h1 className="mt-3 text-4xl font-bold">Game settings</h1>
          <p className="mt-2 text-muted">You can also adjust these during play in Controls → Settings.</p>
        </div>
        <div className="clay-card bg-white p-4 sm:p-6"><SettingsControls /></div>
      </main>
      <Footer />
    </div>
  );
}
