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

const ASSIST_SYSTEM = `You help a Chinese learner of English who is stuck in a two-player speaking game. They wrote what they want to say in Chinese.
Reply with ONLY the English sentence they should say to their partner: short (max 14 words), natural, A2-B1 level, polite, and true to their meaning.
Keep game vocabulary exact (object names, left/right, numbers, sizes). No quotes, no explanation, no Chinese.`;

/**
 * Chinese lifeline: turn a stuck player's Chinese into the English line they should say.
 * `context` names the level and the things in it, so object words match the game.
 * Returns null when no LLM is configured or the call fails (the caller falls back to the glossary).
 */
export async function assistWithLlm(zh: string, context: string): Promise<string | null> {
  if (!config.llm.enabled) return null;
  const user = `Game context: ${context}\nChinese: ${zh}`;
  try {
    let text = '';
    if (config.llm.provider === 'openai') {
      const res = await chatWithFallback(config.llm.models.partner, {
        messages: [
          { role: 'system', content: ASSIST_SYSTEM },
          { role: 'user', content: user },
        ],
        maxTokens: 80,
        timeoutMs: 8000,
      });
      text = textOf(res.message);
    } else if (anthropic) {
      const res = await anthropic.messages.create({ model: config.llm.models.partner[0], max_tokens: 120, system: ASSIST_SYSTEM, messages: [{ role: 'user', content: user }] });
      text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    }
    const line = text
      .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
      .split('\n')[0]
      .trim();
    // Guard: an English line without Chinese characters, of a sensible length.
    if (!line || /[㐀-䶿一-鿿]/.test(line) || line.length > 160) return null;
    return line;
  } catch (err) {
    console.warn('[llm] lifeline failed:', (err as Error).message);
    return null;
  }
}

const IdentifySchema = z.object({
  ok: z.boolean().describe('true if the photo shows ONE clear, physical object that fits on a table'),
  name: z.string().describe('the simple English noun phrase a learner should use, lowercase, e.g. "panda mug"'),
  plural: z.string().describe('its correct plural, e.g. "panda mugs"'),
  zh: z.string().describe('the Simplified Chinese name, e.g. "熊猫杯"'),
  synonyms: z.array(z.string()).describe('2-4 other lowercase words people use for it, e.g. ["mug", "cup"]'),
  color: z.enum(['red', 'blue', 'yellow', 'green', 'pink', 'purple', 'orange', 'white', 'brown']).describe('its main colour'),
  example: z.string().describe('one short A2 sentence that describes where it could be, e.g. "The panda mug is next to the lamp."'),
  tip: z.string().describe('if ok is false: a short tip to take a better photo; else an empty string'),
});
export type Identified = z.infer<typeof IdentifySchema>;

/**
 * Object Studio, step 1: the open-weight vision model looks at the player's photo and teaches
 * the word before Rodin builds the model (name, plural, Chinese, an example sentence), and
 * rejects photos Rodin would turn into a bad model. Null when no LLM is configured.
 */
export async function identifyObject(image: Uint8Array, mime: string): Promise<Identified | null> {
  if (!config.llm.enabled || config.llm.provider !== 'openai') return null;
  const system = `You help Chinese teenagers learn English with a 3D game. A player photographed an object to turn it into a 3D model (image-to-3D).
Name the object in simple everyday English (the word a learner needs), and judge the photo: ok=false if it shows several separate objects, a person or animal you would not keep on a table, a screen/screenshot, text only, or is too dark/blurry/cropped.
Reply with ONLY one JSON object with the keys: ok, name, plural, zh, synonyms, color, example, tip.`;
  try {
    const res = await chatWithFallback(config.llm.models.vision, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mime};base64,${Buffer.from(image).toString('base64')}` } }, { type: 'text', text: 'What is this object?' }] },
      ],
      maxTokens: 400,
      timeoutMs: 30_000,
    });
    const raw = parseJsonReply(textOf(res.message)) as Partial<Record<keyof Identified, unknown>> | null;
    // A rejected photo often comes back as {"ok": false, everything else null}: still useful.
    if (raw && raw.ok === false)
      return { ok: false, name: '', plural: '', zh: '', synonyms: [], color: 'white', example: '', tip: typeof raw.tip === 'string' && raw.tip ? raw.tip : 'Show ONE object on a plain background, fully in the frame, in good light.' };
    const parsed = IdentifySchema.safeParse(raw);
    if (!parsed.success) return null;
    const d = parsed.data;
    return { ...d, name: d.name.toLowerCase().slice(0, 32), plural: d.plural.toLowerCase().slice(0, 40), synonyms: d.synonyms.map((s) => s.toLowerCase()).slice(0, 4) };
  } catch (err) {
    console.warn('[llm] identify failed:', (err as Error).message);
    return null;
  }
}
