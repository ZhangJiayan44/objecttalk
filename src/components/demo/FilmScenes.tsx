import { ArrowRight, Check, Coffee, Eye, Flag, Hand, Headphones, MapPin, MessageCircle, Mic, MousePointer2, Play, RotateCcw, Sparkles, Star, Target, Users, ZoomIn } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { ReviewList, RoundOutcome, SkillBars } from '@/components/game/Results';
import { asset } from '@/lib/asset';
import { NativeDemoScene, NativeShowcase, studyAction, studyPointer, type WorldKind } from './NativeDemoScene';
import { Celebration } from './Celebration';
import { DEMO_REPORT } from './native-data';
import { ACTION, ease, progress, type ChapterId } from './timeline';
import { Impact, key, Motion, reveal, Words, type MotionKey } from './Kinetic';

export function FilmLogo({ large = false }: { large?: boolean }) {
  return <div className={`film-logo ${large ? 'is-large' : ''}`}><img src={asset('/favicon.svg')} alt="" /><span>Object<span>Talk</span></span></div>;
}
function Tag({ children, color = 'sun', className = '' }: { children: ReactNode; color?: string; className?: string }) {
  return <span className={`film-tag ${className}`} style={{ background: `var(--color-${color})` }}>{children}</span>;
}
function Voice() {
  return <span className="film-wave" aria-hidden="true">{[17, 28, 42, 30, 46, 24, 36, 20, 31].map((h, i) => <i data-voice-bar="" key={i} style={{ height: h }} />)}</span>;
}
function Cursor({ t, reduced }: { t: number; reduced: boolean }) {
  const point = studyPointer(t, reduced);
  const p = ease(progress(t, 14.5, 0.55));
  const click = t >= ACTION.pick && t < ACTION.pick + 0.2 || t >= ACTION.drop && t < ACTION.drop + 0.2;
  return <div className={`film-cursor ${click ? 'is-clicking' : ''}`} data-cursor-x={point.x.toFixed(2)} data-cursor-y={point.y.toFixed(2)} style={{ transform: `translate3d(${920 + (point.x - 920) * p}px,${430 + (point.y - 430) * p}px,0)`, opacity: t >= 14.5 && t < ACTION.success ? 1 : 0 }}>
    <MousePointer2 size={38} fill="white" strokeWidth={2.4} /><span>{t < ACTION.pick ? 'Pick up' : t < ACTION.drop ? 'Move together' : 'Placed!'}</span>{click && <i />}
  </div>;
}

