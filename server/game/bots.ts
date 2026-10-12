import { getKind, kindPlural } from '../../shared/catalog';
import { parseUtterance, type ParsedUtterance } from '../../shared/nlu';
import type { ChatMessage, FxEvent, Held, HoverEvent } from '../../shared/protocol';
import { cap, describeCell, describeObject, realizePlace, realizeRef, type Candidate, type Voice } from '../../shared/reg';
import type { Rng } from '../../shared/rng';
import { toFrame } from '../../shared/room';
import { entityLabel, freeCells, resolvePlace, resolveRef, sceneEntities } from '../../shared/spatial';
import { sameCell, type Cell, type Difficulty, type Mission, type PlaceDesc, type RefDesc, type Role, type SceneState } from '../../shared/types';
import { interpretInstruction } from '../services/llm';

/**
 * AI partners. Both run on the same spatial-language engine as the coach,
 * so they "think" in exactly the perspective rules the game teaches.
 *  - AiGuide (Nova) describes targets from the builder's side, reacts to what
 *    the builder points at, answers clarifying questions. On "tricky" it
 *    sometimes speaks from its OWN side to train "my left or your left?".
 *  - AiBuilder (Pixel) follows the human guide's instructions, asks which one
 *    when a description is ambiguous, and asks whose left when it's unmarked.
 */

export interface BotContext {
  difficulty: Difficulty;
  rng: Rng;
  scene(): SceneState | null;
  mission(): Mission | null;
  held(): Held | null;
  say(text: string): void;
  hover(e: HoverEvent): void;
  pick(objectId: string): void;
  place(cell: Cell): void;
}

export interface Bot {
  onMissionStart(m: Mission): void;
  onChat(msg: ChatMessage): void;
  onHover(e: HoverEvent): void;
  onFx(e: FxEvent): void;
  dispose(): void;
}

const G2B: Voice = { speaker: 'guide', listener: 'builder' };
const B2G: Voice = { speaker: 'builder', listener: 'guide' };

abstract class BaseBot {
  private timers = new Set<ReturnType<typeof setTimeout>>();
  constructor(protected ctx: BotContext) {}

  protected later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  protected cancel(t: ReturnType<typeof setTimeout> | null) {
    if (!t) return;
    clearTimeout(t);
    this.timers.delete(t);
  }

  dispose() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}

/** Turn listener-side wording into the classic mistake: the speaker's own side, unmarked. */
function egocentric<T extends RefDesc | PlaceDesc>(desc: T): T {
  const copy = structuredClone(desc);
  if (copy.rel && copy.rel.view !== 'none') copy.rel.view = 'unmarked';
  if ('sup' in copy && copy.sup) copy.sup.view = 'unmarked';
  return copy;
}

function nudge(from: Cell, to: Cell): string {
  const a = toFrame(from, 'builder');
  const b = toFrame(to, 'builder');
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const parts: string[] = [];
  if (dx) parts.push(`${Math.abs(dx) === 1 ? 'one spot' : `${Math.abs(dx)} spots`} to your ${dx > 0 ? 'right' : 'left'}`);
  if (dy) parts.push(dy > 0 ? 'closer to you' : 'farther from you');
  return parts.length ? `Almost! Move it ${parts.join(' and ')}.` : 'Yes, right there!';
}

// ---------------------------------------------------------------------------
// AI guide
// ---------------------------------------------------------------------------

class AiGuide extends BaseBot implements Bot {
  private level = 0;
  private lastLine = '';
  private usedEgocentric = false;
  private hoverObj: string | null = null;
  private hoverCell: Cell | null = null;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHoverComment = 0;

  onMissionStart(m: Mission) {
    this.level = 0;
    this.usedEgocentric = false;
    this.hoverObj = null;
    this.hoverCell = null;
    this.later(m.index === 0 ? 1200 : 900, () => this.instruct(m));
  }

  private objectCands(id: string) {
    const scene = this.ctx.scene();
    return scene ? describeObject(scene, id, G2B, 8) : [];
  }

