import { useMemo } from 'react';
import { Link } from 'react-router';
import { SkillBars } from '@/components/game/Results';
import { WordBook } from '@/components/game/WordBook';
import { levelOf } from '@shared/levels';
import { btn, Footer, Navbar } from '@/components/ui';
import { ScoreBars } from '@/components/ui/charts';
import { getSessions } from '@/lib/profile';

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="clay-card p-5">
      <dt className="text-sm font-bold text-muted">{label}</dt>
      <dd className="font-display text-4xl font-bold">{value}</dd>
      {sub && <dd className="text-sm font-semibold text-muted">{sub}</dd>}
    </div>
  );
}

export default function Progress() {
  const sessions = useMemo(() => getSessions(), []);
  const hasSessions = sessions.length > 0;
  const last = sessions.slice(-12);
  const avg = hasSessions ? Math.round(sessions.reduce((s, x) => s + x.clarity, 0) / sessions.length) : '—';
  const best = hasSessions ? Math.max(...sessions.map((s) => s.clarity)) : '—';
  const missions = sessions.reduce((s, x) => s + x.missionsDone, 0);
  const recent = sessions.slice(-5);
  const skills = recent.length ? {
    spatial: Math.round(recent.reduce((s, x) => s + x.skills.spatial, 0) / recent.length),
    perspective: Math.round(recent.reduce((s, x) => s + x.skills.perspective, 0) / recent.length),
    clarifying: Math.round(recent.reduce((s, x) => s + x.skills.clarifying, 0) / recent.length),
    speed: Math.round(recent.reduce((s, x) => s + x.skills.speed, 0) / recent.length),
  } : null;
  return (
    <div className="min-h-dvh bg-cream">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 pt-28 pb-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="clay-chip bg-sun">📈 My progress</span>
            <h1 className="mt-3 text-4xl font-bold">How clearly do you speak?</h1>
            <p className="text-muted">Saved in this browser. Come back here to continue, no account needed.</p>
          </div>
          <Link to="/play" className={btn('primary')}>
            Play a round
          </Link>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Games played" value={sessions.length} />
          <Tile label="Average clarity" value={avg} sub="out of 100" />
          <Tile label="Best clarity" value={best} />
          <Tile label="Missions completed" value={missions} />
        </dl>
        {!hasSessions && (
          <section className="clay-card mt-6 bg-mint/40 p-8 text-center" aria-labelledby="progress-empty-title">
            <div className="text-4xl" aria-hidden="true">🎯</div>
            <h2 id="progress-empty-title" className="mt-3 text-2xl font-bold">No games completed yet</h2>
            <p className="mx-auto mt-2 max-w-lg text-muted">Finish your first round to see your clarity scores, skills and game history here.</p>
            <Link to="/play" className={btn('primary', 'md', 'mt-5')}>Start your first game</Link>
          </section>
        )}
        {skills && <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="clay-card p-6">
            <h2 className="text-xl font-bold">Clarity score per game</h2>
            <p className="mb-3 text-sm text-muted">Last {last.length} games</p>
            <ScoreBars values={last.map((s) => s.clarity)} labels={last.map((s) => new Date(s.at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }))} height={170} />
          </div>
          <div className="clay-card p-6">
            <h2 className="mb-4 text-xl font-bold">Skills (last 5 games)</h2>
            <SkillBars skills={skills} />
          </div>
        </div>}
        <div className="mt-6">
          <WordBook />
        </div>
        {hasSessions && <div className="clay-card mt-6 overflow-x-auto p-6">
          <h2 className="mb-3 text-xl font-bold">History</h2>
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="border-b-2 border-line text-muted">
                <th className="py-2">Date</th>
                <th>Place</th>
                <th>Role</th>
                <th>Partner</th>
                <th>Clarity</th>
                <th>Missions</th>
                <th>Mistakes</th>
                <th>CEFR</th>
                <th>🛟</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...sessions].reverse().map((s, i) => (
                <tr key={s.replayId || i} className="border-b border-line font-semibold">
                  <td className="py-2">{new Date(s.at).toLocaleString()}</td>
                  <td>{s.level ? `${levelOf(s.level).emoji} ${levelOf(s.level).title}` : '—'}</td>
                  <td>{s.role === 'guide' ? '🧭 Guide' : '🛠️ Builder'}</td>
                  <td>{s.partner === 'ai' ? '🤖 AI' : '👫 Friend'}</td>
                  <td>{s.clarity}</td>
                  <td>
                    {s.missionsDone}/{s.missionsTotal}
                  </td>
                  <td>{s.mistakes}</td>
                  <td>{s.cefr ?? '—'}</td>
                  <td>{s.lifelines ?? 0}</td>
                  <td>{s.replayId && <Link to={`/replay/${s.replayId}`} className="font-bold text-grape underline">Replay</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </main>
      <Footer />
    </div>
  );
}
