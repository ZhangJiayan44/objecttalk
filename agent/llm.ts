import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config } from '../server/config';
import { chatWithFallback, parseJsonReply, textOf, type OaiContent } from '../server/services/openai-compat';

/**
 * The Scene Agent's LLM layer: structured planning and a vision review of the
 * reference sheet. Works with an OpenAI-compatible gateway (DeepSeek for
 * planning, an open-weight Qwen3.6 multimodal model for vision) or with
 * Claude. Returns null whenever no LLM is available so the agent falls back to
 * its offline library and the human review gate.
 */

export const llmAvailable = () => config.llm.enabled;

/** Which models do what, for the run log and the published level's provenance. */
export function llmDescribe(job: 'planner' | 'vision') {
  return `${config.llm.provider === 'openai' ? '' : 'Claude '}${config.llm.models[job][0]}`;
}

export type Content = string | ({ type: 'text'; text: string } | { type: 'image'; mediaType: 'image/png' | 'image/jpeg'; data: string })[];

let claude: Anthropic | null | undefined;
function claudeClient() {
  if (claude !== undefined) return claude;
  claude =
    config.llm.enabled && config.llm.provider === 'anthropic'
      ? // authToken: null + explicit baseURL: never inherit a developer's shell credentials or proxy.
        new Anthropic({ apiKey: config.llm.apiKey, authToken: null, baseURL: config.llm.baseURL, timeout: 120_000, maxRetries: 1 })
      : null;
  return claude;
}

/** A compact, model-readable description of the expected JSON (top-level keys + nested shapes). */
function shapeOf(schema: z.ZodType): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' }));
  } catch {
    return 'the requested JSON object';
  }
}

/**
 * One structured call: the reply is validated against `schema`.
 * `job` picks the model list: the planner for text, the vision model for images.
 */
export async function structured<S extends z.ZodType>(schema: S, system: string, content: Content, opts: { job?: 'planner' | 'vision'; maxTokens?: number } = {}): Promise<z.infer<S> | null> {
  if (!config.llm.enabled) return null;
  const job = opts.job ?? (typeof content !== 'string' && content.some((c) => c.type === 'image') ? 'vision' : 'planner');
  const maxTokens = opts.maxTokens ?? 8000;
  try {
    if (config.llm.provider === 'openai') {
      const user: OaiContent =
        typeof content === 'string'
          ? content
          : content.map((c) => (c.type === 'text' ? { type: 'text' as const, text: c.text } : { type: 'image_url' as const, image_url: { url: `data:${c.mediaType};base64,${c.data}` } }));
      const res = await chatWithFallback(config.llm.models[job], {
        messages: [
          { role: 'system', content: `${system}\nReply with ONLY one JSON object (no prose, no code fence) that matches this JSON Schema:\n${shapeOf(schema)}` },
          { role: 'user', content: user },
        ],
        json: job === 'planner',
        maxTokens,
        timeoutMs: 180_000,
      });
      const parsed = schema.safeParse(parseJsonReply(textOf(res.message)));
      if (!parsed.success) console.warn(`   (${job} reply did not match the schema: ${parsed.error.issues[0]?.message ?? 'invalid'})`);
      return parsed.success ? parsed.data : null;
    }
    const c = claudeClient();
    if (!c) return null;
    const blocks =
      typeof content === 'string'
        ? content
        : content.map((b) => (b.type === 'text' ? { type: 'text' as const, text: b.text } : { type: 'image' as const, source: { type: 'base64' as const, media_type: b.mediaType, data: b.data } }));
    if (config.llm.compat) {
      // Claude through a gateway: plain Messages API, ask for JSON and validate it here.
      const res = await c.messages.create({
        model: config.llm.models[job][0],
        max_tokens: maxTokens,
        system: `${system}\nReply with ONLY one JSON object, no prose.`,
        messages: [{ role: 'user', content: blocks as Anthropic.MessageParam['content'] }],
      });
      const parsed = schema.safeParse(parseJsonReply(res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')));
      return parsed.success ? parsed.data : null;
    }
    const stream = c.beta.messages.stream({
      model: config.llm.models[job][0],
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: 'user', content: blocks as Anthropic.Beta.BetaMessageParam['content'] }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') return null;
    const parsed = schema.safeParse(JSON.parse(msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    console.warn(`   (LLM unavailable: ${(err as Error).message})`);
    return null;
  }
}