function Intro({ t, reduced }: { t: number; reduced: boolean }) {
  return <section className="film-scene film-intro" aria-label="Learn English through play">
    <Motion className="intro-visual" keys={[key(0, { x: 150, y: 40, s: 0.86, r: 4, o: 0 }), key(0.65, { x: 0, y: 0, s: 1, r: -2, o: 1 }, 'back'), key(2.3, { x: -22, y: -10, s: 1.035, r: 1 }), key(4.7, { x: 0, y: 0, s: 0.98, r: -1 })]}>
      <NativeDemoScene time={t} reduced={reduced} />
      <span className="camera-corner tl" /><span className="camera-corner br" />
    </Motion>
    <div className="intro-copy">
      <Motion keys={reveal(0.12, { x: -65, y: 0, r: -5 })}><Tag><Sparkles size={20} /> ENGLISH, IN PLAY.</Tag></Motion>
      <h1><Words text="Don’t just" start={0.3} /><Words text="learn it." start={0.65} /><Words text="Live it." start={1.05} className="film-green" /></h1>
      <Motion className="intro-underline" keys={[key(1.35, { sx: 0, o: 0 }), key(1.75, { sx: 1, o: 1 }, 'out')]} />
      <Motion className="intro-sub" keys={reveal(1.65, { x: -30, y: 0 })}>A shared world.<br />A real reason to speak.</Motion>
      <Motion className="intro-duo" keys={reveal(2.2, { s: 0.7, r: -8 })}><Users size={26} /><b>Two players.</b><span>One conversation.</span></Motion>
    </div>
    <Motion className="intro-quote" keys={[...reveal(2.5, { s: 0.45, r: 10 }), key(3.7, { y: -12, r: -2, s: 1.03, o: 1 }), key(4.7, { y: 0, r: 0, s: 1, o: 1 })]}><MessageCircle /> “Which rocket?”<Voice /></Motion>
    <Impact start={1.1} className="intro-impact" color="var(--color-cta)" />
    <Motion className="film-ticker" keys={[key(0, { x: 0, y: 110 }), key(2.7, { x: -160, y: 0 }, 'out'), key(5, { x: -600, y: 0 }, 'linear')]}><span>SPEAK</span>✳<span>PLAY</span>✳<span>CONNECT</span>✳<span>GROW</span>✳<span>SPEAK</span>✳<span>PLAY</span>✳<span>CONNECT</span></Motion>
  </section>;
}
function Partners({ t, reduced }: { t: number; reduced: boolean }) {
  return <section className="film-scene film-partners" aria-label="Two native perspectives, one conversation">
    <div className="duo-headline"><span className="film-eyebrow">SAME WORLD. DIFFERENT INFORMATION.</span><h2><Words text="Two views." start={5.25} /> <Words text="One shared win." start={5.55} className="film-green" /></h2></div>
    <div className="film-native-duo">
      <Motion as="article" keys={[...reveal(5.25, { x: -200, y: 0, r: -5 }), key(6.2, { s: 1.025, r: -1, o: 1 }), key(7.4, { s: 0.97, r: 0, o: 0.75 }), key(8.3, { s: 1, o: 1 })]}>
        <NativeDemoScene time={t} role="guide" reduced={reduced} /><Tag color="peach" className="native-role-label"><Eye size={20} /> MIA / GUIDE</Tag>
        <div className="native-role-copy"><b>You see the goal.</b><span>Describe it from their point of view.</span></div>
      </Motion>
      <Motion as="article" keys={[...reveal(5.4, { x: 200, y: 0, r: 5 }), key(6.2, { s: 0.97, r: 0, o: 0.75 }), key(7.4, { s: 1.025, r: 1, o: 1 }), key(8.3, { s: 1, o: 1 })]}>
        <NativeDemoScene time={t} role="builder" reduced={reduced} /><Tag color="sky" className="native-role-label"><Hand size={20} /> LEO / BUILDER</Tag>
        <div className="native-role-copy"><b>You make the move.</b><span>“My left, or <em>your</em> left?”</span></div>
      </Motion>
    </div>
    <Motion className="duo-connection" keys={[...reveal(5.9, { s: 0.4, r: -20 }), key(7.0, { s: 1.13, r: 5, o: 1 }), key(8.4, { s: 1, r: 0, o: 1 })]}><Mic size={28} /><Voice /></Motion>
    <Motion className="duo-your" keys={[key(7.25, { o: 0, s: 1.6, y: 30, r: -8 }), key(7.6, { o: 1, s: 1, y: 0, r: -3 }, 'back'), key(8.2, { o: 1, s: 1, y: 0, r: -3 }), key(8.55, { o: 0, s: 0.7, y: -50, r: 6 })]}>YOUR LEFT.</Motion>
    <Motion className="duo-footer" keys={reveal(8.45, { x: 120, y: 0, r: 4 })}><Tag color="mint"><Headphones size={23} /> Bring a friend. Or team up with AI.</Tag></Motion>
    <Impact start={7.35} className="duo-impact" />
  </section>;
}
function Gameplay({ t, reduced }: { t: number; reduced: boolean }) {
  const state = studyAction(t);
  const step = t < 12.6 ? 0 : t < 15.05 ? 1 : 2;
  const messages = [
    { at: 11.6, name: 'MIA / GUIDE', text: 'Pick up the small rocket.', color: 'peach' },
    { at: 12.85, name: 'LEO / BUILDER', text: 'My left, or your left?', color: 'sky' },
    { at: 14, name: 'MIA / GUIDE', text: 'Your left. Next to the books.', color: 'mint' },
  ];
  return <section className="film-scene film-gameplay" aria-label="Native 3D pick, move and place walkthrough">
    <div className="game-headline"><Motion keys={reveal(10.15, { y: -35 })}><Tag color="lavender"><Flag size={19} /> COZY STUDY</Tag></Motion><h2><Words text="Small words." start={10.2} /> <Words text="Real action." start={10.5} className="film-green" /></h2></div>
    <Motion className="game-cinema" keys={[key(10, { o: 0, y: 65, s: 0.92, r: -2 }), key(10.6, { o: 1, y: 0, s: 1, r: 0 }, 'out'), key(16.7, { o: 1, y: 0, s: 1, r: 0 }), key(17.05, { o: 1, y: -3, s: 1.015, r: -0.4 }, 'back'), key(18.5, { o: 1, y: 0, s: 1, r: 0 })]}>
      <NativeDemoScene time={t} action reduced={reduced} />
      <div className="game-view-label"><span /> LIVE 3D · SCRIPTED PLAY</div><div className="game-lens"><Target size={19} /> {t < 12.5 ? 'LOOK AROUND' : state.held ? 'MOVE TOGETHER' : state.complete ? 'MISSION COMPLETE' : 'FOCUS ON THE ROCKET'}</div>
      <Cursor t={t} reduced={reduced} />
      <Motion className="game-zoom-note" keys={[...reveal(10.8, { s: 0.6 }), key(12.15, { o: 1, s: 1, y: 0 }), key(12.5, { o: 0, s: 0.8, y: -20 })]}><ZoomIn size={22} /> Scroll. Zoom. Look closer.</Motion>
      <Motion className="game-win" keys={[key(ACTION.success, { o: 0, s: 1.6, r: -12 }), key(17.03, { o: 1, s: 1, r: -4 }, 'back'), key(18.8, { o: 1, s: 1.04, r: -2 })]}><Check size={32} strokeWidth={4} /> NAILED IT!<span>+1 shared win</span></Motion>
      <Impact start={ACTION.success} className="game-impact" color="var(--color-cta)" />
    </Motion>
    <div className="game-sidebar">
      <div className="film-action-steps">{['Look around', 'Say it clearly', 'Make your move'].map((label, i) => <Motion keys={reveal(10.5 + i * 0.08, { x: 70, y: 0 })} className={step === i ? 'active' : step > i ? 'done' : ''} key={label}><span>0{i + 1}</span><b>{label}</b>{step > i && <Check size={18} />}</Motion>)}</div>
      <div className="film-game-dialogue">{messages.map((m) => <Motion key={m.name + m.at} className={`film-bubble ${m.color}`} keys={reveal(m.at, { x: 70, y: 15, s: 0.7, r: 5 }, 0.3)}><span>{m.name}</span><p>{m.text.split(' ').map((w, i) => <span key={i} className={w.startsWith('Your') || w === 'your' ? 'spoken-emphasis' : ''} style={{ opacity: t >= m.at + i * 0.035 ? 1 : 0 }}>{w} </span>)}</p></Motion>)}</div>
    </div>
  </section>;
}

