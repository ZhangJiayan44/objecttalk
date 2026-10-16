import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { chatWithFallback, type OaiMessage, type OaiToolCall } from '../services/openai-compat';

/**
 * The partner agent harness: a small, bounded tool-use loop around an LLM
 * (DeepSeek / Qwen / GLM via an OpenAI-compatible API, or Claude).
 *
 *   observe -> think -> call grounded tools (look / act) -> say -> stop
 *
 * Guarantees the game relies on:
 *   - bounded: at most `maxSteps` model calls and a hard wall-clock deadline;
 *   - grounded: every tool runs against the authoritative game state, inputs are
 *     schema-checked before they run, unknown tools are refused;
 *   - guarded: `say` passes through a level-specific vetting function (e.g. a guide
 *     line is re-read from the listener's side, a direction is checked against the
 *     walker's heading) and is bounced back to the model when it would mislead;
 *   - optional: with no API key the caller's rule brain answers instead.
 */

export interface JsonSchema {
  type: 'object';
  properties: Record<string, { type: 'string' | 'number' | 'integer' | 'boolean'; description?: string; enum?: (string | number)[] }>;
  required?: string[];
}

export interface AgentTool {
  name: string;
  description: string;
  input_schema: JsonSchema;
  /** True for tools that change the world (pick, walk, serve...), false for look-ups. */
  acts?: boolean;
  run(input: Record<string, unknown>): string | Promise<string>;
}

export interface Toolkit {
  /** Who the agent is in this level and what it is trying to do. */
  persona: string;
  /** A fresh, compact description of the world from this role's point of view. */
  observe(): string;
  tools: AgentTool[];
  /** Return a reason to reject a line before it is spoken, or null to let it through. */
  vetSay?(text: string): string | null;
}

export interface LlmResponse {
  content: { type: string; id?: string; name?: string; input?: unknown; text?: string }[];
  stop_reason: string | null;
}

export interface LlmRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: unknown }[];
  tools: { name: string; description: string; input_schema: JsonSchema }[];
  maxTokens: number;
  signal: AbortSignal;
}

/** The model endpoint. Swappable so the loop can be tested without network. */
export interface LlmTransport {
  readonly model: string;
  create(req: LlmRequest): Promise<LlmResponse>;
}

let shared: LlmTransport | null | undefined;

type Msg = LlmRequest['messages'][number];
type Block = { type: string; id?: string; name?: string; input?: unknown; text?: string; content?: unknown; tool_use_id?: string; is_error?: boolean };

/**
 * Translate the loop's Anthropic-style transcript (text / tool_use / tool_result blocks)
 * into OpenAI chat messages. The loop itself stays provider-neutral.
 */
export function toOpenAiMessages(system: string, messages: Msg[]): OaiMessage[] {
  const out: OaiMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks = (m.content as Block[]) ?? [];
    if (m.role === 'assistant') {
      const text = blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');
      const calls: OaiToolCall[] = blocks
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id ?? '', type: 'function', function: { name: b.name ?? '', arguments: JSON.stringify(b.input ?? {}) } }));
      const reasoning = blocks.find((b) => b.type === 'reasoning')?.text;
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}), ...(reasoning ? { reasoning_content: reasoning } : {}) });
    } else {
      for (const b of blocks) {
        if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: b.tool_use_id ?? '', content: String(b.content ?? '') });
        else if (b.type === 'text') out.push({ role: 'user', content: b.text ?? '' });
      }
    }
  }
  return out;
}

/** Parse tool-call arguments; malformed JSON becomes an input the schema check will reject. */
function parseArgs(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { __invalid_json__: raw.slice(0, 80) };
  }
}

/** An OpenAI-compatible endpoint (DeepSeek, Qwen, GLM, Kimi...). */
function openAiTransport(models: string[]): LlmTransport {
  return {
    model: models[0],
    async create({ system, messages, tools, maxTokens, signal }) {
      const res = await chatWithFallback(models, {
        messages: toOpenAiMessages(system, messages),
        tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })),
        maxTokens,
        signal,
      });
      const msg = res.message;
      const content: LlmResponse['content'] = [];
      if (msg.reasoning_content) content.push({ type: 'reasoning', text: msg.reasoning_content });
      const text = typeof msg.content === 'string' ? msg.content : '';
      if (text) content.push({ type: 'text', text });
      for (const call of msg.tool_calls ?? []) content.push({ type: 'tool_use', id: call.id, name: call.function.name, input: parseArgs(call.function.arguments) });
      return { content, stop_reason: msg.tool_calls?.length ? 'tool_use' : res.finishReason === 'length' ? 'max_tokens' : 'end_turn' };
    },
  };
}

/** Claude through the Anthropic SDK (or an Anthropic-compatible gateway). */
function anthropicTransport(model: string): LlmTransport {
  // authToken: null + explicit baseURL: never inherit a developer's shell credentials or proxy.
  const client = new Anthropic({ apiKey: config.llm.apiKey, authToken: null, baseURL: config.llm.baseURL, timeout: 20_000, maxRetries: 1 });
  return {
    model,
    async create({ system, messages, tools, maxTokens, signal }) {
      if (config.llm.compat) {
        // Anthropic-compatible gateways: plain Messages API, no betas.
        const res = await client.messages.create(
          { model, max_tokens: maxTokens, system, tools: tools as Anthropic.Tool[], messages: messages as Anthropic.MessageParam[] },
          { signal },
        );
        return res as unknown as LlmResponse;
      }
      const res = await client.beta.messages.create(
        {
          model,
          max_tokens: maxTokens,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'low' },
          system,
          tools: tools as Anthropic.Beta.BetaTool[],
          messages: messages as Anthropic.Beta.BetaMessageParam[],
        },
        { signal },
      );
      return res as unknown as LlmResponse;
    },
  };
}

