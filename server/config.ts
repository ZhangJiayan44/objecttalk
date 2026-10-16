import { existsSync } from 'node:fs';
import path from 'node:path';

// Load a local .env when present (Node >= 20.12). Real deployments use real env vars.
// Tests stay deterministic and offline: they never read the developer's .env (vitest sets VITEST).
if (existsSync('.env') && !process.env.VITEST) process.loadEnvFile('.env');

function parseIce(raw: string | undefined) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { urls: string | string[]; username?: string; credential?: string }[];
  } catch {
    console.warn('[config] ICE_SERVERS is not valid JSON, ignoring');
    return null;
  }
}

function parseJsonObject(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    console.warn('[config] LLM_EXTRA_BODY is not a JSON object, ignoring');
    return {};
  }
}

/** "http://host:3888" -> "http://host:3888/v1"; keeps explicit versioned paths as they are. */
export function openaiBase(url: string) {
  const u = url.trim().replace(/\/+$/, '');
  return /\/v\d+[a-z]*$/i.test(u) ? u : `${u}/v1`;
}

const llmProvider: 'openai' | 'anthropic' = process.env.LLM_PROVIDER === 'anthropic' || process.env.LLM_PROVIDER === 'openai' ? process.env.LLM_PROVIDER : process.env.LLM_API_KEY ? 'openai' : 'anthropic';
const llmOff = /^(0|false|off)$/i.test(process.env.ENABLE_LLM ?? '');
const llmOn = /^(1|true|on)$/i.test(process.env.ENABLE_LLM ?? '');
const claudeModel = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5';

/** "a,b" -> ["a","b"]; each job tries its models in order (the next one when a channel fails). */
function modelList(raw: string | undefined, openaiDefaults: string[]): string[] {
  const list = (raw ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  if (list.length) return list;
  return llmProvider === 'openai' ? openaiDefaults : [claudeModel];
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  /** Public base URL used in QR codes when deployed (e.g. https://objecttalk.example.com). */
  publicUrl: process.env.PUBLIC_URL || null,
  /** Port the Vite dev server listens on; used to build LAN join links in development. */
  devClientPort: Number(process.env.DEV_CLIENT_PORT ?? 5173),
  dataDir: path.resolve(process.env.DATA_DIR ?? 'data'),
  clientDir: path.resolve(process.env.CLIENT_DIR ?? 'dist/client'),
  rodin: {
    apiKey: process.env.RODIN_API_KEY || '',
    base: process.env.RODIN_API_BASE ?? 'https://api.hyper3d.com/api/v2',
    tier: process.env.RODIN_TIER ?? 'Gen-2.5-Medium',
  },
  llm: {
    provider: llmProvider,
    /**
     * OpenAI-compatible gateways (DeepSeek, Qwen, GLM, Kimi...) switch on as soon as LLM_API_KEY is
     * set. Claude stays an explicit opt-in (ENABLE_LLM=1 + ANTHROPIC_API_KEY): developer shells often
     * export unrelated Claude credentials. ENABLE_LLM=0 always turns the LLM layer off.
     */
    enabled: !llmOff && (llmProvider === 'openai' ? !!process.env.LLM_API_KEY : llmOn && !!process.env.ANTHROPIC_API_KEY),
    apiKey: (llmProvider === 'openai' ? process.env.LLM_API_KEY : process.env.ANTHROPIC_API_KEY) ?? '',
    /**
     * OpenAI-compatible: LLM_BASE_URL (".../v1" is added when missing). Claude: ANTHROPIC_GATEWAY_URL.
     * ANTHROPIC_BASE_URL is ignored on purpose, so a developer's shell never redirects the game.
     */
    baseURL: llmProvider === 'openai' ? openaiBase(process.env.LLM_BASE_URL || 'https://api.deepseek.com') : process.env.ANTHROPIC_GATEWAY_URL || 'https://api.anthropic.com',
    /** Claude through a non-Anthropic gateway: plain Messages API, no betas. */
    compat: llmProvider === 'anthropic' && !!process.env.ANTHROPIC_GATEWAY_URL && !/(^|\.)anthropic\.com/i.test(process.env.ANTHROPIC_GATEWAY_URL),
    /**
     * Models per job, tried in order. Defaults (OpenAI-compatible) were benchmarked on the project gateway:
     *   partner  deepseek-v4-flash  live AI partner, tool calls, ~1 s per step with thinking off
     *   coach    deepseek-v4-pro    post-game rewrites + CEFR, JSON output
     *   planner  deepseek-v4-pro    Scene Agent level plans, JSON output
     *   vision   qwen3.6-35b-a3b    Scene Agent reference review (open-weight Qwen3.6 MoE, image input);
     *                               6/6 on a sheet with planted bad references, ~2 s
     */
    models: {
      partner: modelList(process.env.LLM_MODEL, ['deepseek-v4-flash', 'bailian/deepseek-v4.1-flash']),
      coach: modelList(process.env.LLM_COACH_MODEL, ['deepseek-v4-pro', 'deepseek-v4-flash']),
      planner: modelList(process.env.LLM_PLANNER_MODEL, ['deepseek-v4-pro', 'deepseek-v4-flash']),
      vision: modelList(process.env.LLM_VISION_MODEL, ['qwen3.6-35b-a3b', 'qwen3.8-27b']),
    },
    /** Reasoning ("thinking") mode for OpenAI-compatible models. Off keeps the live partner fast. */
    thinking: /^(1|true|on)$/i.test(process.env.LLM_THINKING ?? ''),
    /** Extra JSON merged into every OpenAI-compatible request body (provider-specific switches). */
    extraBody: parseJsonObject(process.env.LLM_EXTRA_BODY),
    /** Let the LLM drive the AI partner's replies (tool-use agent). Off: the LLM only coaches. */
    partner: !/^(0|false|off)$/i.test(process.env.LLM_PARTNER ?? ''),
    /** Hard deadline for one partner turn (the rule brain answers if the model is slower). */
    partnerTimeoutMs: Number(process.env.LLM_PARTNER_TIMEOUT_MS ?? 9000),
  },
  iceServers: parseIce(process.env.ICE_SERVERS) ?? [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.qq.com:3478'] }],
  isProd: process.env.NODE_ENV === 'production',
};
