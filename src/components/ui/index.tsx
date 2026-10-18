import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Menu, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { asset } from '@/lib/asset';
import { DEMO_FILM } from '@/components/demo/media';
import { openDemoFullscreen } from '@/lib/demo-fullscreen';
import { Link, NavLink } from 'react-router';

/** Claymorphism UI primitives (styled Radix + Tailwind). */

export type BtnVariant = 'primary' | 'secondary' | 'peach' | 'white' | 'sun' | 'grape' | 'danger';

const VARIANT: Record<BtnVariant, string> = {
  primary: 'bg-cta text-white hover:bg-cta-deep',
  secondary: 'bg-sky hover:bg-sky-deep',
  peach: 'bg-peach hover:bg-peach-deep',
  white: 'bg-white hover:bg-cream',
  sun: 'bg-sun hover:brightness-95',
  grape: 'bg-grape text-white hover:brightness-95',
  danger: 'bg-coral text-white hover:brightness-95',
};

export function btn(variant: BtnVariant = 'primary', size: 'sm' | 'md' | 'lg' = 'md', extra = '') {
  const sizes = { sm: 'px-3.5 py-1.5 text-sm rounded-xl', md: 'px-6 py-3 text-base', lg: 'px-8 py-4 text-lg' };
  return `btn-clay ${VARIANT[variant]} ${sizes[size]} ${extra}`;
}

