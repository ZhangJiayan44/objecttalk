import type { ChatMessage, FxEvent, HoverEvent } from '../../../shared/protocol';
import type { Pose } from '../../../shared/city';
import type { AnyMission, Bot, BotIO } from '../engines/types';

/**
 * Shared plumbing for the AI partners: timers that die with the round, a
 * speech queue that never repeats itself word for word, a small dialogue
 * memory, and a classifier for the conversational moves every level needs
 * (greetings, thanks, yes/no, "say that again", "what?").
 */

export type Timer = { handle: ReturnType<typeof setTimeout> };

export type DialogAct = 'greet' | 'thanks' | 'yes' | 'no' | 'repeat' | 'confused' | 'wait' | 'done' | 'other';

const ACTS: [DialogAct, RegExp][] = [
  ['repeat', /\b(say (?:that|it) again|repeat|pardon|sorry\?|come again|one more time|again\?)\b/],
  ['confused', /\b(what\?|huh|i don'?t (?:understand|get it)|confus|what do you mean|not sure what)\b/],
  ['wait', /\b(wait|hold on|one (?:sec|second|moment)|just a (?:sec|second|moment))\b/],
  ['done', /\b(done|finished|that'?s (?:all|it|everything))\b/],
  ['thanks', /^(?:ok(?:ay)?[,! ]*)?(thanks?|thank you|cheers|great,? thanks)\b/],
  ['greet', /^(hi|hello|hey|good (?:morning|afternoon|evening))\b/],
  ['yes', /^(yes|yeah|yep|yup|right|correct|exactly|sure|ok(?:ay)?|that'?s (?:it|right|the one)|uh-huh)\b/],
  ['no', /^(no|nope|nah|not (?:that|this|quite)|wrong|the other)\b/],
];

export function dialogAct(text: string): DialogAct {
  const t = text.toLowerCase().trim();
  for (const [act, re] of ACTS) if (re.test(t)) return act;
  return 'other';
}

/** Short utterances that carry no new content ("ok", "thanks", "cool"). */
export function isBackchannel(text: string) {
  return /^(ok(?:ay)?|cool|nice|great|alright|got it|sure|thanks?|thank you|mm+|uh-huh|i see|right)[.! ]*$/i.test(text.trim());
}

export abstract class BaseBot implements Bot {
  private timers = new Set<Timer>();
  private recent: string[] = [];
  protected lastLine = '';
  protected lastSpokeAt = 0;
  protected disposed = false;

  constructor(protected io: BotIO) {}

  abstract onMissionStart(m: AnyMission): void;
  abstract onChat(msg: ChatMessage): void;
  onHover?(e: HoverEvent): void;
  onPose?(p: Pose): void;
  abstract onFx(e: FxEvent): void;

  protected later(ms: number, fn: () => void, pauseWhileListening = true): Timer {
    const run = () => {
      if (this.disposed) return;
      if (pauseWhileListening && this.io.listening?.()) {
        t.handle = setTimeout(run, 100);
      } else {
        this.timers.delete(t);
        fn();
      }
    };
    const t: Timer = { handle: setTimeout(run, ms) };
    this.timers.add(t);
    return t;
  }

  protected cancel(t: Timer | null | undefined) {
    if (!t) return;
    clearTimeout(t.handle);
    this.timers.delete(t);
  }

  /** Say one of the options, avoiding anything said in the last few lines. */
  protected sayOne(options: string[]) {
    const fresh = options.filter((o) => !this.recent.includes(o));
    this.say(this.io.rng.pick(fresh.length ? fresh : options));
  }

  protected say(text: string) {
    if (this.disposed || !text) return;
    // Two triggers for the same answer (e.g. two questions in a row): say it once.
    if (text === this.lastLine && Date.now() - this.lastSpokeAt < 4000) return;
    this.lastLine = text;
    this.lastSpokeAt = Date.now();
    this.recent.push(text);
    if (this.recent.length > 6) this.recent.shift();
    this.io.say(text);
  }

  /** Seconds since this bot last spoke. */
  protected quietFor() {
    return (Date.now() - this.lastSpokeAt) / 1000;
  }

  protected traceRules(input: string, steps: { tool: string; args: string; result: string }[], output: string, started = Date.now()) {
    this.io.trace({ brain: 'rules', input, steps, output, ms: Date.now() - started });
  }

  dispose() {
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t.handle);
    this.timers.clear();
  }
}

export const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
