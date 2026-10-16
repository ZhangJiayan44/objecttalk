import { levelOf } from '../../shared/levels';
import type { ChatMessage } from '../../shared/protocol';
import type { Role } from '../../shared/types';
import { config } from '../config';
import type { BotIO } from '../game/engines/types';
import { defaultTransport, runAgent, type LlmTransport, type Toolkit } from './harness';

/**
 * Glue between an AI partner (bot) and the agent harness: builds the prompt
 * from the level, the role and the live dialogue, serialises turns (one
 * model run at a time per partner, newest message wins), records a trace,
 * and hands the turn back to the rule brain whenever Claude is off, slow or
 * says nothing useful.
 */

const NAMES: Record<Role, string> = { guide: 'Nova', builder: 'Pixel' };

function systemPrompt(level: string, role: Role, kit: Toolkit) {
  const meta = levelOf(level);
  const me = meta.roles[role];
  const them = meta.roles[role === 'guide' ? 'builder' : 'guide'];
  return `You are ${NAMES[role]}, the AI partner in ObjectTalk, a two-player 3D game where learners practise SPOKEN English.
Level: "${meta.title}" (${meta.tagline}). You are the ${me.name}: you see ${me.sees} and you ${me.does}.
Your partner is a human learner playing the ${them.name}: they see ${them.sees} and they ${them.does}.

${kit.persona}

How to behave:
- Talk ONLY through the say tool: 1-2 short spoken sentences, at most ~25 words, everyday A2-B1 English. No lists, no emojis.
- React to what your partner actually said this turn. Answer their question first. Never repeat your previous line word for word.
- Ground everything in the world: use your look/check tools before you describe or act. Never invent things that are not in the world, and never mention ids, coordinates, tools or data.
- Act with your action tools when your role can act (that is how the game moves forward), then say briefly what you did.
- If their message needs no answer (like "ok"), do nothing at all.
- Be a good language partner: if they are vague, ask ONE short clarifying question; if they make a mistake, kindly model the better phrase in your answer.
- If they write in Chinese or another language, reply in simple English and give them the English phrase to use.`;
}

function userPrompt(kit: Toolkit, transcript: ChatMessage[], input: string, partnerRole: string) {
  const lines = transcript.map((m) => `${m.role === 'guide' ? 'G' : 'B'} ${m.name}: ${m.text}`).join('\n');
  return `## What you know right now\n${kit.observe()}\n\n## Conversation so far (oldest first; G = guide side, B = builder side)\n${lines || '(nothing yet)'}\n\n## Now\n${input.startsWith('[event]') ? input : `Your partner (${partnerRole}) just said: "${input}"`}\nDecide what to do.`;
}

export class PartnerBrain {
  private busy = false;
  private pending: { input: string; fallback: () => void } | null = null;

  constructor(
    private io: BotIO,
    private level: string,
    private kit: () => Toolkit,
    private transport: LlmTransport | null = config.llm.partner ? defaultTransport() : null,
  ) {}

  get enabled() {
    return !!this.transport;
  }

  /**
   * Let Claude handle the turn. `fallback` runs the rule brain instead when
   * Claude is disabled, fails, times out or decides nothing.
   */
  handle(input: string, fallback: () => void) {
    if (!this.transport) return fallback();
    if (this.busy) {
      // Newest message wins; the older one's fallback is dropped (Claude will see it in the transcript).
      this.pending = { input, fallback };
      return;
    }
    void this.run(input, fallback);
  }

  private async run(input: string, fallback: () => void) {
    this.busy = true;
    const kit = this.kit();
    const partner = levelOf(this.level).roles[this.io.role === 'guide' ? 'builder' : 'guide'].name;
    const outcome = await runAgent(this.transport!, {
      system: systemPrompt(this.level, this.io.role, kit),
      user: userPrompt(kit, this.io.transcript(), input, partner),
      kit,
      timeoutMs: config.llm.partnerTimeoutMs,
      onSay: (text) => this.io.say(text),
    });
    this.io.trace({ brain: 'claude', input, steps: outcome.steps, output: outcome.said.join(' ') || (outcome.error ? `(fallback: ${outcome.error})` : '(no reply)'), ms: outcome.ms });
    this.busy = false;
    const silentButFine = outcome.ok && !outcome.said.length && !outcome.acted && /^(ok|okay|cool|thanks|thank you|alright|got it)[.!]*$/i.test(input.trim());
    if (!outcome.ok || (!outcome.said.length && !outcome.acted && !silentButFine)) fallback();
    const next = this.pending;
    this.pending = null;
    if (next) void this.run(next.input, next.fallback);
  }
}
