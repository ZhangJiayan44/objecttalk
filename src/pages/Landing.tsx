import { ArrowRight, Clock, Gauge, MessageCircle, Mic, QrCode, RotateCcw, Sparkles, Users } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { buildScene } from '@shared/missions';
import { Bar, btn, Footer, Navbar } from '@/components/ui';
import { ScoreBars } from '@/components/ui/charts';

const RoomScene = lazy(() => import('@/components/three/RoomScene').then((m) => ({ default: m.RoomScene })));
const Showcase = lazy(() => import('@/components/three/Showcase').then((m) => ({ default: m.Showcase })));

const MISSIONS = [
  {
    icon: '📚',
    color: 'var(--color-peach)',
    title: 'Cozy Study',
    by: 'Find & place on the desk',
    desc: 'Two rockets look the same. Only the guide knows which one, and you face each other: “on YOUR left, next to the lamp”.',
    meta: ['2 players', '90 s', 'A2–B1'],
    live: true,
  },
  {
    icon: '☕',
    color: 'var(--color-sun)',
    title: 'Corner Café',
    by: 'Order food & drinks',
    desc: '“Could I have two croissants and a large coffee?” The barista asks “small or large?” and fills the tray. Numbers, plurals, sizes, politeness.',
    meta: ['2 players', '120 s', 'A2–B1'],
    live: true,
  },
  {
    icon: '🏙️',
    color: 'var(--color-sky)',
    title: 'Toy Town',
    by: 'Ask for & give directions',
    desc: 'The walker WALKS a 3D town (WASD). The navigator has the map and must say “turn left at the bank” from the WALKER’s heading, never “go north”.',
    meta: ['2 players', '150 s', 'A2–B2'],
    live: true,
  },
  {
    icon: '🛏️',
    color: 'var(--color-lavender)',
    title: 'Messy Bedroom',
    by: 'Find lost things',
    desc: '“My keys are under the bed… no, on top of the wardrobe!” Walk around, look under, inside and behind, warmer or colder.',
    meta: ['2 players', '120 s', 'A2–B1'],
    live: true,
  },
  {
    icon: '✨',
    color: 'var(--color-mint)',
    title: 'Agent-made levels',
    by: 'Scene Agent + Hyper3D Rodin',
    desc: 'Give the agent a theme: it plans a level, sources references, generates every object with Rodin, simulates hundreds of rounds and publishes it. Music Room and Fruit Market were made this way.',
    meta: ['2 players', 'any', 'all levels'],
    live: true,
  },
  {
    icon: '🎬',
    color: 'var(--color-grape)',
    title: 'AI vs AI',
    by: 'Watch & learn',
    desc: 'Two AI partners play any level live while you watch both points of view and the agents’ reasoning: hear how the conversation should go before you try.',
    meta: ['0 players', 'any', 'all levels'],
    live: true,
  },
];

const PERSONAS = [
  { initial: 'L', color: 'bg-peach', name: 'Lily, 15', role: 'Middle-school learner', quote: 'I always said “on the left” and my friend picked the wrong one. The replay showed me why: my left was HIS right!' },
  { initial: 'K', color: 'bg-sky', name: 'Kai, 19', role: 'University freshman', quote: 'Ninety seconds is perfect between classes. Pixel, the AI builder, makes me give a landmark every time. That is exactly what I need for speaking exams.' },
  { initial: 'M', color: 'bg-mint', name: 'Ms. Zhou', role: 'English teacher', quote: 'Students finally have a reason to ask “Which one do you mean?”. The coach report gives me concrete sentences to review in class.' },
];

const SAMPLE_SCORES = [42, 51, 48, 63, 70, 66, 78, 84];

function HeroScene() {
  const scene = useMemo(() => buildScene({ seed: 8, interests: ['space', 'animals', 'food'], difficulty: 'normal' }), []);
  const target = scene.objects.find((o) => o.kind === 'rocket') ?? scene.objects[0];
  const decoy = scene.objects.find((o) => o.kind === target.kind && o.id !== target.id);
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center font-display text-muted">Loading the 3D room…</div>}>
      <RoomScene className="!absolute inset-0" scene={scene} view="overview" autoRotate target={{ findId: target.id }} pointer={decoy ? { objectId: decoy.id, cell: null } : null} labels={false} names={{ guide: 'Mia', builder: 'Leo' }} />
    </Suspense>
  );
}