  private cellCands(cell: Cell, movingId: string) {
    const scene = this.ctx.scene();
    return scene ? describeCell(scene, cell, movingId, G2B, 8) : [];
  }

  /** Choose the wording for the current clarification level. */
  private choose<T>(cands: Candidate<T>[]): Candidate<T> | undefined {
    const pool = this.ctx.difficulty === 'easy' ? [...cands.filter((c) => !c.perspective), ...cands.filter((c) => c.perspective)] : cands;
    return pool[Math.min(this.level, pool.length - 1)];
  }

  /** On tricky, sometimes describe from the guide's own side without saying so. */
  private trap(kind: 'object' | 'cell', m: Mission): string | null {
    if (this.ctx.difficulty !== 'tricky' || this.level > 0 || !this.ctx.rng.chance(0.6)) return null;
    const scene = this.ctx.scene();
    if (!scene) return null;
    const entities = sceneEntities(scene);
    if (kind === 'object' && m.type === 'find') {
      const own = describeObject(scene, m.targetId, { speaker: 'builder', listener: 'guide' }, 8).find((c) => c.perspective);
      if (!own) return null;
      const desc = egocentric(own.desc);
      const builderReads = resolveRef(desc, entities, 'builder');
      if (builderReads.length === 1 && builderReads[0].id === m.targetId) return null;
      return realizeRef(desc, G2B);
    }
    if (kind === 'cell' && m.type === 'place') {
      const own = describeCell(scene, m.targetCell, m.itemId, { speaker: 'builder', listener: 'guide' }, 8).find((c) => c.perspective);
      if (!own) return null;
      return realizePlace(egocentric(own.desc), G2B);
    }
    return null;
  }

  private instruct(m: Mission) {
    const live = this.ctx.mission();
    if (!live || live.id !== m.id) return;
    let text = '';
    const opener = this.ctx.rng.pick(['Okay!', 'Alright!', 'Ready?', 'Here we go!']);
    if (m.type === 'find') {
      const trap = this.trap('object', m);
      if (trap) {
        this.usedEgocentric = true;
        text = `${opener} Pick up ${trap}.`;
      } else {
        const c = this.choose(this.objectCands(m.targetId));
        text = c ? (this.level === 0 ? `${opener} Pick up ${c.text}.` : `I mean ${c.text}.`) : m.modelAnswer;
      }
    } else {
      const item = this.objectCands(m.itemId)[0];
      const trap = this.trap('cell', m);
      const cell = this.choose(this.cellCands(m.targetCell, m.itemId));
      const where = trap ?? cell?.text;
      if (trap) this.usedEgocentric = true;
      const held = this.ctx.held();
      if (held?.objectId === m.itemId) text = `Now put it ${where}.`;
      else if (item && where) text = this.level === 0 ? `${opener} Take ${item.text} and put it ${where}.` : `Move ${item.text}. It goes ${where}.`;
      else text = m.modelAnswer;
    }
    this.lastLine = text;
    this.ctx.say(text);
  }

  onChat(msg: ChatMessage) {
    if (msg.role !== 'builder') return;
    const m = this.ctx.mission();
    if (!m) return;
    const p = parseUtterance(msg.text, B2G);
    if (p.intent === 'question') {
      if (p.question === 'frame') {
        if (this.usedEgocentric) {
          this.usedEgocentric = false;
          this.level++;
          this.ctx.say("Oops, sorry! I meant MY side. From your side it's the other way round.");
          this.later(1100, () => this.instruct(m));
        } else this.ctx.say('Your side! I always describe things the way YOU see them.');
        return;
      }
      if (p.question === 'repeat') return this.ctx.say(this.lastLine);
      if (p.question === 'check') return this.judgeHover(true);
      this.level++;
      this.instruct(m);
      return;
    }
    if (/\b(ok|okay|got it|sure|alright|ready|thanks|thank you)\b/i.test(msg.text)) return;
    const scene = this.ctx.scene();
    if (scene && p.target && m.type === 'find') {
      const hits = resolveRef(p.target, sceneEntities(scene), 'builder').filter((e) => !e.landmark);
      if (hits.length === 1) this.ctx.say(hits[0].id === m.targetId ? 'Yes, exactly that one!' : 'No, not that one.');
    }
  }

