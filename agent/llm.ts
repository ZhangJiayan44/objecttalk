import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { config } from '../server/config';

/**
 * Claude for the Scene Agent: structured planning and a vision review of the
 * reference sheet. Opt-in like the rest of the project (ENABLE_LLM=1 plus
 * ANTHROPIC_API_KEY, optional LLM_BASE_URL gateway). Returns null whenever
 * Claude is unavailable so the agent can fall back to its offline library.
 */

let client: Anthropic | null | undefined;
function getClient() {
  if (client !== undefined) return client;
  client = config.llm.enabled ? new Anthropic({ apiKey: config.llm.apiKey, authToken: null, baseURL: config.llm.baseURL, timeout: 120_000, maxRetries: 1 }) : null;
  return client;
}

export const claudeAvailable = () => !!getClient();

export type Content = string | ({ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: 'image/png' | 'image/jpeg'; data: string } })[];

/** One structured call: the reply is validated against `schema`. */
export async function structured<S extends z.ZodType>(schema: S, system: string, content: Content, maxTokens = 8000): Promise<z.infer<S> | null> {
  const c = getClient();
  if (!c) return null;
  try {
    if (config.llm.compat) {
      // Gateways: plain Messages API, ask for JSON and validate it here.
      const res = await c.messages.create({
        model: config.llm.model,
        max_tokens: maxTokens,
        system: `${system}\nReply with ONLY one JSON object, no prose.`,
        messages: [{ role: 'user', content: content as Anthropic.MessageParam['content'] }],
      });
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      const json = /\{[\s\S]*\}/.exec(text)?.[0];
      const parsed = json ? schema.safeParse(JSON.parse(json)) : null;
      return parsed?.success ? parsed.data : null;
    }
    const stream = c.beta.messages.stream({
      model: config.llm.model,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: 'user', content: content as Anthropic.Beta.BetaMessageParam['content'] }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') return null;
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    console.warn(`   (Claude unavailable: ${(err as Error).message})`);
    return null;
  }
}
