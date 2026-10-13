import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { SessionReport, SkillScores, Verdict } from '@shared/analysis';
import { levelOf } from '@shared/levels';
import type { Coaching, ServerInfo } from '@shared/protocol';
import { Bar, btn } from '@/components/ui';
import { fetchInfo, shareUrl } from '@/lib/api';
import { useGame, useGameClient } from '@/lib/game-client';
import { addSession } from '@/lib/profile';
import { speak } from '@/lib/speech';
import { addWord } from '@/lib/words';

export const VERDICT_STYLE: Record<Verdict, { label: string; cls: string }> = {
  clear: { label: 'Clear', cls: 'bg-mint' },
  ok: { label: 'OK, but…', cls: 'bg-sun' },
  unclear: { label: 'Unclear', cls: 'bg-peach' },
  misleading: { label: 'Misleading', cls: 'bg-coral text-white' },
  chat: { label: 'Chat', cls: 'bg-line' },
};

export function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-1 text-4xl" aria-label={`${n} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? 'animate-pop' : 'opacity-25 grayscale'} style={{ animationDelay: `${i * 120}ms` }}>
          ⭐
        </span>
      ))}
    </div>
  );
}

export function SkillBars({ skills, names }: { skills: SessionReport['skills']; names?: Partial<Record<keyof SkillScores, string>> }) {
  const rows: [string, number, string][] = [
    [names?.spatial ?? 'Spatial words', skills.spatial, 'bg-cta'],
    [names?.perspective ?? 'Perspective (“your left”)', skills.perspective, 'bg-grape'],
    [names?.clarifying ?? 'Clarifying questions', skills.clarifying, 'bg-sky-deep'],
    [names?.speed ?? 'Speed', skills.speed, 'bg-sun'],
  ];
  return (
    <div className="space-y-3">
      {rows.map(([label, v, color]) => (
        <div key={label}>
          <div className="mb-1 flex justify-between text-sm font-bold">
            <span>{label}</span>
            <span>{v}%</span>
          </div>
          <Bar value={v} color={color} />
        </div>
      ))}
    </div>
  );
}