  onHover(e: HoverEvent) {
    this.hoverObj = e.objectId;
    this.hoverCell = e.cell;
    this.cancel(this.hoverTimer);
    this.hoverTimer = this.later(1200, () => this.judgeHover(false));
  }

  /** React to what the builder is pointing at, like a partner watching over the table. */
  private judgeHover(asked: boolean) {
    const m = this.ctx.mission();
    const scene = this.ctx.scene();
    if (!m || !scene) return;
    if (!asked && Date.now() - this.lastHoverComment < 3500) return;
    const objects = scene.objects;
    const held = this.ctx.held();
    let line: string | null = null;
    if (m.type === 'find' && this.hoverObj) {
      const target = objects.find((o) => o.id === m.targetId);
      const hovered = objects.find((o) => o.id === this.hoverObj);
      if (this.hoverObj === m.targetId) line = this.ctx.rng.pick(['Yes! That one.', 'That one, yes!', 'Yep, you got it, click it!']);
      else if (asked || hovered?.kind === target?.kind) {
        this.level++;
        const c = this.choose(this.objectCands(m.targetId));
        line = `Not that one. I mean ${c?.text ?? 'the other one'}.`;
      }
    } else if (m.type === 'place') {
      if (!held && this.hoverObj) {
        if (this.hoverObj === m.itemId) line = "Yes, that's the one to move!";
        else if (asked) line = 'No, not that one.';
      } else if (held?.objectId === m.itemId && this.hoverCell) {
        line = sameCell(this.hoverCell, m.targetCell) ? 'Yes, right there!' : nudge(this.hoverCell, m.targetCell);
      }
    }
    if (line) {
      this.lastHoverComment = Date.now();
      this.ctx.say(line);
    }
  }

  onFx(e: FxEvent) {
    const m = this.ctx.mission();
    if (e.type === 'success') {
      this.ctx.say(this.ctx.rng.pick(['Great job!', 'Perfect!', 'Nice one!', 'You got it!']));
      return;
    }
    if (!m) return;
    if (e.type === 'wrong') {
      this.level++;
      this.usedEgocentric = false;
      this.later(500, () => {
        if (m.type === 'find') {
          const c = this.choose(this.objectCands(m.targetId));
          this.ctx.say(`Oops, not that one. I mean ${c?.text ?? 'the other one'}.`);
        } else {
          const c = this.choose(this.cellCands(m.targetCell, m.itemId));
          this.ctx.say(e.message === 'Wrong object!' ? `That's the wrong object. ${cap(this.objectCands(m.itemId)[0]?.text ?? 'the other one')}!` : `Not quite. It goes ${c?.text ?? 'somewhere else'}.`);
        }
      });
    }
    if (e.type === 'pick' && m.type === 'place') {
      if (e.objectId === m.itemId) {
        const c = this.choose(this.cellCands(m.targetCell, m.itemId));
        if (c) this.later(400, () => this.ctx.say(`That's it! Now put it ${c.text}.`));
      } else this.later(400, () => this.ctx.say(`Hmm, not that one. I need ${this.objectCands(m.itemId)[0]?.text ?? 'another one'}.`));
    }
  }
}

// ---------------------------------------------------------------------------
// AI builder
// ---------------------------------------------------------------------------

type Pending = { kind: 'pick'; ids: string[]; idx: number } | { kind: 'place'; cells: Cell[]; idx: number };

class AiBuilder extends BaseBot implements Bot {
  private pending: Pending | null = null;
  private awaitingFrame: ParsedUtterance | null = null;
  private lastObject: string | null = null;
  private greeted = false;
  private commitTimer: ReturnType<typeof setTimeout> | null = null;

  onMissionStart(m: Mission) {
    this.pending = null;
    this.awaitingFrame = null;
    this.cancel(this.commitTimer);
    if (!this.greeted) {
      this.greeted = true;
      this.later(900, () => this.ctx.say("Hi, I'm Pixel! I can't see the target. Tell me exactly what to do."));
    } else this.later(700, () => this.ctx.say(m.type === 'find' ? 'Ready! Which one should I pick up?' : 'Ready! What should I move, and where?'));
  }

