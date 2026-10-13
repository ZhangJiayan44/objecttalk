import { kindName, kindPlural } from '../../../shared/catalog';
import { parseUtterance, type ParsedUtterance } from '../../../shared/nlu';
import type { ChatMessage, FxEvent, Held, HoverEvent } from '../../../shared/protocol';
import { cap, describeCell, describeObject, realizePlace, realizeRef, type Candidate, type Voice } from '../../../shared/reg';
import { COLS, ROWS, toFrame } from '../../../shared/room';
import { entityLabel, freeCells, resolvePlace, resolveRef, sceneEntities } from '../../../shared/spatial';
import { sameCell, type Cell, type Mission, type PlaceDesc, type RefDesc, type Role, type SceneState } from '../../../shared/types';
import type { Toolkit } from '../../agent/harness';
import { PartnerBrain } from '../../agent/partner';
import type { AnyMission, Bot, BotIO } from '../engines/types';
import { BaseBot, dialogAct, isBackchannel, type Timer } from './common';

/**
 * Tabletop AI partners (Cozy Study + agent-made tabletop levels).
 *  - Nova (AI guide) describes targets from the builder's side, answers what
 *    the builder actually asks ("the big one?", "my left or yours?"), reacts to
 *    what they point at, and on "tricky" sometimes slips into her OWN side.
 *  - Pixel (AI builder) follows instructions literally, asks "which one?" when
 *    a description fits several objects and "my left or your left?" when a
 *    direction has no owner.
 * With an LLM configured both hand their turns to the agent harness first, with
 * grounded tools; the rule brain below is the always-available fallback.
 */

export interface TableCtx {
  scene(): SceneState | null;
  mission(): Mission | null;
  held(): Held | null;
  hover(e: HoverEvent): void;
  pick(objectId: string): void;
  place(cell: Cell): void;
}

const G2B: Voice = { speaker: 'guide', listener: 'builder' };
const B2G: Voice = { speaker: 'builder', listener: 'guide' };

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

/** Words for a cell from the builder's side: "front row, second from your left". */
function cellWords(cell: Cell): string {
  const f = toFrame(cell, 'builder');
  const row = f.y === ROWS - 1 ? 'the row closest to you' : f.y === 0 ? 'the far row' : 'the middle row';
  const col = f.x === 0 ? 'far left' : f.x === COLS - 1 ? 'far right' : f.x < (COLS - 1) / 2 ? 'left side' : f.x > (COLS - 1) / 2 ? 'right side' : 'middle';
  return `${row}, ${col}`;
}

const isContentful = (d?: RefDesc) => !!d && !!(d.kind || d.color || d.size || d.rel || d.sup);

// ---------------------------------------------------------------------------
// AI guide
// ---------------------------------------------------------------------------

class AiGuide extends BaseBot {
  private level = 0;
  private usedEgocentric = false;
  private hoverObj: string | null = null;
  private hoverCell: Cell | null = null;
  private hoverTimer: Timer | null = null;
  private lastHoverComment = 0;
  private lastInstruction = '';
  private brain: PartnerBrain;

  constructor(
    io: BotIO,
    private ctx: TableCtx,
    level: string,
  ) {
    super(io);
    this.brain = new PartnerBrain(io, level, () => this.toolkit());
  }

  onMissionStart(m: AnyMission) {
    if (m.type !== 'find' && m.type !== 'place') return;
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
    const pool = this.io.difficulty === 'easy' ? [...cands.filter((c) => !c.perspective), ...cands.filter((c) => c.perspective)] : cands;
    return pool[Math.min(this.level, pool.length - 1)];
  }

  /** On tricky, sometimes describe from the guide's own side without saying so. */
  private trap(kind: 'object' | 'cell', m: Mission): string | null {
    if (this.io.difficulty !== 'tricky' || this.level > 0 || !this.io.rng.chance(0.6)) return null;
    const scene = this.ctx.scene();
    if (!scene) return null;
    const entities = sceneEntities(scene);
    if (kind === 'object' && m.type === 'find') {
      const own = describeObject(scene, m.targetId, B2G, 8).find((c) => c.perspective);
      if (!own) return null;
      const desc = egocentric(own.desc);
      const builderReads = resolveRef(desc, entities, 'builder');
      if (builderReads.length === 1 && builderReads[0].id === m.targetId) return null;
      return realizeRef(desc, G2B);
    }
    if (kind === 'cell' && m.type === 'place') {
      const own = describeCell(scene, m.targetCell, m.itemId, B2G, 8).find((c) => c.perspective);
      if (!own) return null;
      return realizePlace(egocentric(own.desc), G2B);
    }
    return null;
  }