function ProgressDemo() {
  const [scores, setScores] = useState(SAMPLE_SCORES);
  const [skills, setSkills] = useState({ spatial: 72, perspective: 58, clarifying: 80, speed: 64 });
  const simulate = () => {
    const last = scores[scores.length - 1];
    setScores([...scores.slice(-9), Math.min(98, last + Math.round(Math.random() * 10 - 2))]);
    setSkills((s) => ({
      spatial: Math.min(99, s.spatial + 4),
      perspective: Math.min(99, s.perspective + 9),
      clarifying: Math.min(99, s.clarifying + 2),
      speed: Math.min(99, s.speed + 5),
    }));
  };
  return (
    <div className="clay-card grid gap-6 p-6 md:grid-cols-[1.3fr_1fr]">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xl font-bold">Clarity score per game</h3>
          <span className="clay-chip bg-sun !py-0.5">🔥 3-day streak</span>
        </div>
        <p className="mb-3 text-sm text-muted">How often your partner understood you on the first try.</p>
        <ScoreBars values={scores} labels={scores.map((_, i) => `#${i + 1}`)} />
      </div>
      <div className="space-y-3">
        {(
          [
            ['Spatial words', skills.spatial, 'bg-cta'],
            ['Perspective (“your left”)', skills.perspective, 'bg-grape'],
            ['Clarifying questions', skills.clarifying, 'bg-sky-deep'],
            ['Speed', skills.speed, 'bg-sun'],
          ] as const
        ).map(([label, v, color]) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-sm font-bold">
              <span>{label}</span>
              <span>{v}%</span>
            </div>
            <Bar value={v} color={color} />
          </div>
        ))}
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="clay-chip bg-lavender !py-0.5 !text-xs">🏅 Perspective Pro</span>
          <span className="clay-chip bg-mint !py-0.5 !text-xs">❓ Question Master</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <button className={btn('secondary', 'sm')} onClick={simulate}>
            <RotateCcw size={16} strokeWidth={3} /> Simulate a game
          </button>
          <Link to="/progress" className={btn('white', 'sm')}>
            My real progress
          </Link>
        </div>
        <p className="text-xs text-muted">Sample data. Your own progress appears after your first game.</p>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-dvh bg-white">
      <Navbar />

      {/* Hero */}
      <section className="overflow-hidden bg-cream px-4 pt-28 pb-14 sm:pt-36 sm:pb-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <div className="clay-chip mb-6 bg-mint">
              <span className="h-2 w-2 rounded-full bg-cta" /> New: café, town & bedroom levels · walk around in 3D
            </div>
            <h1 className="mb-6 text-4xl leading-tight font-bold sm:text-5xl lg:text-6xl">
              Say it <span className="text-cta">clearly</span>,
              <br />
              win it <span className="text-grape">together</span>!
            </h1>
            <p className="mx-auto mb-8 max-w-lg text-lg text-muted lg:mx-0">
              ObjectTalk is a two-player 3D game for speaking English. One of you knows the goal, the other acts in the 3D world: find things on a desk, order in a café, <b className="text-ink">ask for directions in a town</b>, hunt for lost keys. Explain, listen, clarify, win.
            </p>
            <div className="mb-10 flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
              <Link to="/play" className={btn('primary', 'lg')}>
                Play with a friend <ArrowRight size={20} strokeWidth={3} />
              </Link>
              <Link to="/play" className={btn('secondary', 'lg')}>
                Practice with AI
              </Link>
            </div>
            <div className="flex justify-center gap-8 lg:justify-start">
              {[
                ['6', 'everyday levels'],
                ['2', 'views, 1 goal'],
                ['57', 'Rodin 3D models'],
              ].map(([n, l]) => (
                <div key={l} className="text-center">
                  <div className="font-display text-3xl font-bold">{n}</div>
                  <div className="text-sm text-muted">{l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="clay-card relative z-10 aspect-[4/3] overflow-hidden bg-gradient-to-b from-[#fff4ef] to-[#e9f6fb]">
              <HeroScene />
              <div className="absolute top-3 left-3 max-w-[62%] animate-pop rounded-2xl border-[3px] border-ink bg-peach px-3 py-2 text-sm font-bold shadow-[3px_3px_0_#2d3748]">
                🧭 Mia: “Pick up the rocket on <u>your</u> left!”
              </div>
              <div className="absolute right-3 bottom-3 max-w-[60%] animate-pop rounded-2xl border-[3px] border-ink bg-sky px-3 py-2 text-sm font-bold shadow-[3px_3px_0_#2d3748]" style={{ animationDelay: '0.4s' }}>
                🛠️ Leo: “Wait… my left or your left?”
              </div>
            </div>
            <div className="absolute -top-5 -right-3 z-20 flex h-16 w-16 animate-float items-center justify-center rounded-2xl border-[3px] border-ink bg-sun text-3xl sm:-right-5">🎯</div>
            <div className="absolute -bottom-5 -left-3 z-20 flex h-14 w-14 animate-float items-center justify-center rounded-2xl border-[3px] border-ink bg-lavender text-2xl sm:-left-5" style={{ animationDelay: '1s' }}>
              💬
            </div>
            <div className="absolute top-1/2 -right-4 z-20 hidden h-12 w-12 animate-float items-center justify-center rounded-full border-[3px] border-ink bg-mint text-xl sm:flex sm:-right-7" style={{ animationDelay: '2s' }}>
              ⭐
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-28 px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <span className="clay-chip mb-4 bg-sky">How it works</span>
            <h2 className="mb-3 text-3xl font-bold sm:text-4xl">One table. Two views. Zero pointing.</h2>
            <p className="mx-auto max-w-2xl text-lg text-muted">The only way to win is to say exactly what you mean, from your partner’s point of view.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: <QrCode size={28} strokeWidth={2.5} />, color: 'bg-peach', title: '1. Scan & split', text: 'Two players scan one QR code. One becomes the Guide (sees the goal), one the Builder (moves things).' },
              { icon: <Mic size={28} strokeWidth={2.5} />, color: 'bg-sun', title: '2. Talk it through', text: 'The Guide explains in English, the Builder asks and acts. You face each other, so your left is their right!' },
              { icon: <Sparkles size={28} strokeWidth={2.5} />, color: 'bg-mint', title: '3. Replay & level up', text: 'Watch the replay. The coach flags every unclear sentence and shows a clearer way to say it.' },
            ].map((s) => (
              <div key={s.title} className="clay-card clay-card-hover p-6">
                <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border-[3px] border-ink ${s.color}`}>{s.icon}</div>
                <h3 className="mb-2 text-xl font-bold">{s.title}</h3>
                <p className="text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission catalog */}
      <section id="missions" className="scroll-mt-28 bg-cream px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <span className="clay-chip mb-4 bg-peach">Levels</span>
            <h2 className="mb-3 text-3xl font-bold sm:text-4xl">Everyday English, in places you can walk into</h2>
            <p className="mx-auto max-w-2xl text-lg text-muted">Every mission is generated live and checked by our language engines, so there is always one clear answer, and the coach can tell you exactly what was unclear.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {MISSIONS.map((m) => (
              <div key={m.title} className="clay-card clay-card-hover cursor-default p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-[3px] border-ink text-2xl" style={{ backgroundColor: m.color }}>
                    {m.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="mb-0.5 text-lg font-bold">{m.title}</h3>
                    <p className="mb-2 text-sm text-muted">{m.by}</p>
                    <p className="mb-3 text-sm font-semibold">{m.desc}</p>
                    <div className="flex flex-wrap gap-3 text-sm text-muted">
                      <span className="flex items-center gap-1">
                        <Users size={15} strokeWidth={2.5} /> {m.meta[0]}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={15} strokeWidth={2.5} /> {m.meta[1]}
                      </span>
                      <span className="flex items-center gap-1">
                        <Gauge size={15} strokeWidth={2.5} /> {m.meta[2]}
                      </span>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border-2 px-3 py-1 text-xs font-bold ${m.live ? 'border-cta bg-cta/10 text-cta-deep' : 'border-muted bg-line text-muted'}`}>{m.live ? '● Live' : 'Soon'}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link to="/play" className={btn('secondary')}>
              Try the live missions <ArrowRight size={18} strokeWidth={3} />
            </Link>
          </div>
        </div>
      </section>

      {/* Rodin objects */}
      <section id="objects" className="scroll-mt-28 px-4 py-14 sm:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div className="clay-card relative aspect-[16/10] overflow-hidden bg-gradient-to-b from-lavender/60 to-white">
            <Suspense fallback={<div className="flex h-full items-center justify-center font-display text-muted">Loading 3D objects…</div>}>
              <Showcase className="!absolute inset-0" />
            </Suspense>
          </div>
          <div>
            <span className="clay-chip mb-4 bg-lavender">Powered by Hyper3D Rodin</span>
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Your interests become the level</h2>
            <p className="mb-6 text-lg text-muted">Pick Space, Animals, Food, Sports or Games and those objects fill your table. Snap a photo of your own thing and Rodin turns it into a 3D object for your next round.</p>
            <ul className="space-y-3">
              {[
                ['01 USE', '5 hero objects generated with Rodin Gen-2.5 (image-to-3D) and optimized 96% for the web.', 'bg-peach'],
                ['02 BUILD', 'Created through the Hyper3D MCP inside our AI coding agent.', 'bg-sky'],
                ['03 CORE', 'Object Studio calls the Rodin API live: your photo becomes a game object.', 'bg-sun'],
                ['04 AGENT', 'A Scene Agent plans, sources, generates and validates whole object packs.', 'bg-mint'],
              ].map(([tag, text, color]) => (
                <li key={tag} className="flex items-start gap-3">
                  <span className={`shrink-0 rounded-lg border-2 border-ink px-2 py-0.5 font-display text-xs font-bold ${color}`}>{tag}</span>
                  <span className="font-semibold">{text}</span>
                </li>
              ))}
            </ul>
            <Link to="/studio" className={btn('primary', 'md', 'mt-7')}>
              Open Object Studio <ArrowRight size={18} strokeWidth={3} />
            </Link>
          </div>
        </div>
      </section>

      {/* Progress tracking demo */}
      <section id="progress" className="scroll-mt-28 bg-cream px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <span className="clay-chip mb-4 bg-sun">Progress tracking</span>
            <h2 className="mb-3 text-3xl font-bold sm:text-4xl">Watch your English level up</h2>
            <p className="mx-auto max-w-2xl text-lg text-muted">Every 90-second game scores four speaking skills, so you can see exactly what improved.</p>
          </div>
          <ProgressDemo />
        </div>
      </section>

      {/* Personas */}
      <section className="px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <span className="clay-chip mb-4 bg-mint">Who it’s for</span>
            <h2 className="mb-3 text-3xl font-bold sm:text-4xl">Made for learners like them</h2>
            <p className="text-sm text-muted">Illustrative quotes from our target-user personas, not real reviews (yet!).</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {PERSONAS.map((p) => (
              <figure key={p.name} className="clay-card flex flex-col p-6">
                <MessageCircle size={26} strokeWidth={2.5} className="text-grape" />
                <blockquote className="mt-3 flex-1 font-semibold">“{p.quote}”</blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-ink font-display text-xl font-bold ${p.color}`}>{p.initial}</span>
                  <span>
                    <span className="block font-bold">{p.name}</span>
                    <span className="block text-sm text-muted">{p.role}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20">
        <div className="clay-card relative mx-auto max-w-5xl overflow-hidden bg-gradient-to-br from-peach to-sun p-8 text-center sm:p-12">
          <div className="absolute -top-8 -left-8 h-32 w-32 blob bg-white/40" />
          <div className="absolute -right-10 -bottom-10 h-40 w-40 blob bg-mint/60" />
          <h2 className="relative text-3xl font-bold sm:text-4xl">Ready for your 90-second challenge?</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-lg font-semibold">Grab a friend, scan the code, start talking. Or warm up with an AI partner first.</p>
          <div className="relative mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link to="/play" className={btn('primary', 'lg')}>
              Start playing free <ArrowRight size={20} strokeWidth={3} />
            </Link>
            <Link to="/demo" className={btn('white', 'lg')}>
              Watch the duo demo
            </Link>
          </div>
          <p className="relative mt-5 text-sm font-bold">No account · Works on phones · Open source (MIT)</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
