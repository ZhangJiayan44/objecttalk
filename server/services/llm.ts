import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { SessionReport } from '../../shared/analysis';
import { levelOf } from '../../shared/levels';
import { config } from '../config';

/**
 * Optional Claude coach. The rule-based report (shared/analysis.ts,
 * shared/coach.ts) is always there; when ENABLE_LLM=1 and an API key are set,
 * Claude adds a short personal summary, rewrites of the player's weakest
 * sentences and a second opinion on the CEFR estimate. The live AI partner
 * uses the agent harness in server/agent instead.
 */

// authToken: null + explicit baseURL: never inherit a developer's shell credentials or proxy.
const client = config.llm.enabled ? new Anthropic({ apiKey: config.llm.apiKey, authToken: null, baseURL: config.llm.baseURL, timeout: 30_000, maxRetries: 1 }) : null;

export const llmEnabled = () => !!client;

const Coaching = z.object({
  summary: z.string().describe('two sentences of encouraging, specific feedback'),
  rewrites: z
    .array(z.object({ original: z.string(), better: z.string(), why: z.string() }))
    .describe("up to 3 of the player's unclear sentences, rewritten so the partner understands them at once"),
  cefr: z.enum(['A1', 'A2', 'B1', 'B2', 'C1']).describe("the CEFR band the player's sentences sound like"),
});
export type Coaching = z.infer<typeof Coaching>;

const SYSTEM = `You are a friendly English speaking coach for teenagers and university students who just played a two-player English game.
Be concrete and short, use simple English, and quote the player's own words. Rewrites must keep the player's meaning but make it clear from the PARTNER's point of view.`;

/** Personalised coaching on top of the rule-based report. Returns null when unavailable or on any failure. */
export async function coachWithClaude(report: SessionReport): Promise<Coaching | null> {
  if (!client) return null;
  const level = levelOf(report.level);
  const lines = report.reviews
    .map((r) => `[${r.role}] "${r.text}" -> ${r.verdict}${r.issues.length ? ` (${r.issues.map((i) => i.type).join(', ')})` : ''}${r.suggestion ? ` | model answer: ${r.suggestion}` : ''}`)
    .join('\n');
  if (!lines) return null;
  const user = `Level: ${level.title} (${level.tagline}; skills: ${level.skills.join(', ')}).
Score ${report.clarity}/100, ${report.missionsDone}/${report.missionsTotal} missions, ${report.mistakes} mistakes.
Rule-based CEFR estimate: ${report.cefr ? `${report.cefr.level} (${report.cefr.reasons.join('; ')})` : 'not enough speech'}.
Transcript review:
${lines}`;
  try {
    if (config.llm.compat) {
      // Gateways without structured outputs: ask for JSON and validate it ourselves.
      const res = await client.messages.create({
        model: config.llm.model,
        max_tokens: 2048,
        system: `${SYSTEM}\nAnswer with ONLY a JSON object: {"summary": string, "rewrites": [{"original": string, "better": string, "why": string}], "cefr": "A1"|"A2"|"B1"|"B2"|"C1"}.`,
        messages: [{ role: 'user', content: user }],
      });
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      const json = /\{[\s\S]*\}/.exec(text)?.[0];
      const parsed = json ? Coaching.safeParse(JSON.parse(json)) : null;
      return parsed?.success ? { ...parsed.data, rewrites: parsed.data.rewrites.slice(0, 3) } : null;
    }
    const res = await client.beta.messages.parse({
      model: config.llm.model,
      max_tokens: 4096,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'low', format: betaZodOutputFormat(Coaching) },
      messages: [{ role: 'user', content: user }],
    });
    if (res.stop_reason === 'refusal') return null;
    const out = res.parsed_output;
    return out ? { ...out, rewrites: out.rewrites.slice(0, 3) } : null;
  } catch (err) {
    console.warn('[llm] coaching failed:', (err as Error).message);
    return null;
  }
}