  private instruct(m: Mission) {
    const live = this.ctx.mission();
    if (!live || live.id !== m.id) return;
    let text = '';
    const opener = this.io.rng.pick(['Okay!', 'Alright!', "Let's go!", 'Here we go!']);
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
    this.lastInstruction = text;
    this.say(text);
  }

  onChat(msg: ChatMessage) {
    if (msg.role !== 'builder' || !this.ctx.mission()) return;
    this.brain.handle(msg.text, () => this.rules(msg.text));
  }

  /** The id the builder should be dealing with right now. */
  private wantedId(m: Mission) {
    return m.type === 'find' ? m.targetId : m.itemId;
  }

  /** Rule brain: answer the builder's actual words first, the pointer second. */
  private rules(text: string) {
    const started = Date.now();
    const m = this.ctx.mission();
    const scene = this.ctx.scene();
    if (!m || !scene) return;
    const steps: { tool: string; args: string; result: string }[] = [];
    const reply = (line: string) => {
      this.say(line);
      this.traceRules(text, steps, line, started);
    };
    const act = dialogAct(text);
    const p = parseUtterance(text, B2G);
    steps.push({ tool: 'parse', args: text, result: `${p.intent}${p.question ? `/${p.question}` : ''}${p.target ? ` target=${JSON.stringify(p.target)}` : ''}` });

    if (p.intent === 'question' && p.question === 'frame') {
      if (this.usedEgocentric) {
        this.usedEgocentric = false;
        this.level++;
        reply("Oops, sorry! I meant MY side. From your side it's the other way round.");
        this.later(1100, () => this.instruct(m));
      } else reply('Your side! I always describe things the way YOU see them.');
      return;
    }
    if (act === 'repeat' || p.question === 'repeat') return reply(this.lastInstruction || this.lastLine);
    if (isBackchannel(text)) return this.traceRules(text, steps, '(nothing to answer)', started);

    const entities = sceneEntities(scene);
    const held = this.ctx.held();
    const wanted = this.wantedId(m);
    const stillChoosing = m.type === 'find' || held?.objectId !== m.itemId;

    // "the big one or the small one?": answer with the half that is right.
    const halves = text.split(/\bor\b/i);
    if (halves.length === 2 && stillChoosing) {
      const options = halves.map((h) => parseUtterance(h, B2G).target);
      const hit = options.findIndex((o) => {
        if (!isContentful(o)) return false;
        const r = resolveRef({ kind: o!.kind ?? scene.objects.find((x) => x.id === wanted)?.kind, ...o }, entities, 'builder').filter((e) => !e.landmark);
        return r.length >= 1 && r.every((e) => e.id === wanted);
      });
      steps.push({ tool: 'choice', args: halves.join(' | '), result: hit >= 0 ? `option ${hit + 1}` : 'neither' });
      if (hit >= 0) {
        const o = options[hit]!;
        const word = o.size ?? o.color ?? (o.sup ? realizeRef({ sup: o.sup }, B2G) : null);
        return reply(word ? `The ${word} one!` : `The ${hit === 0 ? 'first' : 'second'} one!`);
      }
    }

    // The builder named an object: confirm or correct THAT object.
    if (isContentful(p.target) && stillChoosing) {
      const hits = resolveRef(p.target!, entities, 'builder').filter((e) => !e.landmark);
      steps.push({ tool: 'resolve', args: JSON.stringify(p.target), result: hits.map((h) => entityLabel(h)).join(', ') || 'nothing' });
      if (hits.length === 1) {
        if (hits[0].id === wanted) {
          const next = m.type === 'place' ? ` Pick it up and I'll tell you where it goes.` : ' Click it!';
          return reply(`${this.io.rng.pick(['Yes!', 'Exactly!', 'Yes, that one!'])}${next}`);
        }
        this.level++;
        const c = this.choose(this.objectCands(wanted));
        return reply(`No, not the ${entityLabel(hits[0])}. I mean ${c?.text ?? 'the other one'}.`);
      }
      if (hits.length > 1) {
        const c = this.objectCands(wanted).find((x) => x.desc.rel || x.desc.sup) ?? this.objectCands(wanted)[0];
        if (hits.some((h) => h.id === wanted)) return reply(`Yes, a ${kindName(hits[0].kind)}, but there are ${hits.length}. I mean ${c?.text ?? 'the other one'}.`);
        return reply(`No, it's not one of those. I mean ${c?.text ?? 'another one'}.`);
      }
      if (p.target!.kind && !entities.some((e) => e.kind === p.target!.kind)) {
        const c = this.objectCands(wanted)[0];
        return reply(`Hmm, there's no ${kindName(p.target!.kind)} here. Look for ${c?.text ?? 'the other one'}.`);
      }
    }

    // "Here?" / "This one?" while pointing: judge what they point at.
    if ((p.question === 'check' || /\b(here|this one|that one)\b/i.test(text)) && (this.hoverObj || this.hoverCell)) return this.judgeHover(true, text);

    // Asking where the held item goes.
    if (m.type === 'place' && held?.objectId === m.itemId && (p.intent === 'question' || /\bwhere\b/i.test(text))) {
      const c = this.choose(this.cellCands(m.targetCell, m.itemId));
      return reply(`Put it ${c?.text ?? 'in the empty spot I showed you'}.`);
    }

    if (p.intent === 'question') {
      if (p.question === 'check' && (this.hoverObj || this.hoverCell)) return this.judgeHover(true, text);
      this.level++;
      const c = m.type === 'place' && held?.objectId === m.itemId ? this.choose(this.cellCands(m.targetCell, m.itemId)) : this.choose(this.objectCands(wanted));
      return reply(c ? `${m.type === 'place' && held?.objectId === m.itemId ? 'It goes' : 'I mean'} ${c.text}.` : this.lastInstruction);
    }
    if (/\b(can'?t|cannot|don'?t) (?:find|see)\b|\blost\b|\bhelp\b/i.test(text)) {
      this.level++;
      const c = this.choose(this.objectCands(wanted));
      const obj = scene.objects.find((o) => o.id === wanted);
      return reply(`No problem. It's ${c?.text ?? 'the one I said'}${obj ? `, in ${cellWords(obj.cell)}` : ''}.`);
    }
    this.traceRules(text, steps, '(listening)', started);
  }

