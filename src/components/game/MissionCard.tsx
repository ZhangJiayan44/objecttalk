import { Check, ChevronDown } from 'lucide-react';
import { trayStatus } from '@shared/cafe';
import { getKind } from '@shared/catalog';
import { PLACE_DEFS, type PlaceKind } from '@shared/city';
import { levelOf } from '@shared/levels';
import type { ClientRoomState, Pose } from '@shared/protocol';
import { COLOR_HEX, type ColorName, type SizeName } from '@shared/types';
import { asset } from '@/lib/asset';
import { Kbd } from '@/components/ui';

/** The top-left mission card, one layout per kind of level. E hides / shows it. */

function Shell({ title, chip, onClose, children }: { title: string; chip: string; onClose(): void; children: React.ReactNode }) {
  return (
    <div className="clay-card w-full max-w-sm animate-pop bg-white/95 p-4 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`clay-chip !py-0.5 ${chip}`}>{title}</span>
        <button onClick={onClose} className="rounded-lg px-1 text-xs font-bold text-muted hover:text-ink" aria-label="Hide mission card">
          <span className="hidden sm:inline">
            <Kbd>E</Kbd>{' '}
          </span>
          hide ✕
        </button>
      </div>
      {children}
    </div>
  );
}

function MissionTips({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <details className="group mt-3 rounded-xl border border-line bg-sky/20 text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 font-bold text-ink [&::-webkit-details-marker]:hidden">
        Tips <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
      </summary>
      <p className="px-3 pb-3 leading-relaxed text-muted">{text}</p>
    </details>
  );
}

function TaskPicture({ kindId, size = 'regular', color }: { kindId: string; size?: SizeName; color?: ColorName }) {
  const kind = getKind(kindId);
  return (
    <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-white">
      <div className="flex h-16 w-16 items-center justify-center" style={{ transform: `scale(${size === 'small' ? 0.72 : size === 'big' ? 1.1 : 0.9})` }}>
        {kind?.ref ? <img src={asset(kind.ref)} alt="Target object" className="h-full w-full object-contain" /> : <span role="img" aria-label="Target object" className="text-5xl">{kind?.emoji ?? '📦'}</span>}
      </div>
      {kind?.colorVariants && color && <span aria-label="Target colour" className="absolute right-1 bottom-1 h-4 w-4 rounded-full border-2 border-ink" style={{ backgroundColor: COLOR_HEX[color] }} />}
    </div>
  );
}

/** Two silhouettes show the requested relative size without supplying the spoken adjective. */
function SizeCue({ size }: { size?: SizeName | null }) {
  if (!size || size === 'regular') return null;
  return (
    <svg viewBox="0 0 68 38" role="img" aria-label={size === 'small' ? 'Small size' : 'Large size'} className="h-10 w-16 shrink-0">
      <rect x="5" y="16" width="20" height="17" rx="4" fill={size === 'small' ? '#ffd166' : 'none'} stroke={size === 'small' ? '#2d3748' : '#a5aab3'} strokeWidth="2" />
      <rect x="36" y="5" width="27" height="28" rx="5" fill={size === 'big' ? '#ffd166' : 'none'} stroke={size === 'big' ? '#2d3748' : '#a5aab3'} strokeWidth="2" />
    </svg>
  );
}

