/**
 * Browser stand-in for server/agent/harness.ts in the static build: there is
 * no LLM transport, so PartnerBrain always hands the turn to the rule brain.
 * The types are the real ones (type-only import, erased at build time).
 */
import type { LlmTransport } from '../../../server/agent/harness';

export type { AgentTool, JsonSchema, LlmTransport, Toolkit } from '../../../server/agent/harness';

export const defaultTransport = (): LlmTransport | null => null;

export async function runAgent(): Promise<{ ok: boolean; said: string[]; acted: boolean; steps: { tool: string; args: string; result: string }[]; ms: number; error?: string }> {
  return { ok: false, said: [], acted: false, steps: [], ms: 0, error: 'no LLM in the static build' };
}