  onHover(e: HoverEvent) {
    this.hoverObj = e.objectId;
    this.hoverCell = e.cell;
    this.cancel(this.hoverTimer);
    this.hoverTimer = this.later(1200, () => this.judgeHover(false));
  }

  /** React to what the builder is pointing at, like a partner watching over the table. */
  private judgeHover(asked: boolean, input = '(watching the pointer)') {
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
      if (this.hoverObj === m.targetId) line = this.io.rng.pick(['Yes! That one.', 'That one, yes!', 'Yep, you got it, click it!']);
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
      this.say(line);
      this.traceRules(input, [{ tool: 'look_pointer', args: this.hoverObj ?? JSON.stringify(this.hoverCell), result: line }], line);
    }
  }

  onFx(e: FxEvent) {
    const m = this.ctx.mission();
    if (e.type === 'success') {
      this.sayOne(['Great job!', 'Perfect!', 'Nice one!', 'You got it!', 'Brilliant teamwork!']);
      return;
    }
    if (!m) return;
    if (e.type === 'wrong') {
      this.level++;
      this.usedEgocentric = false;
      this.later(500, () => {
        if (m.type === 'find') {
          const c = this.choose(this.objectCands(m.targetId));
          this.say(`Oops, not that one. I mean ${c?.text ?? 'the other one'}.`);
        } else {
          const c = this.choose(this.cellCands(m.targetCell, m.itemId));
          this.say(e.message === 'Wrong object!' ? `That's the wrong object. ${cap(this.objectCands(m.itemId)[0]?.text ?? 'the other one')}!` : `Not quite. It goes ${c?.text ?? 'somewhere else'}.`);
        }
      });
    }
    if (e.type === 'pick' && m.type === 'place') {
      if (e.objectId === m.itemId) {
        const c = this.choose(this.cellCands(m.targetCell, m.itemId));
        if (c) this.later(400, () => this.say(`That's it! Now put it ${c.text}.`));
      } else this.later(400, () => this.say(`Hmm, not that one. I need ${this.objectCands(m.itemId)[0]?.text ?? 'another one'}.`));
    }
  }

  // ---------------------------------------------------------------- LLM tools
  private toolkit(): Toolkit {
    const io = this.io;
    return {
      persona: `You can see the gold target. Your partner stands on the OTHER side of the table, facing you: their left is YOUR right, their "in front" is YOUR "behind".
Describe from THEIR side ("on your left", "closer to you") or with landmarks (lamp, plant, red book, blue book). Before describing, call describe_target: it returns wordings already verified to be unique from your partner's side. If you improvise, test it with check_line first.
${io.difficulty === 'tricky' ? 'Difficulty is TRICKY: once per mission you may describe from your OWN side without saying so, to train your partner to ask "my left or your left?". If they ask, admit it kindly and fix it.' : ''}`,
      observe: () => this.observe(),
      tools: [
        {
          name: 'describe_target',
          description: 'Get descriptions of what your partner must find or move (and where it goes), already checked to be unique from THEIR side, best first.',
          input_schema: { type: 'object', properties: {} },
          run: () => {
            const m = this.ctx.mission();
            if (!m) return 'No mission right now.';
            const obj = this.objectCands(this.wantedId(m))
              .slice(0, 4)
              .map((c) => c.text);
            const out = [`object: ${obj.join(' | ')}`];
            if (m.type === 'place')
              out.push(
                `destination: ${this.cellCands(m.targetCell, m.itemId)
                  .slice(0, 4)
                  .map((c) => c.text)
                  .join(' | ')}`,
              );
            return out.join('\n');
          },
        },
        {
          name: 'check_line',
          description: 'Before saying an instruction you wrote yourself, check how your partner would understand it from THEIR side of the table.',
          input_schema: { type: 'object', properties: { text: { type: 'string', description: 'the sentence you plan to say' } }, required: ['text'] },
          run: ({ text }) => this.readAsPartner(String(text)) ?? 'Clear: it points at exactly the right thing from their side.',
        },
        {
          name: 'look_partner',
          description: 'See what your partner is pointing at or holding right now.',
          input_schema: { type: 'object', properties: {} },
          run: () => {
            const scene = this.ctx.scene();
            const held = this.ctx.held();
            const label = (id: string | null) => {
              const o = id ? scene?.objects.find((x) => x.id === id) : undefined;
              return o ? `the ${entityLabel({ ...o, landmark: false })}` : null;
            };
            const parts = [held ? `holding ${label(held.objectId)}` : 'holding nothing'];
            if (this.hoverObj) parts.push(`pointing at ${label(this.hoverObj)}`);
            if (this.hoverCell && held) parts.push(`hovering the spot in ${cellWords(this.hoverCell)}`);
            return parts.join('; ');
          },
        },
      ],
      vetSay: (text) => this.readAsPartner(text),
    };
  }

  /** null if the line is fine; otherwise why it would mislead the partner. */
  private readAsPartner(text: string): string | null {
    const m = this.ctx.mission();
    const scene = this.ctx.scene();
    if (!m || !scene) return null;
    const p = parseUtterance(text, G2B);
    const entities = sceneEntities(scene);
    const held = this.ctx.held();
    if (isContentful(p.target) && !(m.type === 'place' && held?.objectId === m.itemId && !p.place)) {
      const hits = resolveRef(p.target!, entities, 'builder').filter((e) => !e.landmark);
      const wanted = this.wantedId(m);
      // On tricky, Nova may knowingly use her own side once: that is the lesson, not a bug.
      if (this.io.difficulty === 'tricky' && p.unmarked.length && !this.usedEgocentric) {
        this.usedEgocentric = true;
        return null;
      }
      if (hits.length === 1 && hits[0].id !== wanted && !/\bnot\b/i.test(text)) return `From your partner's side that means the ${entityLabel(hits[0])}, which is the wrong object.`;
      if (hits.length > 1 && hits.some((h) => h.id === wanted) && !/\bnot\b/i.test(text)) return `From your partner's side that fits ${hits.length} objects. Add a landmark or "your left/right".`;
    }
    if (p.place && m.type === 'place') {
      const cells = resolvePlace(p.place, entities, freeCells(scene, m.itemId), 'builder', m.itemId);
      if (cells.length === 1 && !sameCell(cells[0], m.targetCell)) return 'From your partner\'s side that spot is the wrong one (remember: their left is your right).';
      if (cells.length > 1 && cells.some((c) => sameCell(c, m.targetCell))) return `That fits ${cells.length} empty spots from their side. Be more precise.`;
    }
    return null;
  }

  private observe(): string {
    const m = this.ctx.mission();
    const scene = this.ctx.scene();
    if (!m || !scene) return 'Between missions.';
    const target = scene.objects.find((o) => o.id === this.wantedId(m));
    const lines = [
      `Mission ${m.index + 1}: ${m.type === 'find' ? 'your partner must PICK UP the target' : 'your partner must MOVE an object to a new spot'}.`,
      `Target object: the ${target ? entityLabel({ ...target, landmark: false }) : '?'} (from your partner's side: ${target ? cellWords(target.cell) : '?'}).`,
    ];
    if (m.type === 'place') lines.push(`It must go to the empty spot in ${cellWords(m.targetCell)} (partner's view).`);
    lines.push(`On the table: ${scene.objects.map((o) => `${entityLabel({ ...o, landmark: false })} (${cellWords(o.cell)})`).join('; ')}.`);
    lines.push(`Landmarks: ${scene.landmarks.map((l) => `${l.name} (${cellWords(l.cell)})`).join('; ')}.`);
    lines.push(`Your last instruction: "${this.lastInstruction}"`);
    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// AI builder
// ---------------------------------------------------------------------------

type Pending = { kind: 'pick'; ids: string[]; idx: number } | { kind: 'place'; cells: Cell[]; idx: number };

class AiBuilder extends BaseBot {
  private pending: Pending | null = null;
  private awaitingFrame: ParsedUtterance | null = null;
  /** Objects offered in the last "do you mean A or B?" question. */
  private offered: string[] = [];
  private lastObject: string | null = null;
  private greeted = false;
  private commitTimer: Timer | null = null;
  private brain: PartnerBrain;

  constructor(
    io: BotIO,
    private ctx: TableCtx,
    level: string,
  ) {
    super(io);
    this.brain = new PartnerBrain(io, level, () => this.toolkit());
  }

  onMissionStart(m: AnyMission) {
    this.pending = null;
    this.awaitingFrame = null;
    this.offered = [];
    this.cancel(this.commitTimer);
    if (!this.greeted) {
      this.greeted = true;
      this.later(900, () => this.say("Hi, I'm Pixel! I can't see the target. Tell me exactly what to do."));
    } else this.later(700, () => this.sayOne(m.type === 'find' ? ['Ready! Which one should I pick up?', 'Okay, what am I looking for?'] : ['Ready! What should I move, and where?', 'Next one! What goes where?']));
  }

  onChat(msg: ChatMessage) {
    if (msg.role !== 'guide' || !this.ctx.mission() || !this.ctx.scene()) return;
    // Quick, unambiguous moves stay on the instant rule path; everything else goes to the LLM first.
    const p = parseUtterance(msg.text, G2B);
    if ((p.intent === 'confirm' && this.pending) || (p.intent === 'deny' && this.pending)) return this.rules(msg.text);
    this.brain.handle(msg.text, () => this.rules(msg.text));
  }

  private rules(text: string) {
    const m = this.ctx.mission();
    if (!m || !this.ctx.scene()) return;
    const p = parseUtterance(text, G2B);
    this.traceRules(text, [{ tool: 'parse', args: text, result: `${p.intent}${p.target ? ` target=${JSON.stringify(p.target)}` : ''}${p.place ? ` place=${JSON.stringify(p.place)}` : ''}` }], '(acting)');

    if (this.awaitingFrame) {
      const frame = /\b(your|yours)\b/i.test(text) ? 'builder' : /\b(my|mine|me)\b/i.test(text) ? 'guide' : null;
      if (frame) {
        const prev = this.awaitingFrame;
        this.awaitingFrame = null;
        this.say(frame === 'guide' ? 'Got it, your side. So for me it is the other way round.' : 'Okay, my side!');
        this.act(prev, frame);
        return;
      }
      this.awaitingFrame = null;
    }
    // Answer to "do you mean A or B?": "the first one", "the second", "the one by the lamp".
    if (this.offered.length > 1) {
      const ord = /\b(first|former)\b/i.test(text) ? 0 : /\b(second|latter|other)\b/i.test(text) ? 1 : -1;
      if (ord >= 0) {
        const id = this.offered[ord];
        this.offered = [];
        return this.choose(id, m);
      }
    }
    if (p.intent === 'confirm') {
      if (this.pending) this.commit();
      return;
    }
    if (p.intent === 'deny') {
      // "Not that one. I mean the small rocket": the correction carries the real instruction.
      const rest = text.replace(/^\s*(?:not (?:that|this)(?: one)?|not quite|the other one|wrong(?: one)?|nope|no\b)[\s,.!]*/i, '').replace(/^(?:i mean|i meant|it'?s|it is)\s+/i, '');
      const fix = rest && rest !== text ? parseUtterance(rest, G2B) : null;
      if (fix && (isContentful(fix.target) || fix.place)) {
        this.pending = null;
        this.cancel(this.commitTimer);
        this.ctx.hover({ objectId: null, cell: null });
        this.act(fix, 'builder');
        return;
      }
      if (this.pending) this.nextCandidate();
      else if (this.ctx.held()) {
        this.ctx.hover({ objectId: null, cell: null });
        this.say('Oh, okay. Where then?');
      }
      return;
    }
    if (/\b(put it back|drop it|let go|undo)\b/i.test(text) && this.ctx.held()) {
      const held = this.ctx.held()!;
      this.ctx.place(held.from);
      this.say('Okay, I put it back.');
      return;
    }
    if (p.intent === 'question') {
      this.sayOne(["I can't see the target, only you can! Describe it for me.", 'You tell me! What does it look like, and what is it next to?']);
      return;
    }
    if (isBackchannel(text)) return;
    if (p.unmarked.length && this.shouldAskFrame()) {
      this.awaitingFrame = p;
      const raw = p.unmarked[0];
      const word = /left/.test(raw) ? 'left' : /right/.test(raw) ? 'right' : /front/.test(raw) ? '"in front"' : /behind|back/.test(raw) ? '"behind"' : 'side';
      this.say(`Wait, do you mean MY ${word} or YOUR ${word}?`);
      return;
    }
    // Default: people assume their own point of view, and so does Pixel.
    this.act(p, 'builder');
  }

  private choose(id: string, m: Mission) {
    if (m.type === 'find') return this.preview(id);
    this.lastObject = id;
    if (this.ctx.held()?.objectId !== id) this.ctx.pick(id);
    this.say(`Got the ${this.label(id)}. Where should it go?`);
  }

  private shouldAskFrame() {
    const d = this.io.difficulty;
    return d === 'easy' ? true : d === 'normal' ? this.io.rng.chance(0.65) : this.io.rng.chance(0.25);
  }

  private label(id: string) {
    const o = this.ctx.scene()?.objects.find((x) => x.id === id);
    return o ? entityLabel({ ...o, landmark: false }) : 'that one';
  }

  private preview(id: string) {
    this.pending = { kind: 'pick', ids: [id], idx: 0 };
    this.later(500, () => {
      this.ctx.hover({ objectId: id, cell: null });
      this.say(`This one? The ${this.label(id)}.`);
      this.cancel(this.commitTimer);
      this.commitTimer = this.later(2200, () => this.commit());
    });
  }

  private previewCell(cells: Cell[], idx: number) {
    this.pending = { kind: 'place', cells, idx };
    this.later(500, () => {
      this.ctx.hover({ objectId: null, cell: cells[idx] });
      this.say(cells.length > 1 ? `There are ${cells.length} spots like that. Here?` : 'Putting it here?');
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
    this.say('Oh, okay. Which one then? Give me a landmark.');
  }

  private askWhich(ids: string[]) {
    const scene = this.ctx.scene()!;
    const opts = ids.slice(0, 2).map((id) => {
      const cands = describeObject(scene, id, B2G, 8);
      return (cands.find((c) => !c.perspective) ?? cands[0])?.text ?? `the ${this.label(id)}`;
    });
    this.offered = ids.slice(0, 2);
    const kind = scene.objects.find((o) => o.id === ids[0])?.kind ?? '';
    this.say(`I see ${ids.length} ${kindPlural(kind)}. Do you mean ${opts[0]} or ${opts[1]}?`);
  }

  private act(p: ParsedUtterance, reading: Role) {
    const m = this.ctx.mission();
    const scene = this.ctx.scene();
    if (!m || !scene) return;
    const entities = sceneEntities(scene);
    const held = this.ctx.held();
    let objectId: string | null = null;

    if (p.target && !(p.target.deictic && !p.target.kind && !p.target.color)) {
      let hits = resolveRef(p.target, entities, reading).filter((e) => !e.landmark);
      // "the other one" after a choice question.
      if (hits.length > 1 && this.offered.length > 1) {
        const narrowed = hits.filter((h) => this.offered.includes(h.id));
        if (narrowed.length === 1) hits = narrowed;
      }
      if (hits.length > 1) return this.askWhich(hits.map((h) => h.id));
      if (hits.length === 1) objectId = hits[0].id;
      else if (!p.place) return this.fallback(p);
    } else if (p.target?.deictic || m.type === 'place') objectId = held?.objectId ?? this.lastObject;
    this.offered = [];

    if (m.type === 'find') {
      if (!objectId) return this.fallback(p);
      return this.preview(objectId);
    }

    if (!p.place) {
      if (objectId && held?.objectId !== objectId) {
        this.lastObject = objectId;
        this.ctx.pick(objectId);
        this.say(`Got the ${this.label(objectId)}. Where should it go?`);
      } else if (!objectId) return this.fallback(p);
      else this.say('Where should I put it?');
      return;
    }
    const moving = objectId ?? held?.objectId ?? null;
    if (!moving) return this.say('Which object should I move?');
    if (held?.objectId !== moving) this.ctx.pick(moving);
    this.lastObject = moving;
    const cells = resolvePlace(p.place, entities, freeCells(scene, moving), reading, moving);
    if (!cells.length) return this.say("Hmm, I'm not sure where that is. Can you use a landmark, like the lamp?");
    this.previewCell(cells, 0);
  }

  private fallback(p: ParsedUtterance) {
    const kinds = p.mentions.filter((k) => !this.ctx.scene()?.objects.some((o) => o.kind === k));
    if (kinds.length) return this.say(`I don't see a ${kindName(kinds[0])} on the table. Which object do you mean?`);
    this.sayOne(["Sorry, I didn't get that. Which object, and what is it next to?", 'Can you name the object and a landmark near it?']);
  }

  onFx(e: FxEvent) {
    if (e.type === 'wrong') this.later(300, () => this.sayOne(['Oops, sorry!', 'Hmm, wrong one. Tell me more?', 'Oh no! Which one is it?']));
    if (e.type === 'success') this.sayOne(['Yay!', 'We did it!', 'Teamwork!']);
  }

  // ---------------------------------------------------------------- LLM tools
  private toolkit(): Toolkit {
    const objectList = () => {
      const scene = this.ctx.scene();
      if (!scene) return [];
      return scene.objects.map((o) => `${o.id}: ${entityLabel({ ...o, landmark: false })} at ${cellWords(o.cell)} (column ${toFrame(o.cell, 'builder').x + 1} of ${COLS} counting from YOUR left, row ${toFrame(o.cell, 'builder').y + 1} of ${ROWS} counting away→toward you)`);
    };
    return {
      persona: `You CANNOT see the target; only your partner (the guide) can. You stand on the near side of the table; the guide stands opposite you, so the guide's left is YOUR right and the guide's "in front of" is YOUR "behind". "My left" from the guide means your RIGHT. A bare "left"/"right" with no owner is ambiguous: ${this.io.difficulty === 'tricky' ? 'usually assume they mean YOUR side' : 'ask "my left or your left?"'}.
Follow instructions literally. Use find_objects to resolve a description before acting. If it fits several objects, ask which one (name the options). For a FIND mission, pick_up is your final answer, so point_at first if you are not sure. For a PLACE mission: pick_up the object, then put_down on an empty spot.`,
      observe: () => {
        const m = this.ctx.mission();
        const held = this.ctx.held();
        return [
          `Mission: ${m ? (m.type === 'find' ? 'FIND (pick up the one object the guide describes)' : 'PLACE (move an object to where the guide says)') : 'none'}.`,
          `Objects (id: description at position, from YOUR side):\n${objectList().join('\n')}`,
          `Landmarks: ${this.ctx.scene()?.landmarks.map((l) => `${l.name} at ${cellWords(l.cell)}`).join('; ')}.`,
          `Empty spots: ${this.ctx
            .scene()
            ?.objects && freeCells(this.ctx.scene()!, held?.objectId).map((c) => `(${toFrame(c, 'builder').x + 1},${toFrame(c, 'builder').y + 1})`).join(' ')} as (column, row) from your side.`,
          held ? `You are holding ${held.objectId} (${this.label(held.objectId)}).` : 'Your hands are empty.',
        ].join('\n');
      },
      tools: [
        {
          name: 'find_objects',
          description: "Resolve the guide's description to objects on the table, reading directions from YOUR side and from the guide's side.",
          input_schema: { type: 'object', properties: { description: { type: 'string', description: 'the words the guide used, e.g. "the small rocket on my left"' } }, required: ['description'] },
          run: ({ description }) => {
            const scene = this.ctx.scene();
            if (!scene) return 'No table.';
            const p = parseUtterance(String(description), G2B);
            if (!p.target) return 'No object described.';
            const read = (r: Role) =>
              resolveRef(p.target!, sceneEntities(scene), r)
                .filter((e) => !e.landmark)
                .map((e) => `${e.id} (${entityLabel(e)})`)
                .join(', ') || 'nothing';
            return `Reading directions from your side: ${read('builder')}. From the guide's side: ${read('guide')}.${p.unmarked.length ? ` Unmarked direction words: ${p.unmarked.join(', ')}.` : ''}`;
          },
        },
        {
          name: 'point_at',
          description: 'Point at an object so the guide can see which one you mean (does not pick it up).',
          input_schema: { type: 'object', properties: { object_id: { type: 'string' } }, required: ['object_id'] },
          run: ({ object_id }) => {
            if (!this.ctx.scene()?.objects.some((o) => o.id === object_id)) return 'No such object.';
            this.ctx.hover({ objectId: String(object_id), cell: null });
            return 'Pointing.';
          },
        },
        {
          name: 'pick_up',
          description: 'Pick up an object. In a FIND mission this is your final answer.',
          acts: true,
          input_schema: { type: 'object', properties: { object_id: { type: 'string' } }, required: ['object_id'] },
          run: ({ object_id }) => {
            const id = String(object_id);
            if (!this.ctx.scene()?.objects.some((o) => o.id === id)) return 'No such object.';
            this.pending = null;
            this.cancel(this.commitTimer);
            this.lastObject = id;
            this.ctx.pick(id);
            return this.ctx.mission() ? `Picked up ${this.label(id)}.` : 'Picked it up: that was correct, the mission is complete!';
          },
        },
        {
          name: 'put_down',
          description: 'Put the object you hold on an empty spot, given as column and row counted from YOUR side (column 1 = your far left, row 1 = the far row).',
          acts: true,
          input_schema: { type: 'object', properties: { column: { type: 'integer' }, row: { type: 'integer' } }, required: ['column', 'row'] },
          run: ({ column, row }) => {
            const held = this.ctx.held();
            const scene = this.ctx.scene();
            if (!held || !scene) return 'You are not holding anything.';
            const cell = { c: Number(column) - 1, r: Number(row) - 1 };
            if (!freeCells(scene, held.objectId).some((c) => sameCell(c, cell))) return 'That spot is not free or not on the table.';
            this.ctx.place(cell);
            return this.ctx.mission() ? 'Placed, but the guide may want it elsewhere.' : 'Placed correctly: mission complete!';
          },
        },
      ],
    };
  }
}

export function createTabletopBot(io: BotIO, ctx: TableCtx, level = 'study'): Bot {
  return io.role === 'guide' ? new AiGuide(io, ctx, level) : new AiBuilder(io, ctx, level);
}

/** Exposed for tests. */
export const __test = { nudge, egocentric };