export function MissionCard({ st, view, onClose }: { st: ClientRoomState; pose: Pose | null; view: 'guide' | 'builder'; onClose(): void }) {
  const m = st.mission;
  if (!m) return null;
  const level = levelOf(st.settings.level);
  const isGuide = view === 'guide';
  const copy = level.roles[view];

  if (m.type === 'find' || m.type === 'place') {
    const secretId = m.targetId ?? m.itemId;
    const obj = secretId ? st.scene?.objects.find((o) => o.id === secretId) : undefined;
    return (
      <Shell title={`${m.type === 'find' ? '🔎 Find it' : '📦 Place it'} · ${m.index + 1}`} chip={m.type === 'find' ? 'bg-sun' : 'bg-lavender'} onClose={onClose}>
        <p className="text-sm font-semibold">{m.brief}</p>
        {isGuide && obj && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-dashed border-ink bg-cream p-2">
            <TaskPicture kindId={obj.kind} size={obj.size} color={obj.color} />
            <div className="text-sm">
              <SizeCue size={obj.size} />
              <div className="text-muted">{m.type === 'find' ? 'Gold ring = the one to pick.' : 'Purple ring = move this. Ghost = where it goes.'}</div>
            </div>
          </div>
        )}
        {isGuide && <MissionTips key={m.id} text={m.hint} />}
        {!isGuide && (
          <ul className="mt-3 space-y-1 text-sm text-muted">
            <li>• Your guide stands on the other side: their left is your right!</li>
            <li>• Not sure? Ask before you click: “Which one?”</li>
            <li>• Point the centre dot at an object and click. {m.type === 'place' ? 'Click the object, then a spot.' : ''}</li>
          </ul>
        )}
      </Shell>
    );
  }

  if (m.type === 'order') {
    const world = st.world?.kind === 'cafe' ? st.world : null;
    const tray = world && st.scene ? world.tray.map((id) => st.scene!.objects.find((o) => o.id === id)).filter((o) => !!o) : [];
    const status = isGuide && m.order && world && st.scene ? trayStatus({ scene: st.scene, tray: world.tray }, m.order) : null;
    return (
      <Shell title={`${isGuide ? '🧾 Your order' : '☕ New customer'} · ${m.index + 1}`} chip="bg-sun" onClose={onClose}>
        <p className="text-sm font-semibold">{m.brief}</p>
        {isGuide && m.order && (
          <ul className="mt-3 space-y-2 rounded-2xl border-2 border-dashed border-ink bg-cream p-2">
            {m.order.map((l, i) => {
              const missing = status?.missing.find((x) => x.kind === l.kind && x.size === l.size);
              const ready = !!status && !missing;
              return (
                <li key={`${l.kind}${l.size}`} aria-label={`Order item ${i + 1}`} className={`flex items-center gap-3 rounded-xl p-1 ${ready ? 'bg-mint/40' : ''}`}>
                  <TaskPicture kindId={l.kind} size={l.size ?? 'regular'} />
                  <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-1">
                    <span className="font-display text-2xl font-semibold" aria-label={`Quantity: ${l.qty}`}>× {l.qty}</span>
                    <SizeCue size={l.size} />
                  </div>
                  {ready && <Check size={20} className="shrink-0 text-cta-deep" aria-label="Ready" />}
                </li>
              );
            })}
          </ul>
        )}
        {!isGuide && (
          <div className="mt-3 rounded-2xl border-2 border-dashed border-ink bg-cream p-3 text-sm">
            <div className="font-display font-semibold">On your tray</div>
            {tray.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {tray.map((o) => (
                  <span key={o!.id} className="rounded-full border-2 border-ink bg-white px-2 py-0.5 text-xs font-bold">
                    {getKind(o!.kind)?.emoji} {o!.size === 'small' ? 'small ' : o!.size === 'big' ? 'large ' : ''}
                    {getKind(o!.kind)?.name}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-muted">Nothing yet. Click food in the case to add it.</div>
            )}
            <div className="mt-2 text-muted">
              Ring the bell <Kbd>F</Kbd> to serve. Ask: “Small or large?”, “How many?”, “Anything else?”
            </div>
          </div>
        )}
        {isGuide && <MissionTips key={m.id} text={m.hint} />}
      </Shell>
    );
  }

  if (m.type === 'route') {
    const dest = (m.destination ?? '') as PlaceKind;
    const name = PLACE_DEFS[dest]?.name ?? dest;
    return (
      <Shell title={isGuide ? `🗺️ Guide the way · ${m.index + 1}` : `🗺️ To the ${name}`} chip="bg-sky" onClose={onClose}>
        <p className="text-sm font-semibold">{m.brief}</p>
        {isGuide ? (
          <>
            <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-dashed border-ink bg-cream p-3">
              <span className="text-3xl" aria-hidden="true">⭐</span>
              <p className="text-sm text-muted">Gold marker = destination. Green arrow = your partner’s position and heading.</p>
            </div>
            <MissionTips key={m.id} text={m.hint} />
          </>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-muted">
            <li>
              • <Kbd>W</Kbd>
              <Kbd>A</Kbd>
              <Kbd>S</Kbd>
              <Kbd>D</Kbd> walk, <Kbd>Shift</Kbd> run, move the mouse to look.
            </li>
            <li>• Ask: “Excuse me, how do I get to the {name}?”</li>
            <li>• Lost? Tell them what you see: “I can see the bank.”</li>
          </ul>
        )}
      </Shell>
    );
  }

  // seek
  const world = st.world?.kind === 'bedroom' ? st.world : null;
  const item = isGuide && m.targetId ? world?.items.find((i) => i.id === m.targetId) : undefined;
  return (
    <Shell title={isGuide ? `🔎 Lost & found · ${m.index + 1}` : `🔦 ${m.title}`} chip="bg-lavender" onClose={onClose}>
      <p className="text-sm font-semibold">{m.brief}</p>
      {isGuide && item && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-dashed border-ink bg-cream p-2">
          <TaskPicture kindId={item.kind} />
          <div className="text-sm">
            <div className="text-muted">Gold ring = where you left it.</div>
          </div>
        </div>
      )}
      {isGuide && <MissionTips key={m.id} text={m.hint} />}
      {!isGuide && (
        <ul className="mt-3 space-y-1 text-sm text-muted">
          <li>
            • <Kbd>W</Kbd>
            <Kbd>A</Kbd>
            <Kbd>S</Kbd>
            <Kbd>D</Kbd> walk, mouse to look, click to pick up or open.
          </li>
          <li>• Ask: “What did you lose?” “Is it under the bed?”</li>
          <li>• Things can hide under, inside, on top of and behind!</li>
        </ul>
      )}
      <p className="mt-2 text-xs font-bold text-muted">
        {copy.icon} You are the {copy.name}.
      </p>
    </Shell>
  );
}

export function missionChip(st: ClientRoomState): string {
  const m = st.mission;
  if (!m) return '';
  if (m.type === 'find') return '🔎 Find it';
  if (m.type === 'place') return '📦 Place it';
  if (m.type === 'order') return `☕ Order ${m.index + 1}`;
  if (m.type === 'route') return '🗺️ Route';
  return `🔦 Lost & found ${m.index + 1}`;
}