  onChat(msg: ChatMessage) {
    if (msg.role !== 'guide') return;
    const m = this.ctx.mission();
    if (!m || !this.ctx.scene()) return;
    const p = parseUtterance(msg.text, G2B);

    if (this.awaitingFrame) {
      const frame = /\b(your|yours)\b/i.test(msg.text) ? 'builder' : /\b(my|mine|me)\b/i.test(msg.text) ? 'guide' : null;
      if (frame) {
        const prev = this.awaitingFrame;
        this.awaitingFrame = null;
        this.ctx.say(frame === 'guide' ? 'Got it, your side. So for me it is the other way round.' : 'Okay, my side!');
        void this.act(prev, frame);
        return;
      }
      this.awaitingFrame = null;
    }
    if (p.intent === 'confirm') {
      if (this.pending) this.commit();
      return;
    }
    if (p.intent === 'deny') {
      if (this.pending) this.nextCandidate();
      return;
    }
    if (p.intent === 'question') {
      this.ctx.say("I can't see the target, only you can! Describe it for me.");
      return;
    }
    if (p.unmarked.length && this.shouldAskFrame()) {
      this.awaitingFrame = p;
      const raw = p.unmarked[0];
      const word = /left/.test(raw) ? 'left' : /right/.test(raw) ? 'right' : /front/.test(raw) ? '"in front"' : /behind|back/.test(raw) ? '"behind"' : 'side';
      this.ctx.say(`Wait, do you mean MY ${word} or YOUR ${word}?`);
      return;
    }
    // Default: people assume their own point of view, and so does Pixel.
    void this.act(p, 'builder');
  }

  private shouldAskFrame() {
    const d = this.ctx.difficulty;
    return d === 'easy' ? true : d === 'normal' ? this.ctx.rng.chance(0.65) : this.ctx.rng.chance(0.25);
  }

  private label(id: string) {
    const o = this.ctx.scene()?.objects.find((x) => x.id === id);
    return o ? entityLabel({ ...o, landmark: false }) : 'that one';
  }

  private preview(id: string) {
    this.pending = { kind: 'pick', ids: [id], idx: 0 };
    this.later(500, () => {
      this.ctx.hover({ objectId: id, cell: null });
      this.ctx.say(`This one? The ${this.label(id)}.`);
      this.cancel(this.commitTimer);
      this.commitTimer = this.later(2200, () => this.commit());
    });
  }

  private previewCell(cells: Cell[], idx: number) {
    this.pending = { kind: 'place', cells, idx };
    this.later(500, () => {
      this.ctx.hover({ objectId: null, cell: cells[idx] });
      this.ctx.say(cells.length > 1 ? `There are ${cells.length} spots like that. Here?` : 'Putting it here?');
      this.cancel(this.commitTimer);
      this.commitTimer = this.later(cells.length > 1 ? 3200 : 2000, () => this.commit());
    });
  }

  private commit() {
    const p = this.pending;
    this.cancel(this.commitTimer);
    if (!p) return;
    this.pending = null;
    if (p.kind === 'pick') {
      this.lastObject = p.ids[p.idx];
      this.ctx.pick(p.ids[p.idx]);
    } else this.ctx.place(p.cells[p.idx]);
  }

  private nextCandidate() {
    const p = this.pending;
    this.cancel(this.commitTimer);
    if (!p) return;
    if (p.kind === 'place' && p.idx + 1 < p.cells.length) return this.previewCell(p.cells, p.idx + 1);
    this.pending = null;
    this.ctx.hover({ objectId: null, cell: null });
    this.ctx.say('Oh, okay. Which one then? Give me a landmark.');
  }

  private askWhich(ids: string[]) {
    const scene = this.ctx.scene()!;
    const opts = ids.slice(0, 2).map((id) => {
      const cands = describeObject(scene, id, B2G, 8);
      return (cands.find((c) => !c.perspective) ?? cands[0])?.text ?? `the ${this.label(id)}`;
    });
    const kind = scene.objects.find((o) => o.id === ids[0])?.kind ?? '';
    this.ctx.say(`I see ${ids.length} ${kindPlural(kind)}. Do you mean ${opts[0]} or ${opts[1]}?`);
  }

