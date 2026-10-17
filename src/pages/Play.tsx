import { ArrowRight, Bot, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { Role } from '@shared/types';
import { btn, Navbar } from '@/components/ui';
import { getName, setName } from '@/lib/profile';
import { getPrimaryClient } from '@/lib/primary';

export default function Play() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [name, setNameState] = useState(getName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const joinFirst = params.get('join') === '1';

  const go = async (fn: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setName(name);
    try {
      const room = await fn();
      navigate(`/room/${room}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const client = getPrimaryClient();
  const createDuo = () => go(() => client.actions.create(name, { settings: { mode: 'duo' }, role: 'guide' }));
  const createAI = (me: Role) => go(() => client.actions.create(name, { settings: { mode: 'ai', aiRole: me === 'guide' ? 'builder' : 'guide' }, role: me }));
  const join = () => code.trim().length === 4 && go(() => client.actions.join(code, name));

  return (
    <div className="min-h-dvh bg-cream">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 pt-28 pb-16">
        <div className="text-center">
          <span className="clay-chip bg-mint">🎮 90-second challenge · no account needed</span>
          <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Who are you playing with?</h1>
        </div>

        <div className="mx-auto mt-8 max-w-md">
          <label className="mb-1 block text-sm font-bold" htmlFor="name">
            Your name
          </label>
          <input id="name" className="input-clay text-center font-display text-xl" value={name} maxLength={24} onChange={(e) => setNameState(e.target.value)} />
        </div>

        <div className={`mt-8 grid gap-6 md:grid-cols-3 ${joinFirst ? 'md:[&>*:last-child]:order-first' : ''}`}>
          <section className="clay-card flex flex-col bg-peach/60 p-6">
            <Users size={36} strokeWidth={2.5} />
            <h2 className="mt-3 text-2xl font-bold">With a friend</h2>
            <p className="mt-1 flex-1 text-sm font-semibold text-ink/80">Create a room, your friend scans the QR code. One guides, one builds. Talk face to face or across the internet.</p>
            <button className={btn('primary', 'md', 'mt-5')} disabled={busy} onClick={createDuo}>
              Create a room <ArrowRight size={18} strokeWidth={3} />
            </button>
          </section>

          <section className="clay-card flex flex-col bg-lavender p-6">
            <Bot size={36} strokeWidth={2.5} />
            <h2 className="mt-3 text-2xl font-bold">With an AI partner</h2>
            <p className="mt-1 flex-1 text-sm font-semibold text-ink/80">Practise alone. Nova guides you, or Pixel builds what you describe and asks when you are unclear.</p>
            <div className="mt-5 grid gap-2">
              <button className={btn('secondary')} disabled={busy} onClick={() => createAI('builder')}>
                🛠️ I build, AI guides
              </button>
              <button className={btn('peach')} disabled={busy} onClick={() => createAI('guide')}>
                🧭 I guide, AI builds
              </button>
            </div>
          </section>

          <section className="clay-card flex flex-col bg-sky/50 p-6">
            <span className="text-4xl">🔑</span>
            <h2 className="mt-3 text-2xl font-bold">Join a room</h2>
            <p className="mt-1 text-sm font-semibold text-ink/80">Got a 4-letter code from your partner?</p>
            <form
              className="mt-auto pt-5"
              onSubmit={(e) => {
                e.preventDefault();
                void join();
              }}
            >
              <input
                className="input-clay text-center font-display text-3xl tracking-[0.4em] uppercase"
                placeholder="ABCD"
                value={code}
                maxLength={4}
                onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())}
                aria-label="Room code"
                autoFocus={joinFirst}
              />
              <button className={btn('primary', 'md', 'mt-3 w-full')} disabled={busy || code.length !== 4}>
                Join
              </button>
            </form>
          </section>
        </div>

        <p className="mt-10 text-center text-sm font-semibold text-muted">
          Presenting on one screen? Watch the <Link to="/demo" className="text-grape underline">demo film</Link>, view the <Link to="/pitch" className="text-grape underline">pitch</Link> or open the <Link to="/studio" className="text-grape underline">Object Studio</Link>.
        </p>
      </main>
    </div>
  );
}