const WORLD_CARDS: { kind: WorldKind; title: string; verb: string; color: string; quote: string; start: number; end: number; icon: ReactNode }[] = [
  { kind: 'cafe', title: 'Corner Café', verb: 'ORDER & CLARIFY', color: 'peach', quote: 'Two croissants, please.', start: 20, end: 23.1, icon: <Coffee size={23} /> },
  { kind: 'town', title: 'Toy Town', verb: 'ASK & EXPLORE', color: 'sky', quote: 'Turn left at the bank.', start: 23.1, end: 27, icon: <MapPin size={23} /> },
  { kind: 'night', title: 'Night Market', verb: 'MEET & DISCOVER', color: 'lavender', quote: 'Let’s meet by the tea shop.', start: 27, end: 32.5, icon: <Sparkles size={23} /> },
];
function worldTrack(i: number, start: number, end: number): MotionKey[] {
  const x = 58 + i * 503;
  return [key(19, { x, y: 278, s: 0.3, o: 1 }), key(start, { x, y: 278, s: 0.3, o: 1 }), key(start + 0.48, { x: 0, y: 0, s: 1, o: 1 }, 'out'), key(end - 0.2, { x: 0, y: 0, s: 1, o: 1 }), key(end + 0.08, { x: -220, y: -10, s: 1.08, o: 0 }), key(32.6, { x, y: 200, s: 0.24, o: 0 }), key(33.1, { x, y: 267, s: 0.3, o: 1 }, 'out'), key(35, { x, y: 267, s: 0.3, o: 1 })];
}
function Worlds({ t, reduced }: { t: number; reduced: boolean }) {
  const focus = t < 20 ? -1 : t < 23.1 ? 0 : t < 27 ? 1 : t < 32.6 ? 2 : -1;
  return <section className="film-scene film-worlds" aria-label="Native café, town and new two-level night market cinematic tour">
    <Motion className="worlds-heading" keys={[...reveal(19.1, { y: -45 }), key(19.9, { o: 1, y: 0 }), key(20.3, { o: 0, y: -80 }), key(32.6, { o: 0, y: 25 }), key(33, { o: 1, y: 0 })]}><span className="film-eyebrow">BEYOND THE TEXTBOOK</span><h2><Words text="New worlds." start={19.15} /> <Words text="Your words." start={19.4} className="film-green" /></h2></Motion>
    <div className="film-world-grid">{WORLD_CARDS.map((w, i) => {
      const nativeTime = t < w.start ? w.start : t > w.end ? w.end : t;
      return <Motion key={w.kind} className={`reel-shot ${w.kind}`} keys={worldTrack(i, w.start, w.end)} style={{ zIndex: focus === i ? 3 : 1 }}>
        <NativeDemoScene kind={w.kind} time={nativeTime} reduced={reduced} />
      </Motion>;
    })}</div>
    {WORLD_CARDS.map((w, i) => <Motion className="world-mini-label" key={w.kind} style={{ left: 58 + i * 503 }} keys={[key(19, { o: 1 }), key(19.8, { o: 1 }), key(20.12, { o: 0 }), key(32.6, { o: 0, y: 20 }), key(33.1, { o: 1, y: 0 })]}><span>0{i + 1} / {w.verb}</span><b>{w.title}</b></Motion>)}
    {WORLD_CARDS.map((w) => <Motion key={w.title} className="world-shot-copy" keys={[key(w.start, { o: 0, x: -100, y: 20, s: 0.8 }), key(w.start + 0.55, { o: 1, x: 0, y: 0, s: 1 }, 'out'), key(w.end - 0.35, { o: 1, x: 0, y: 0, s: 1 }), key(w.end + 0.08, { o: 0, x: 100, y: -20, s: 1.05 })]}>
      <Tag color={w.color}>{w.icon} {w.verb}</Tag><h2><Words text={w.title} start={w.start + 0.12} /></h2><div className="world-quote"><MessageCircle size={22} />{w.quote}</div>
    </Motion>)}
    <Motion className="world-order-count" keys={[...reveal(21.1, { s: 0.4, r: -15 }), key(22.6, { s: 1, o: 1, y: 0 }), key(23, { s: 1.2, o: 0, y: -30 })]}><Check size={23} /> {t >= 22.2 ? '2' : t >= 21.75 ? '1' : '0'} / 2 croissants</Motion>
    <Motion className="world-route-note" keys={[...reveal(24, { x: 150, y: 0, r: 6 }), key(26.3, { o: 1, y: 0 }), key(26.8, { o: 0, y: -40 })]}><MapPin /> YOUR NEXT TURN <ArrowRight /><span>at the bank</span></Motion>
    <Motion className="night-floor-note" keys={[key(30, { o: 0, s: 1.3, r: 7 }), key(30.35, { o: 1, s: 1, r: -3 }, 'back'), key(31.9, { o: 1, s: 1, r: -3 }), key(32.5, { o: 0, s: 0.8, r: 0 })]}><span>2F</span><b>Go upstairs.</b><small>More to explore.</small></Motion>
    <Motion className="worlds-outro" keys={reveal(33.1, { y: 60 })}><Words text="Order. Explore. Connect." start={33.1} /><Tag color="mint"><Sparkles size={22} /> Agent-made levels. More adventures.</Tag></Motion>
    {[23.0, 26.9, 29.95].map((at) => <div className="film-mini-cut" key={at}>{[0, 1, 2].map((i) => <i key={i} data-transition-slat={i} data-start={at} />)}</div>)}
    <Impact start={30.1} className="night-impact" color="var(--color-sun)" />
  </section>;
}
function Coach({ t }: { t: number }) {
  const scoreP = ease(progress(t, 35.65, 1.05));
  const score = Math.round(DEMO_REPORT.clarity * scoreP);
  const skills = Object.fromEntries(Object.entries(DEMO_REPORT.skills).map(([name, value], i) => [name, Math.round(value * ease(progress(t, 36 + i * 0.13, 0.9)))])) as unknown as typeof DEMO_REPORT.skills;
  const replay = 11.2 + progress(t, 37.5, 4.5) * 6.5;
  return <section className="film-scene film-coach" aria-label="Animated real coach scores and native game replay">
    <div className="coach-title"><Motion keys={reveal(35.1, { x: -90, y: 0 })}><Tag color="lavender"><Sparkles size={20} /> YOUR AI COACH</Tag></Motion><h2><Words text="Replay it." start={35.2} /><Words text="Say it clearer." start={35.5} className="film-green" /></h2></div>
    <Motion className="coach-score" keys={[...reveal(35.45, { s: 0.4, r: -12 }), key(37.3, { s: 1, o: 1, x: 0, y: 0 }), key(38, { s: 0.6, o: 1, x: -170, y: -105 })]}>
      <svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="87" fill="none" stroke="#2d374814" strokeWidth="12" /><circle cx="100" cy="100" r="87" fill="none" stroke="var(--color-cta)" strokeWidth="12" strokeLinecap="round" strokeDasharray={547} strokeDashoffset={547 * (1 - score / 100)} transform="rotate(-90 100 100)" /></svg>
      <div><b data-clarity-score={score}>{score}<small>/100</small></b><span>CLARITY SCORE</span></div>
      <span className="coach-score-stars">{[1, 2, 3].map((n) => <Motion as="span" key={n} keys={reveal(36.65 + n * 0.15, { s: 0.1, r: -40 }, 0.25)}><Star size={30} fill={n <= DEMO_REPORT.stars ? 'var(--color-sun)' : 'transparent'} /></Motion>)}</span>
    </Motion>
    <Motion className="coach-replay" keys={[key(35, { o: 0, y: 120, s: 0.85 }), key(37.55, { o: 0, y: 120, s: 0.85 }), key(38.1, { o: 1, y: 0, s: 1 }, 'out'), key(42.8, { o: 1, y: 0, s: 1 })]}><NativeDemoScene time={replay} action /><span><RotateCcw size={17} /> REPLAY THE BREAKTHROUGH</span></Motion>
    <Motion className="native-report" keys={reveal(35.4, { x: 220, y: 0, r: 4 }, 0.5)}>
      <div className="native-report-heading"><h3>Clarity you can build on.</h3><RoundOutcome report={DEMO_REPORT} /></div>
      <div className="native-report-window"><Motion className="native-report-track" keys={[key(35, { y: 0 }), key(38.4, { y: 0 }), key(39.3, { y: -212 }, 'out'), key(42.8, { y: -278 })]}>
        <div className="film-score-bars"><SkillBars skills={skills} names={DEMO_REPORT.skillNames} /></div>
        <h3 className="native-review-label">Less vague. More clear.</h3><ReviewList report={DEMO_REPORT} />
      </Motion></div>
      <small className="native-report-note">Scripted example · scores from the game’s real analysis</small>
    </Motion>
    <Motion className="coach-clear-stamp" keys={[key(37, { o: 0, s: 1.8, r: 12 }), key(37.35, { o: 1, s: 1, r: -5 }, 'back'), key(37.8, { o: 1, s: 1, r: -5 }), key(38.15, { o: 0, s: 1.1, r: 0 })]}><Check /> GETTING CLEARER!</Motion>
    <Impact start={36.95} className="coach-impact" color="var(--color-grape)" />
  </section>;
}
function Outro({ t }: { t: number }) {
  return <section className="film-scene film-outro" aria-label="ObjectTalk. Say it clearly. Win together.">
    <Motion className="outro-ribbon ribbon-one" keys={[key(43, { x: -430, r: -12 }), key(43.7, { x: 0, r: -8 }, 'out'), key(48, { x: 8, r: -6 })]}><span>PLAY TOGETHER</span><span>SPEAK TOGETHER</span></Motion>
    <Motion className="outro-ribbon ribbon-two" keys={[key(43, { x: 430, r: 12 }), key(43.8, { x: 0, r: 8 }, 'out'), key(48, { x: -8, r: 6 })]}><span>REAL WORLDS</span><span>REAL WORDS</span></Motion>
    <Motion className="outro-logo" keys={reveal(43.25, { s: 0.55, r: -10 }, 0.45)}><FilmLogo large /></Motion>
    <h2><Words text="Say it clearly." start={43.65} /><Words text="Win together." start={44.05} className="film-green" /></h2>
    <Motion className="native-final-showcase" keys={[key(43, { s: 0.6, y: 60, o: 0 }), key(44, { s: 1, y: 0, o: 1 }, 'back'), key(47.8, { s: 1.06, y: -5, o: 1 })]}><NativeShowcase time={t} /></Motion>
    <Motion className="film-final-button" keys={reveal(44.5, { s: 0.1, r: 10 }, 0.4)}><Play size={24} fill="currentColor" /> Let’s play <ArrowRight /></Motion>
    <Motion className="outro-team" keys={[...reveal(45, { y: 40, r: -2 }), key(46.2, { y: 0, r: -2, o: 1 }), key(46.45, { y: -60, r: 4, o: 0 })]}><Users /> You + a friend.</Motion>
    <Motion className="outro-team" keys={reveal(46.4, { y: 40, r: 3 })}><Sparkles /> You + AI.</Motion>
    <Celebration time={t - 43} />
  </section>;
}

export const ChapterContent = memo(function ChapterContent({ id, time, reduced }: { id: ChapterId; time: number; reduced: boolean }) {
  switch (id) {
    case 'intro': return <Intro t={time} reduced={reduced} />;
    case 'partners': return <Partners t={time} reduced={reduced} />;
    case 'play': return <Gameplay t={time} reduced={reduced} />;
    case 'worlds': return <Worlds t={time} reduced={reduced} />;
    case 'coach': return <Coach t={time} />;
    case 'outro': return <Outro t={time} />;
  }
});
