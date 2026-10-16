import { useEffect, useState } from 'react';
import { spotById } from '@shared/bedroom';
import { lineText, trayStatus } from '@shared/cafe';
import { getKind } from '@shared/catalog';
import { PLACE_DEFS, planRoute, type PlaceKind } from '@shared/city';
import { levelOf } from '@shared/levels';
import type { ClientRoomState, Pose } from '@shared/protocol';
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

function ModelSentence({ text, id }: { text?: string; id: string }) {
  const [reveal, setReveal] = useState(false);
  useEffect(() => setReveal(false), [id]);
  if (!text) return null;
  return (
    <button onClick={() => setReveal((r) => !r)} className="mt-2 text-left text-sm font-bold text-grape underline decoration-2 underline-offset-2">
      {reveal ? `“${text}”` : 'Stuck? Show a model sentence'}
    </button>
  );
}

export function MissionCard({ st, pose, view, onClose }: { st: ClientRoomState; pose: Pose | null; view: 'guide' | 'builder'; onClose(): void }) {
  const m = st.mission;
  if (!m) return null;
  const level = levelOf(st.settings.level);
  const isGuide = view === 'guide';
  const copy = level.roles[view];

  if (m.type === 'find' || m.type === 'place') {
    const secretId = m.targetId ?? m.itemId;
    const obj = secretId ? st.scene?.objects.find((o) => o.id === secretId) : undefined;
    const kind = obj ? getKind(obj.kind) : undefined;
    return (
      <Shell title={`${m.type === 'find' ? '🔎 Find it' : '📦 Place it'} · ${m.index + 1}`} chip={m.type === 'find' ? 'bg-sun' : 'bg-lavender'} onClose={onClose}>
        <p className="text-sm font-semibold">{m.brief}</p>
        {isGuide && obj && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-dashed border-ink bg-cream p-2">
            {kind?.ref ? <img src={kind.ref} alt="" className="h-12 w-12 object-contain" /> : <span className="text-3xl">{kind?.emoji ?? '☕'}</span>}
            <div className="text-sm">
              <div className="font-display text-base font-semibold">
                Target: {obj.size !== 'regular' ? `${obj.size} ` : ''}
                {kind?.colorVariants ? `${obj.color} ` : ''}
                {kind?.name}
              </div>
              <div className="text-muted">{m.type === 'find' ? 'Gold ring = the one to pick.' : 'Purple ring = move this. Ghost = where it goes.'}</div>
            </div>
          </div>
        )}
        {isGuide && m.hint && <p className="mt-3 rounded-xl bg-sky/40 p-2 text-sm font-semibold">💡 {m.hint}</p>}
        {isGuide && <ModelSentence text={m.modelAnswer} id={m.id} />}
        {!isGuide && (
          <ul className="mt-3 space-y-1 text-sm text-muted">
            <li>• Your guide stands on the other side: their left is your right!</li>
            <li>• Not sure? Ask before you click: “Which one?”</li>
            <li>• Aim with the crosshair and click. {m.type === 'place' ? 'Click the object, then a spot.' : ''}</li>
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
          <ul className="mt-3 space-y-1 rounded-2xl border-2 border-dashed border-ink bg-cream p-3">
            {m.order.map((l) => {
              const k = getKind(l.kind);
              const missing = status?.missing.find((x) => x.kind === l.kind && x.size === l.size);
              return (
                <li key={`${l.kind}${l.size}`} className="flex items-center gap-2 font-display text-base font-semibold">
                  <span className="text-xl">{k?.emoji ?? '🍽️'}</span>
                  <span className={missing ? '' : 'text-cta-deep line-through decoration-2'}>{lineText(l)}</span>
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
        {isGuide && m.hint && <p className="mt-3 rounded-xl bg-sky/40 p-2 text-sm font-semibold">💡 {m.hint}</p>}
        {isGuide && <ModelSentence text={m.modelAnswer} id={m.id} />}
      </Shell>
    );
  }

  if (m.type === 'route') {
    const town = st.world?.kind === 'city' ? st.world.town : null;
    const dest = (m.destination ?? '') as PlaceKind;
    const name = PLACE_DEFS[dest]?.name ?? dest;
    const plan = isGuide && town && pose ? planRoute(town, pose, dest) : null;
    return (
      <Shell title={`🗺️ To the ${name}`} chip="bg-sky" onClose={onClose}>
        <p className="text-sm font-semibold">{m.brief}</p>
        {isGuide ? (
          <>
            <p className="mt-3 rounded-xl bg-sky/40 p-2 text-sm font-semibold">💡 {m.hint}</p>
            <p className="mt-2 text-xs font-bold text-muted">The green arrow on the map shows where the walker is looking. Their left is NOT the map’s left.</p>
            <ModelSentence text={plan?.text ?? m.modelAnswer} id={`${m.id}${plan?.text ?? ''}`} />
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
  const kind = item ? getKind(item.kind) : undefined;
  return (
    <Shell title={isGuide ? `🤔 ${m.title}` : `🔦 ${m.title}`} chip="bg-lavender" onClose={onClose}>
      <p className="text-sm font-semibold">{m.brief}</p>
      {isGuide && item && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-dashed border-ink bg-cream p-2">
          <span className="text-3xl">{kind?.emoji ?? '❓'}</span>
          <div className="text-sm">
            <div className="font-display text-base font-semibold">Your {kind?.name}</div>
            <div className="text-muted">It is {spotById(m.spotId ?? '')?.phrase} (gold ring).</div>
          </div>
        </div>
      )}
      {isGuide && m.hint && <p className="mt-3 rounded-xl bg-sky/40 p-2 text-sm font-semibold">💡 {m.hint}</p>}
      {isGuide && <ModelSentence text={m.modelAnswer} id={m.id} />}
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
  if (m.type === 'route') return `🗺️ ${PLACE_DEFS[(m.destination ?? '') as PlaceKind]?.name ?? 'Route'}`;
  return `🔦 ${m.title}`;
}
