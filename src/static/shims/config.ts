/**
 * Browser stand-in for server/config.ts in the static GitHub Pages build:
 * no secrets, no environment, no LLM. The AI partners use their offline rule
 * brains and the Chinese lifeline its offline glossary.
 */
export const config = {
  llm: {
    enabled: false,
    provider: 'openai' as const,
    partner: false,
    partnerTimeoutMs: 9000,
    models: { partner: [] as string[], coach: [] as string[], planner: [] as string[], vision: [] as string[] },
  },
  rodin: { apiKey: '', base: '', tier: '' },
};
