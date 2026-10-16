import { config } from '../config';

/**
 * Minimal client for OpenAI-compatible chat APIs (DeepSeek, Qwen, GLM, Kimi
 * and the gateways that serve them). Plain fetch, no SDK: the game only needs
 * chat completions with tools, JSON output and image inputs.
 *
 * Thinking ("reasoning") is switched off by default so the live AI partner
 * answers in about a second; the matching switch is sent per model family.
 */

export type OaiContent = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];

export interface OaiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface OaiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: OaiContent | null;
  tool_calls?: OaiToolCall[];
  tool_call_id?: string;
  /** Some reasoning models want their own reasoning echoed back on the next tool step. */
  reasoning_content?: string;
}

export interface OaiTool {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

export interface ChatRequest {
  model: string;
  messages: OaiMessage[];
  tools?: OaiTool[];
  maxTokens?: number;
  json?: boolean;
  thinking?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ChatResponse {
  message: OaiMessage;
  finishReason: string | null;
  model: string;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Provider switch for turning reasoning on or off, by model family. */
export function thinkingParams(model: string, on: boolean): Record<string, unknown> {
  const m = model.toLowerCase();
  if (/qwen|qwq|qvq/.test(m)) return { enable_thinking: on };
  if (/deepseek|glm|kimi|moonshot|doubao|seed|minimax|mimo/.test(m)) return { thinking: { type: on ? 'enabled' : 'disabled' } };
  return {};
}

export const llmConfigured = () => config.llm.enabled && config.llm.provider === 'openai';

/** One chat completion. Throws LlmError on HTTP or transport failure. */
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    max_tokens: req.maxTokens ?? 1024,
    ...thinkingParams(req.model, req.thinking ?? config.llm.thinking),
    ...(req.tools?.length ? { tools: req.tools, tool_choice: 'auto' } : {}),
    ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    ...config.llm.extraBody,
  };
  const timeout = AbortSignal.timeout(req.timeoutMs ?? 60_000);
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
  const res = await fetch(`${config.llm.baseURL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.llm.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: OaiMessage; finish_reason?: string | null }[];
    model?: string;
    error?: { message?: string } | string;
  } | null;
  if (!res.ok || !json?.choices?.length) {
    const msg = typeof json?.error === 'string' ? json.error : json?.error?.message;
    throw new LlmError(`LLM HTTP ${res.status}${msg ? `: ${msg.slice(0, 200)}` : ''}`, res.status);
  }
  const choice = json.choices[0];
  return { message: choice.message ?? { role: 'assistant', content: '' }, finishReason: choice.finish_reason ?? null, model: json.model ?? req.model };
}

/**
 * Try each model in turn: the next one is used when a gateway channel is missing or failing
 * (HTTP 4xx/5xx other than auth/quota, or a timeout). Auth errors stop immediately.
 */
export async function chatWithFallback(models: string[], req: Omit<ChatRequest, 'model'>): Promise<ChatResponse> {
  let last: unknown = null;
  for (const model of models) {
    try {
      return await chat({ ...req, model });
    } catch (err) {
      last = err;
      if (req.signal?.aborted) throw err;
      if (err instanceof LlmError && (err.status === 401 || err.status === 402 || err.status === 403)) throw err;
    }
  }
  throw last instanceof Error ? last : new LlmError('no model available');
}

/** The first JSON object in a reply (models sometimes wrap it in a code fence). */
export function parseJsonReply(text: string | null | undefined): unknown {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const raw = fenced ?? text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export const textOf = (m: OaiMessage) => (typeof m.content === 'string' ? m.content : (m.content ?? []).map((c) => (c.type === 'text' ? c.text : '')).join(''));