/** The configured transport, or null when no LLM is enabled. */
export function defaultTransport(): LlmTransport | null {
  if (shared !== undefined) return shared;
  if (!config.llm.enabled) return (shared = null);
  shared = config.llm.provider === 'openai' ? openAiTransport(config.llm.models.partner) : anthropicTransport(config.llm.models.partner[0]);
  return shared;
}

/** For tests: replace (or reset with undefined) the transport. */
export function setTransport(t: LlmTransport | null | undefined) {
  shared = t;
}

export interface AgentRun {
  system: string;
  user: string;
  kit: Toolkit;
  maxSteps?: number;
  timeoutMs?: number;
  /** Max lines the agent may speak in one turn. */
  maxSays?: number;
  onSay(text: string): void;
}

export interface AgentOutcome {
  ok: boolean;
  said: string[];
  /** Tools other than say that changed the world. */
  acted: boolean;
  steps: { tool: string; args: string; result: string }[];
  ms: number;
  error?: string;
}

const SAY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { text: { type: 'string', description: 'What you say out loud: one or two short spoken English sentences.' } },
  required: ['text'],
};

/** Minimal JSON-schema check for flat tool inputs. */
export function checkInput(schema: JsonSchema, input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'input must be an object';
  const obj = input as Record<string, unknown>;
  for (const key of schema.required ?? []) if (obj[key] === undefined || obj[key] === null) return `missing "${key}"`;
  for (const [key, value] of Object.entries(obj)) {
    const prop = schema.properties[key];
    if (!prop) return `unknown field "${key}"`;
    if (value === undefined || value === null) continue;
    const ok =
      prop.type === 'string'
        ? typeof value === 'string'
        : prop.type === 'boolean'
          ? typeof value === 'boolean'
          : prop.type === 'integer'
            ? Number.isInteger(value)
            : typeof value === 'number' && Number.isFinite(value);
    if (!ok) return `"${key}" must be a ${prop.type}`;
    if (prop.enum && !prop.enum.includes(value as string | number)) return `"${key}" must be one of ${prop.enum.join(', ')}`;
  }
  return null;
}

/** Speech hygiene: no markdown, no ids, no runaway length. */
export function cleanSpeech(text: string) {
  return text
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export async function runAgent(transport: LlmTransport, run: AgentRun): Promise<AgentOutcome> {
  const started = Date.now();
  const steps: AgentOutcome['steps'] = [];
  const said: string[] = [];
  let acted = false;
  const maxSays = run.maxSays ?? 2;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), run.timeoutMs ?? 9000);

  const sayTool: AgentTool = {
    name: 'say',
    description: 'Speak to your partner. This is the ONLY way they hear you. Keep it short and natural.',
    input_schema: SAY_SCHEMA,
    run: ({ text }) => {
      const line = cleanSpeech(String(text));
      if (!line) return 'Nothing to say.';
      if (said.length >= maxSays) return 'You already spoke enough this turn. Stop now.';
      const problem = run.kit.vetSay?.(line);
      if (problem) return `NOT SAID. ${problem} Rephrase and call say again.`;
      said.push(line);
      run.onSay(line);
      return 'Said.';
    },
  };
  const tools = [...run.kit.tools, sayTool];
  const defs = tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
  const messages: LlmRequest['messages'] = [{ role: 'user', content: run.user }];

  try {
    for (let step = 0; step < (run.maxSteps ?? 4); step++) {
      const res = await transport.create({ system: run.system, messages, tools: defs, maxTokens: 1024, signal: controller.signal });
      // Echo the assistant turn back unchanged (thinking / reasoning blocks included).
      messages.push({ role: 'assistant', content: res.content });
      if (res.stop_reason === 'refusal') break;
      const uses = res.content.filter((b) => b.type === 'tool_use');
      if (!uses.length) {
        const text = cleanSpeech(
          res.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join(' '),
        );
        // Some models answer in plain text instead of calling say: still vet it.
        if (text && !said.length && !acted) {
          const problem = run.kit.vetSay?.(text);
          if (!problem) {
            said.push(text);
            run.onSay(text);
          }
        }
        break;
      }
      const results: { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }[] = [];
      for (const use of uses) {
        const tool = tools.find((t) => t.name === use.name);
        let result: string;
        let isError = false;
        if (!tool) {
          result = `There is no tool called ${use.name}.`;
          isError = true;
        } else {
          const bad = checkInput(tool.input_schema, use.input);
          if (bad) {
            result = `Invalid input: ${bad}.`;
            isError = true;
          } else {
            try {
              result = await tool.run(use.input as Record<string, unknown>);
              if (tool.acts) acted = true;
            } catch (err) {
              result = `Tool failed: ${(err as Error).message}`;
              isError = true;
            }
          }
        }
        steps.push({ tool: use.name ?? '?', args: JSON.stringify(use.input ?? {}).slice(0, 240), result: result.slice(0, 300) });
        results.push({ type: 'tool_result', tool_use_id: use.id ?? '', content: result, ...(isError ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: results });
      if (res.stop_reason !== 'tool_use') break;
    }
    return { ok: true, said, acted, steps, ms: Date.now() - started };
  } catch (err) {
    const error = controller.signal.aborted ? 'timeout' : (err as Error).message;
    return { ok: false, said, acted, steps, ms: Date.now() - started, error };
  } finally {
    clearTimeout(deadline);
  }
}