export function Logo({ size = 40, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img src={asset('/favicon.svg')} width={size} height={size} alt="" className="drop-shadow-[2px_2px_0_rgba(45,55,72,0.25)]" />
      {withText && (
        <span className="font-display text-xl font-bold tracking-tight text-ink">
          Object<span className="text-cta">Talk</span>
        </span>
      )}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Tip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Tooltip.Root delayDuration={200}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={8} className="z-[100] max-w-xs rounded-xl border-2 border-ink bg-white px-3 py-1.5 text-sm font-semibold text-ink shadow-[3px_3px_0_#2d3748]">
          {label}
          <Tooltip.Arrow className="fill-ink" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/30 backdrop-blur-[2px]" />
        <Dialog.Content
          className={`clay-card fixed top-1/2 left-1/2 z-[90] max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 animate-pop overflow-y-auto p-6 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-display text-2xl font-bold">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-muted">{description}</Dialog.Description>}
            </div>
            <Dialog.Close className={btn('white', 'sm', '!px-2')} aria-label="Close">
              <X size={18} strokeWidth={3} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Bar({ value, color = 'bg-cta', className = '' }: { value: number; color?: string; className?: string }) {
  return (
    <div className={`h-3.5 overflow-hidden rounded-full border-2 border-ink bg-line ${className}`}>
      <div className={`h-full rounded-full ${color} transition-[width] duration-700`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function RoleBadge({ role, className = '', compact = false }: { role: 'guide' | 'builder'; className?: string; compact?: boolean }) {
  return (
    <span className={`clay-chip ${role === 'guide' ? 'bg-peach' : 'bg-sky'} ${className}`} aria-label={role === 'guide' ? 'Guide' : 'Builder'}>
      {role === 'guide' ? '🧭' : '🛠️'} <span className={compact ? 'hidden sm:inline' : ''}>{role === 'guide' ? 'Guide' : 'Builder'}</span>
    </span>
  );
}

const LINKS = [
  { to: '/#how', label: 'How it works' },
  { to: '/#missions', label: 'Missions' },
  { to: '/studio', label: 'Object Studio' },
  { to: '/progress', label: 'My progress' },
  { to: '/settings', label: 'Settings' },
  { to: '/demo', label: 'Demo' },
  { to: '/pitch', label: 'Pitch' },
];

/** GitHub Pages build: the game runs in this tab, so say what needs the full server. */
export function StaticNotice() {
  if (!import.meta.env.VITE_STATIC) return null;
  return (
    <div className="mx-auto mb-2 max-w-6xl rounded-2xl border-2 border-ink bg-sun px-3 py-1 text-center text-xs font-bold text-ink shadow-[2px_2px_0_#2d3748]">
      Browser demo on GitHub Pages: play with the AI partner, watch the demo film or view the pitch. Friend mode across devices, the LLM agent and live Rodin
      generation need the full server (<code className="rounded bg-white/70 px-1">npm start</code>).
    </div>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="fixed top-3 right-3 left-3 z-50 sm:top-4 sm:right-4 sm:left-4">
      <StaticNotice />
      <div className="clay-card mx-auto max-w-6xl px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="ObjectTalk home">
            <Logo />
          </Link>
          <div className="hidden items-center gap-6 xl:flex">
            {LINKS.map((l) =>
              l.to.startsWith('/#') ? (
                <a key={l.to} href={asset(l.to)} className="text-sm font-bold text-muted transition-colors hover:text-ink">
                  {l.label}
                </a>
              ) : (
                <NavLink key={l.to} to={l.to} onClick={l.to === '/demo' ? openDemoFullscreen : undefined} className={({ isActive }) => `text-sm font-bold transition-colors hover:text-ink ${isActive ? 'text-ink' : 'text-muted'}`}>
                  {l.label}
                </NavLink>
              ),
            )}
          </div>
          <div className="hidden items-center gap-3 xl:flex">
            <Link to="/play?join=1" className="px-3 py-2 text-sm font-bold text-ink hover:text-cta">
              Join a room
            </Link>
            <Link to="/play" className={btn('primary', 'sm')}>
              Play now
            </Link>
          </div>
          <button className={btn('secondary', 'sm', 'xl:hidden !px-2')} aria-label="Toggle menu" onClick={() => setOpen((o) => !o)}>
            {open ? <X size={20} strokeWidth={3} /> : <Menu size={20} strokeWidth={3} />}
          </button>
        </div>
        {open && (
          <div className="mt-3 flex flex-col gap-2 border-t-2 border-line pt-3 xl:hidden">
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} onClick={(e) => { setOpen(false); if (l.to === '/demo') openDemoFullscreen(e); }} className="rounded-xl px-2 py-2 font-bold text-ink hover:bg-cream">
                {l.label}
              </Link>
            ))}
            <Link to="/play" className={btn('primary', 'md', 'mt-1')}>
              Play now
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="border-t-[3px] border-ink bg-white px-4 py-10">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-muted">
            Say it clearly, so your teammate can win. A two-player 3D English game built in 48 hours for ShanghaiTech Techathon 2026.
          </p>
        </div>
        <div>
          <h4 className="mb-3 font-bold">Play</h4>
          <ul className="space-y-2 text-muted">
            <li>
              <Link to="/play" className="hover:text-ink">
                Start a room
              </Link>
            </li>
            <li>
              <Link to="/demo" className="hover:text-ink">
                Watch demo
              </Link>
            </li>
            <li>
              <Link to="/pitch" className="hover:text-ink">Pitch presentation</Link>
            </li>
            <li>
              <a href={asset(DEMO_FILM)} download className="hover:text-ink">Download demo film</a>
            </li>
            <li>
              <Link to="/progress" className="hover:text-ink">
                My progress
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-bold">Build</h4>
          <ul className="space-y-2 text-muted">
            <li>
              <Link to="/studio" className="hover:text-ink">
                Object Studio (Rodin)
              </Link>
            </li>
            <li><a href="https://github.com/ZhangJiayan44/objecttalk" className="hover:text-ink">Source on GitHub</a></li>
            <li>
              <a href="https://hyper3d.ai" className="hover:text-ink">
                3D by Hyper3D Rodin
              </a>
            </li>
          </ul>
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-6xl text-sm text-muted">© 2026 ObjectTalk team. MIT License. · 3D items generated with Hyper3D Rodin Gen-2.5 · Reference art: Microsoft Fluent Emoji</p>
    </footer>
  );
}
