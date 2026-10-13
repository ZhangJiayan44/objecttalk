import { existsSync } from 'node:fs';
import path from 'node:path';

// Load a local .env when present (Node >= 20.12). Real deployments use real env vars.
if (existsSync('.env')) process.loadEnvFile('.env');

function parseIce(raw: string | undefined) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { urls: string | string[]; username?: string; credential?: string }[];
  } catch {
    console.warn('[config] ICE_SERVERS is not valid JSON, ignoring');
    return null;
  }
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
    // Explicit opt-in: never pick up credentials that merely happen to be in the shell
    // (e.g. a developer's own CLI session). Needs ENABLE_LLM=1 plus ANTHROPIC_API_KEY.
    enabled: /^(1|true|on)$/i.test(process.env.ENABLE_LLM ?? '') && !!process.env.ANTHROPIC_API_KEY,
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
    /**
     * Optional Anthropic-compatible gateway (e.g. a regional proxy or a provider with an
     * Anthropic-style endpoint). Read from LLM_BASE_URL on purpose, NOT ANTHROPIC_BASE_URL,
     * so a developer's shell configuration never redirects the game's traffic by accident.
     */
    baseURL: process.env.LLM_BASE_URL || 'https://api.anthropic.com',
    /** Gateways usually lack Anthropic betas (server-side fallback, effort): send plain requests. */
    compat: !!process.env.LLM_BASE_URL && !/(^|\.)anthropic\.com/i.test(process.env.LLM_BASE_URL),
    /** Let Claude drive the AI partner's replies (tool-use agent). Off: Claude only coaches. */
    partner: !/^(0|false|off)$/i.test(process.env.LLM_PARTNER ?? ''),
    /** Hard deadline for one partner turn (the rule brain answers if Claude is slower). */
    partnerTimeoutMs: Number(process.env.LLM_PARTNER_TIMEOUT_MS ?? 9000),
  },
  iceServers: parseIce(process.env.ICE_SERVERS) ?? [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.qq.com:3478'] }],
  isProd: process.env.NODE_ENV === 'production',
};
