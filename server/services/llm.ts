import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { SessionReport } from '../../shared/analysis';
import { levelOf } from '../../shared/levels';
import { config } from '../config';
import { chatWithFallback, parseJsonReply, textOf } from './openai-compat';

/**
 * Optional LLM coach. The rule-based report (shared/analysis.ts,
 * shared/coach.ts) is always there; with an LLM configured (an
 * OpenAI-compatible key such as DeepSeek, or Claude), the coach adds a short
 * personal summary, rewrites of the player's weakest sentences and a second
 * opinion on the CEFR estimate. The live AI partner uses the agent harness in
 * server/agent instead.
 */

const anthropic =
  config.llm.enabled && config.llm.provider === 'anthropic'
    ? // authToken: null + explicit baseURL: never inherit a developer's shell credentials or proxy.
      new Anthropic({ apiKey: config.llm.apiKey, authToken: null, baseURL: config.llm.baseURL, timeout: 30_000, maxRetries: 1 })
    : null;

export const llmEnabled = () => config.llm.enabled;

/** Short label for the startup log and /api/info. */
export const llmLabel = () => (config.llm.enabled ? `${config.llm.provider === 'openai' ? 'OpenAI-compatible' : 'Claude'}: partner ${config.llm.models.partner[0]} · coach ${config.llm.models.coach[0]}` : '');

const Coaching = z.object({
  summary: z.string().describe('two sentences of encouraging, specific feedback'),
  rewrites: z
    .array(z.object({ original: z.string(), better: z.string(), why: z.string() }))
    .describe("up to 3 of the player's unclear sentences, rewritten so the partner understands them at once"),
  cefr: z.enum(['A1', 'A2', 'B1', 'B2', 'C1']).describe("the CEFR band the player's sentences sound like"),
});
export type Coaching = z.infer<typeof Coaching> & { model?: string };

const SYSTEM = `You are a friendly English speaking coach for teenagers and university students who just played a two-player English game.
Be concrete and short, use simple English, and quote the player's own words. Rewrites must keep the player's meaning but make it clear from the PARTNER's point of view.`;

const JSON_SHAPE = `Answer with ONLY a JSON object: {"summary": string, "rewrites": [{"original": string, "better": string, "why": string}], "cefr": "A1"|"A2"|"B1"|"B2"|"C1"}.`;

/** Personalised coaching on top of the rule-based report. Returns null when unavailable or on any failure. */
export async function coachWithLlm(report: SessionReport): Promise<Coaching | null> {
  if (!config.llm.enabled) return null;
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
    let out: Coaching | null = null;
    if (config.llm.provider === 'openai') {
      const res = await chatWithFallback(config.llm.models.coach, {
        messages: [
          { role: 'system', content: `${SYSTEM}\n${JSON_SHAPE}` },
          { role: 'user', content: user },
        ],
        json: true,
        maxTokens: 2000,
        timeoutMs: 45_000,
      });
      const parsed = Coaching.safeParse(parseJsonReply(textOf(res.message)));
      out = parsed.success ? parsed.data : null;
    } else if (anthropic && config.llm.compat) {
      // Claude through a gateway without structured outputs: ask for JSON and validate it here.
      const res = await anthropic.messages.create({ model: config.llm.models.coach[0], max_tokens: 2048, system: `${SYSTEM}\n${JSON_SHAPE}`, messages: [{ role: 'user', content: user }] });
      const parsed = Coaching.safeParse(parseJsonReply(res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')));
      out = parsed.success ? parsed.data : null;
    } else if (anthropic) {
      const res = await anthropic.beta.messages.parse({
        model: config.llm.models.coach[0],
        max_tokens: 4096,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        output_config: { effort: 'low', format: betaZodOutputFormat(Coaching) },
        messages: [{ role: 'user', content: user }],
      });
      if (res.stop_reason !== 'refusal') out = res.parsed_output ?? null;
    }
    return out ? { ...out, rewrites: out.rewrites.slice(0, 3), model: config.llm.models.coach[0] } : null;
  } catch (err) {
    console.warn('[llm] coaching failed:', (err as Error).message);
    return null;
  }
}