  private async act(p: ParsedUtterance, reading: Role) {
    const m = this.ctx.mission();
    const scene = this.ctx.scene();
    if (!m || !scene) return;
    const entities = sceneEntities(scene);
    const held = this.ctx.held();
    let objectId: string | null = null;

    if (p.target && !(p.target.deictic && !p.target.kind && !p.target.color)) {
      const hits = resolveRef(p.target, entities, reading).filter((e) => !e.landmark);
      if (hits.length > 1) return this.askWhich(hits.map((h) => h.id));
      if (hits.length === 1) objectId = hits[0].id;
      else if (!p.place) return this.fallback(p);
    } else if (p.target?.deictic || m.type === 'place') objectId = held?.objectId ?? this.lastObject;

    if (m.type === 'find') {
      if (!objectId) return this.fallback(p);
      return this.preview(objectId);
    }

    if (!p.place) {
      if (objectId && held?.objectId !== objectId) {
        this.lastObject = objectId;
        this.ctx.pick(objectId);
        this.ctx.say(`Got the ${this.label(objectId)}. Where should it go?`);
      } else if (!objectId) return this.fallback(p);
      else this.ctx.say('Where should I put it?');
      return;
    }
    const moving = objectId ?? held?.objectId ?? null;
    if (!moving) return this.ctx.say('Which object should I move?');
    if (held?.objectId !== moving) this.ctx.pick(moving);
    this.lastObject = moving;
    const cells = resolvePlace(p.place, entities, freeCells(scene, moving), reading, moving);
    if (!cells.length) return this.ctx.say("Hmm, I'm not sure where that is. Can you use a landmark, like the lamp?");
    this.previewCell(cells, 0);
  }

  /** The rule parser found nothing usable: ask Claude (if configured), else ask the human. */
  private async fallback(p: ParsedUtterance) {
    const m = this.ctx.mission();
    const scene = this.ctx.scene();
    if (!m || !scene) return;
    const llm = await interpretInstruction({ text: p.text, scene, missionType: m.type, heldId: this.ctx.held()?.objectId ?? null });
    const live = this.ctx.mission();
    if (!live || live.id !== m.id) return;
    if (llm && llm.intent !== 'unclear') {
      if (llm.intent === 'question') return this.ctx.say(llm.reply);
      if (llm.intent === 'pick' && llm.objectId && scene.objects.some((o) => o.id === llm.objectId)) {
        if (m.type === 'find') return this.preview(llm.objectId);
        this.lastObject = llm.objectId;
        this.ctx.pick(llm.objectId);
        return this.ctx.say(llm.reply || 'Got it. Where should it go?');
      }
      if (llm.intent === 'place' && llm.cell) {
        const moving = llm.objectId ?? this.ctx.held()?.objectId ?? this.lastObject;
        if (moving && freeCells(scene, moving).some((c) => sameCell(c, llm.cell))) {
          if (this.ctx.held()?.objectId !== moving) this.ctx.pick(moving);
          return this.previewCell([llm.cell], 0);
        }
      }
    }
    this.ctx.say(this.ctx.rng.pick(["Sorry, I didn't get that. Which object, and what is it next to?", 'Can you name the object and a landmark near it?']));
  }

  onHover() {}

  onFx(e: FxEvent) {
    if (e.type === 'wrong') this.later(300, () => this.ctx.say(this.ctx.rng.pick(['Oops, sorry!', 'Hmm, wrong one. Tell me more?', 'Oh no! Which one is it?'])));
    if (e.type === 'success') this.ctx.say(this.ctx.rng.pick(['Yay!', 'We did it!', 'Teamwork!']));
  }
}

export function createBot(role: Role, ctx: BotContext): Bot {
  return role === 'guide' ? new AiGuide(ctx) : new AiBuilder(ctx);
}

/** Exposed for tests. */
export const __test = { nudge, egocentric, getKind };