/** Phrases borrowed with the Chinese lifeline: learn them now, they are in your word book. */
export function BorrowedWords({ report, role }: { report: SessionReport; role?: string | null }) {
  const list = (report.lifelines ?? []).filter((l) => !role || !l.role || l.role === role);
  if (!list.length) return null;
  return (
    <div className="clay-card bg-mint/40 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl font-semibold">🛟 Words you borrowed</h3>
        <span className="text-xs font-bold text-muted">
          {list.length} lifeline{list.length > 1 ? 's' : ''}
          {report.lifelinePenalty ? ` · −${report.lifelinePenalty} points` : ' · free'} · saved to your word book
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">Say each one out loud twice. Next round, try it without the lifeline!</p>
      <ul className="mt-3 space-y-2">
        {list.map((l) => (
          <li key={`${l.t}-${l.zh}`} className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-white px-3 py-2">
            <button className="shrink-0 rounded-lg border-2 border-ink bg-sun p-1 text-sm" aria-label="Hear it" onClick={() => speak(l.en, { rate: 0.85 })}>
              🔊
            </button>
            <div className="min-w-0">
              <div className="font-bold leading-snug">{l.en}</div>
              <div className="text-sm text-muted">{l.zh}</div>
            </div>
            <span className={`ml-auto shrink-0 rounded-full border-2 border-ink px-2 text-[11px] font-bold ${l.used ? 'bg-mint' : 'bg-peach'}`}>{l.used ? 'you said it ✓' : 'not said yet'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const CEFR_STEPS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;

/** Rough speaking-level estimate (rule-based, optionally refined by the LLM coach). */
export function CefrCard({ report, coaching }: { report: SessionReport; coaching?: Coaching }) {
  const est = report.cefr;
  const level = coaching?.cefr ?? est?.level;
  return (
    <div className="clay-card bg-lavender/60 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold">🎯 Your English this round</h3>
        {coaching?.cefr && <span className="clay-chip bg-white !py-0.5 !text-xs">🤖 checked by {coaching.model ?? 'the AI coach'}</span>}
      </div>
      {level ? (
        <>
          <div className="mt-3 flex gap-1.5">
            {CEFR_STEPS.map((c) => (
              <div key={c} className={`flex-1 rounded-xl border-2 border-ink py-1.5 text-center font-display text-lg font-bold ${c === level ? 'scale-110 bg-sun shadow-[2px_2px_0_#2d3748]' : 'bg-white opacity-60'}`}>
                {c}
              </div>
            ))}
          </div>
          {est && (
            <ul className="mt-3 space-y-1 text-sm font-semibold">
              {est.reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
              <li className="mt-2 rounded-xl bg-white/80 p-2">➡️ {est.next}</li>
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">A rough guide from {est?.sample ?? 'your'} sentences, not an exam result.</p>
        </>
      ) : (
        <p className="mt-2 text-sm font-semibold text-muted">Say at least three sentences (hold Space) and the coach will estimate your level (CEFR A1 to C1).</p>
      )}
    </div>
  );
}

export function ReviewList({ report, coaching }: { report: SessionReport; coaching?: Coaching }) {
  return (
    <div className="space-y-3">
      {coaching && (
        <div className="rounded-2xl border-[3px] border-ink bg-lavender p-4">
          <div className="mb-1 font-display text-lg font-semibold">🤖 AI coach{coaching.model ? ` (${coaching.model})` : ''} says</div>
          <p className="font-semibold">{coaching.summary}</p>
          {coaching.rewrites.map((r, i) => (
            <div key={i} className="mt-2 rounded-xl bg-white/80 p-2 text-sm">
              <span className="text-muted line-through">{r.original}</span> → <span className="font-bold text-cta-deep">{r.better}</span>
              <div className="text-muted">{r.why}</div>
            </div>
          ))}
        </div>
      )}
      {report.reviews.length === 0 && <p className="text-muted">No transcript this time. Use the mic or chat so the coach can review your English!</p>}
      {report.reviews.map((r) => {
        const v = VERDICT_STYLE[r.verdict];
        return (
          <div key={r.messageId} className="rounded-2xl border-2 border-ink bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border-2 border-ink px-2 py-0.5 text-xs font-bold ${v.cls}`}>{v.label}</span>
              <span className="text-xs font-bold text-muted">
                {levelOf(report.level).roles[r.role].icon} {(r.t / 1000).toFixed(1)}s · mission {r.missionIndex + 1}
              </span>
            </div>
            <p className="mt-1 font-semibold">“{r.text}”</p>
            {r.praise && <p className="mt-1 text-sm font-semibold text-cta-deep">👍 {r.praise}</p>}
            {r.issues.map((i) => (
              <p key={i.type} className="mt-1 text-sm text-ink/80">
                ⚠️ {i.message}
              </p>
            ))}
            {r.suggestion && (
              <p className="mt-1 rounded-xl bg-mint/40 px-2 py-1 text-sm font-bold">
                Try: <span className="text-cta-deep">“{r.suggestion}”</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Results() {
  const client = useGameClient();
  const st = useGame((s) => s.state)!;
  const [info, setInfo] = useState<ServerInfo | null>(null);
  useEffect(() => {
    fetchInfo().then(setInfo).catch(() => undefined);
  }, []);
  const res = st.results;
  const role = st.yourRole;
  const savedWords = useRef('');
  useEffect(() => {
    if (!res || !role) return;
    addSession({
      replayId: res.replayId,
      at: Date.now(),
      role,
      partner: st.settings.mode === 'ai' ? 'ai' : 'friend',
      clarity: res.report.clarity,
      stars: res.report.stars,
      missionsDone: res.report.missionsDone,
      missionsTotal: res.report.missionsTotal,
      mistakes: res.report.mistakes,
      skills: res.report.skills,
      level: st.settings.level,
      cefr: res.coaching?.cefr ?? res.report.cefr?.level,
      lifelines: (res.report.lifelines ?? []).filter((l) => l.role === role).length,
    });
    // Once per game (the results object is re-sent when the LLM coaching arrives).
    if (savedWords.current === res.replayId) return;
    savedWords.current = res.replayId;
    const where = levelOf(st.settings.level).title;
    for (const l of res.report.lifelines ?? []) if (l.role === role) addWord({ en: l.en, zh: l.zh, source: 'lifeline', where });
  }, [res, role, st.settings.mode, st.settings.level]);

  if (!res) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="clay-chip animate-pulse bg-white">Scoring your English…</div>
      </div>
    );
  }
  const r = res.report;
  const replayUrl = shareUrl(info, `/replay/${res.replayId}`);
  const me = st.players.find((p) => p.id === st.you);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-28 pb-16">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="clay-card bg-sun/30 p-6">
          <span className="clay-chip bg-white">{r.missionsDone === r.missionsTotal ? '🏆 All missions done!' : '⏱ Round over'}</span>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-muted">Clarity score</div>
              <div className="font-display text-7xl font-bold">{r.clarity}</div>
              {r.lifelinePenalty ? <div className="text-xs font-bold text-muted">incl. −{r.lifelinePenalty} for 中文求助</div> : null}
            </div>
            <Stars n={r.stars} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              ['Missions', `${r.missionsDone}/${r.missionsTotal}`],
              ['Mistakes', r.mistakes],
              ['Questions', r.questions],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border-2 border-ink bg-white p-2">
                <div className="font-display text-2xl font-bold">{v}</div>
                <div className="text-xs font-bold text-muted">{k}</div>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <SkillBars skills={r.skills} names={r.skillNames} />
          </div>
          <div className="mt-6 rounded-2xl border-2 border-dashed border-ink bg-white p-4">
            <h3 className="font-display text-lg font-semibold">Coach’s top tips</h3>
            <ul className="mt-2 space-y-1.5 text-sm font-semibold">
              {r.tips.map((t) => (
                <li key={t}>💡 {t}</li>
              ))}
            </ul>
            {r.goodPhrases.length > 0 && <p className="mt-3 text-sm">Great phrases you used: {r.goodPhrases.map((p) => <span key={p} className="mr-1 rounded-full bg-mint px-2 py-0.5 font-bold">{p}</span>)}</p>}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={`/replay/${res.replayId}`} className={btn('primary')}>
              ▶ Watch the replay
            </Link>
            {me?.isHost && (
              <button className={btn('secondary')} onClick={() => client.actions.again()}>
                Play again
              </button>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-6">
        <CefrCard report={r} coaching={res.coaching} />
        <BorrowedWords report={r} role={role} />
        <div className="clay-card p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Sentence by sentence</h2>
              <p className="text-sm text-muted">Each sentence is checked from your partner’s point of view.</p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-cream p-2">
              <QRCodeSVG value={replayUrl} size={72} fgColor="#2d3748" />
              <span className="max-w-24 text-xs font-bold">Scan to take your replay home</span>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <ReviewList report={r} coaching={res.coaching} />
          </div>
        </div>
        </section>
      </div>
    </div>
  );
}
