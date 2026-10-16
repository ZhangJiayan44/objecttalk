import { getKind, kindsFor } from '../../../shared/catalog';
import { joinList, lineKey, lineText, objectKey, parseOrder, sizeWord, trayStatus, type CafeState, type OrderLine, type OrderMission } from '../../../shared/cafe';
import type { ChatMessage, FxEvent, HoverEvent } from '../../../shared/protocol';
import type { Toolkit } from '../../agent/harness';
import { PartnerBrain } from '../../agent/partner';
import type { AnyMission, Bot, BotIO } from '../engines/types';
import { BaseBot, dialogAct, isBackchannel, NUMBER_WORDS } from './common';

/**
 * Corner Cafe AI partners.
 *  - Pixel the barista (AI builder) keeps a ticket of what the customer asked
 *    for, asks for the missing size or number, fills the tray to match the
 *    ticket, reads it back and serves on "that's all".
 *  - Nova the customer (AI guide) orders from her card (on harder levels she
 *    leaves sizes out or remembers one item late), answers "small or large?",
 *    and complains politely when the tray is wrong.
 */

export interface CafeCtx {
  level: string;
  state(): CafeState | null;
  mission(): OrderMission | null;
  hover(e: HoverEvent): void;
  tray(objectId: string, add: boolean): void;
  serve(): void;
}

type Size = OrderLine['size'];

const menuName = (kind: string, n: number) => (n === 1 ? (getKind(kind)?.name ?? kind) : (getKind(kind)?.plural ?? `${kind}s`));

function stockOf(st: CafeState, kind: string, size: Size) {
  return st.scene.objects.filter((o) => o.kind === kind && (size ? o.size === size : !getKind(kind)?.sized || o.size !== 'regular'));
}

// ---------------------------------------------------------------------------
// AI barista
// ---------------------------------------------------------------------------

class AiBarista extends BaseBot {
  /** What Pixel believes the customer wants. */
  private ticket: OrderLine[] = [];
  private asking: { kind: string; what: 'size' | 'qty' } | null = null;
  /** The tray is on its way: ignore further "that's all". */
  private serving = false;
  /** The ticket as last read back, so it is only repeated when it changes. */
  private confirmed = '';
  private brain: PartnerBrain;

  constructor(
    io: BotIO,
    private ctx: CafeCtx,
  ) {
    super(io);
    this.brain = new PartnerBrain(io, ctx.level, () => this.toolkit());
  }

  onMissionStart(m: AnyMission) {
    this.ticket = [];
    this.asking = null;
    this.serving = false;
    this.confirmed = '';
    this.later(m.index === 0 ? 1000 : 1400, () => this.sayOne(m.index === 0 ? ["Hi, welcome to the Corner Café! What can I get you?", "Hello! What would you like today?"] : ['Next, please! What can I get you?', 'Hi there! What would you like?', "Hello! What can I get for you today?"]));
  }

  onChat(msg: ChatMessage) {
    if (msg.role !== 'guide' || !this.ctx.mission()) return;
    this.brain.handle(msg.text, () => this.rules(msg.text));
  }

  private inStock(kind: string) {
    const st = this.ctx.state();
    return !!st && st.scene.objects.some((o) => o.kind === kind);
  }

  private rules(text: string) {
    const started = Date.now();
    const st = this.ctx.state();
    if (!st) return;
    const p = parseOrder(text, this.ctx.level);
    const steps = [{ tool: 'parse_order', args: text, result: JSON.stringify({ lines: p.lines, done: p.done, correction: p.correction }) }];
    const replies: string[] = [];
    const lower = text.toLowerCase();

    // An answer to "small or large?" / "how many?" may have no food word in it.
    if (this.asking && !p.lines.some((l) => l.kind === this.asking!.kind)) {
      const size: Size = /\b(large|big|tall|grande)\b/.test(lower) ? 'big' : /\b(small|little|short)\b/.test(lower) ? 'small' : null;
      const num = Object.entries({ one: 1, a: 1, two: 2, three: 3, four: 4 }).find(([w]) => new RegExp(`\\b${w}\\b`).test(lower))?.[1] ?? (Number(/\b(\d)\b/.exec(lower)?.[1]) || null);
      if (this.asking.what === 'size' && size) p.lines.unshift({ kind: this.asking.kind, size, qty: this.ticket.find((l) => l.kind === this.asking!.kind)?.qty ?? 1, negated: false, plural: false });
      if (this.asking.what === 'qty' && num) p.lines.unshift({ kind: this.asking.kind, size: null, qty: num, negated: false, plural: false });
    }
    if (p.correction && this.ticket.length && !p.lines.length) {
      const last = this.ticket[this.ticket.length - 1];
      last.qty = p.correction;
      replies.push(`Sure, ${lineText(last)}.`);
    }
    this.asking = null;
    let question: string | null = null;
    for (const l of p.lines) {
      const kind = getKind(l.kind);
      if (!kind) continue;
      if (l.negated) {
        this.ticket = this.ticket.filter((t) => t.kind !== l.kind);
        replies.push(`Okay, no ${menuName(l.kind, 2)}.`);
        continue;
      }
      if (!this.inStock(l.kind)) {
        replies.push(`Sorry, we don't have any ${menuName(l.kind, 2)} today.`);
        continue;
      }
      let size: Size = l.size;
      const existing = this.ticket.find((t) => t.kind === l.kind);
      if (kind.sized && !size) {
        if (existing?.size) size = existing.size;
        else if (!question) {
          question = p.oddSize ? `Sorry, we only have small or large. Which one would you like?` : `Small or large ${kind.name}?`;
          this.asking = { kind: l.kind, what: 'size' };
        }
      }
      let qty = l.qty;
      if (qty === null) {
        if (l.plural && !question) {
          question = `How many ${kind.plural} would you like?`;
          this.asking = { kind: l.kind, what: 'qty' };
        }
        qty = existing?.qty ?? 1;
      }
      const max = stockOf(st, l.kind, size).length;
      if (qty > max && max > 0) {
        replies.push(`Sorry, I only have ${NUMBER_WORDS[max] ?? max} ${menuName(l.kind, max)} left.`);
        qty = max;
      }
      if (existing) {
        existing.qty = qty;
        existing.size = size;
      } else this.ticket.push({ kind: l.kind, size, qty });
    }
    steps.push({ tool: 'ticket', args: '', result: this.ticket.map(lineText).join(', ') || '(empty)' });
    this.fillTray();

    if (question) replies.push(question);
    else if (p.done) {
      if (this.serving) {
        // already on its way
      } else if (!this.ticket.length) replies.push("Sorry, what would you like? I haven't got your order yet.");
      else {
        this.serving = true;
        replies.push(`Here you are: ${joinList(this.ticket.map(lineText))}. Enjoy!`);
        const mission = this.ctx.mission()?.id;
        this.later(900 + this.ticket.length * 450, () => {
          if (this.ctx.mission()?.id === mission) this.ctx.serve();
          this.serving = false;
        });
      }
    } else if (p.lines.length || p.correction) {
      const ticket = joinList(this.ticket.map(lineText));
      if (this.ticket.length && ticket !== this.confirmed) {
        this.confirmed = ticket;
        replies.push(this.io.rng.pick([`So that's ${ticket}. Anything else?`, `${ticket.replace(/^./, (c) => c.toUpperCase())}. Anything else?`]));
      }
    } else if (/\b(menu|what (?:do you have|have you got|can i (?:get|have))|what'?s good)\b/.test(lower)) {
      const kinds = [...new Set(st.scene.objects.map((o) => o.kind))].map((k) => menuName(k, 2));
      replies.push(`We have ${joinList(kinds)}.`);
    } else if (/\b(how much|price|cost)\b/.test(lower)) {
      replies.push("It's on the house today! What would you like?");
    } else if (dialogAct(text) === 'greet') {
      replies.push(this.io.rng.pick(['Hi! What would you like?', 'Hello! What can I get you?']));
    } else if (isBackchannel(text) || /^\s*(?:yes,?\s*)?(?:a\s+)?(?:small|large|big|one|two|three|four)\b[^?]*$/i.test(text)) {
      // nothing to add (an answer we already have)
    } else replies.push(this.io.rng.pick(["Sorry, what would you like to order?", "Sorry, I didn't catch that. What can I get you?"]));

    const line = replies.join(' ');
    if (line) this.say(line);
    this.traceRules(text, steps, line || '(listening)', started);
  }

  /** Make the tray match the ticket, one item at a time so the customer can watch. */
  private fillTray() {
    const st = this.ctx.state();
    if (!st) return;
    const want = new Map(this.ticket.filter((l) => l.size || !getKind(l.kind)?.sized).map((l) => [lineKey(l), l.qty]));
    const ops: { id: string; add: boolean }[] = [];
    const have = new Map<string, string[]>();
    for (const id of st.tray) {
      const o = st.scene.objects.find((x) => x.id === id);
      if (!o) continue;
      const key = objectKey(o);
      have.set(key, [...(have.get(key) ?? []), id]);
    }
    for (const [key, ids] of have) {
      const n = want.get(key) ?? 0;
      for (const id of ids.slice(n)) ops.push({ id, add: false });
    }
    for (const [key, n] of want) {
      const got = have.get(key)?.length ?? 0;
      if (got >= n) continue;
      const free = st.scene.objects.filter((o) => objectKey(o) === key && !st.tray.includes(o.id)).slice(0, n - got);
      for (const o of free) ops.push({ id: o.id, add: true });
    }
    ops.forEach((op, i) =>
      this.later(350 + i * 450, () => {
        this.ctx.hover({ objectId: op.id, cell: null });
        this.ctx.tray(op.id, op.add);
      }),
    );
  }

  onFx(e: FxEvent) {
    if (e.type === 'wrong') this.later(600, () => this.sayOne(["Oh, sorry! What did I get wrong?", 'Oops! What should I change?']));
    if (e.type === 'success') this.sayOne(['Enjoy your food!', 'Thanks, have a nice day!', 'Enjoy!']);
  }

  private toolkit(): Toolkit {
    const findIds = (kind: string, size: Size, onTray: boolean) => {
      const st = this.ctx.state();
      if (!st) return [];
      return st.scene.objects.filter((o) => o.kind === kind && (size ? o.size === size : true) && st.tray.includes(o.id) === onTray).map((o) => o.id);
    };
    const kindIds = kindsFor(this.ctx.level).map((k) => k.id);
    return {
      persona: `You are the barista. You cannot see the customer's order card: listen to what they ask for. Drinks come in small or large, so ask if they don't say. If a plural has no number ("croissants"), ask how many. Add exactly what they asked for to the tray with add_to_tray, read the order back, ask "Anything else?", and when they say that's all, serve.
Menu item ids: ${kindIds.join(', ')}.`,
      observe: () => {
        const st = this.ctx.state();
        if (!st) return 'Closed.';
        const counts = new Map<string, number>();
        for (const o of st.scene.objects) if (!st.tray.includes(o.id)) counts.set(objectKey(o), (counts.get(objectKey(o)) ?? 0) + 1);
        const stock = [...counts].map(([k, n]) => {
          const [kind, size] = k.split('|');
          return `${n} x ${size ? `${sizeWord(size as Size)} ` : ''}${getKind(kind)?.name ?? kind} (${kind})`;
        });
        const tray = st.tray.map((id) => st.scene.objects.find((o) => o.id === id)).filter((o) => !!o);
        return `In the display case: ${stock.join('; ')}.\nOn the tray now: ${tray.map((o) => `${o!.size !== 'regular' ? `${sizeWord(o!.size as Size)} ` : ''}${getKind(o!.kind)?.name}`).join(', ') || 'nothing'}.\nYour notes so far: ${this.ticket.map(lineText).join(', ') || 'nothing'}.`;
      },
      tools: [
        {
          name: 'add_to_tray',
          description: 'Put items from the display case on the tray.',
          acts: true,
          input_schema: {
            type: 'object',
            properties: { kind: { type: 'string', enum: kindIds }, size: { type: 'string', enum: ['small', 'large', 'none'] }, quantity: { type: 'integer' } },
            required: ['kind', 'quantity'],
          },
          run: ({ kind, size, quantity }) => {
            const s: Size = size === 'small' ? 'small' : size === 'large' ? 'big' : null;
            if (getKind(String(kind))?.sized && !s) return 'That drink needs a size: ask the customer "small or large?" first.';
            const ids = findIds(String(kind), s, false).slice(0, Number(quantity));
            if (!ids.length) return 'None left in the case.';
            ids.forEach((id, i) => this.later(200 + i * 350, () => this.ctx.tray(id, true)));
            const line = { kind: String(kind), size: s, qty: Number(quantity) };
            const ex = this.ticket.find((t) => t.kind === line.kind && t.size === line.size);
            if (ex) ex.qty += ids.length;
            else this.ticket.push({ ...line, qty: ids.length });
            return `Added ${ids.length}.${ids.length < Number(quantity) ? ' (That was all we had.)' : ''}`;
          },
        },
        {
          name: 'remove_from_tray',
          description: 'Take items off the tray (wrong item, or the customer changed their mind).',
          acts: true,
          input_schema: {
            type: 'object',
            properties: { kind: { type: 'string', enum: kindIds }, size: { type: 'string', enum: ['small', 'large', 'none'] }, quantity: { type: 'integer' } },
            required: ['kind', 'quantity'],
          },
          run: ({ kind, size, quantity }) => {
            const s: Size = size === 'small' ? 'small' : size === 'large' ? 'big' : null;
            const ids = findIds(String(kind), s, true).slice(0, Number(quantity));
            ids.forEach((id) => this.ctx.tray(id, false));
            this.ticket = this.ticket.map((t) => (t.kind === kind && (!s || t.size === s) ? { ...t, qty: t.qty - ids.length } : t)).filter((t) => t.qty > 0);
            return ids.length ? `Removed ${ids.length}.` : 'There was none on the tray.';
          },
        },
        {
          name: 'serve',
          description: 'Hand the tray to the customer when they have finished ordering.',
          acts: true,
          input_schema: { type: 'object', properties: {} },
          run: () => {
            if (!this.ctx.state()?.tray.length) return 'The tray is empty.';
            this.later(700, () => this.ctx.serve());
            return 'Serving.';
          },
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// AI customer
// ---------------------------------------------------------------------------

class AiCustomer extends BaseBot {
  private said = new Set<string>();
  private holdBack: OrderLine[] = [];
  private complained = new Set<string>();
  private toldDone = false;
  private lastDoneAt = 0;
  private opening: string | null = null;
  private trayTimer: ReturnType<typeof setTimeout> | null = null;
  private brain: PartnerBrain;

  constructor(
    io: BotIO,
    private ctx: CafeCtx,
  ) {
    super(io);
    this.brain = new PartnerBrain(io, ctx.level, () => this.toolkit());
  }

  onMissionStart(m: AnyMission) {
    if (m.type !== 'order') return;
    this.said.clear();
    this.complained.clear();
    this.toldDone = false;
    this.lastDoneAt = 0;
    const order = m.order;
    const d = this.io.difficulty;
    // Harder levels: leave the size out (the barista must ask) and remember one item late.
    const first = d === 'tricky' && order.length > 1 ? order.slice(0, -1) : order;
    this.holdBack = d === 'tricky' && order.length > 1 ? order.slice(-1) : [];
    const dropSize = d !== 'easy' && this.io.rng.chance(d === 'tricky' ? 0.8 : 0.5);
    const spoken = first.map((l) => (dropSize && l.size ? { ...l, size: null } : l));
    for (const l of first) if (!(dropSize && l.size)) this.said.add(lineKey(l));
    const opener = this.io.rng.pick(['Could I have', 'Can I get', "I'd like", 'Could I get']);
    const body = joinList(spoken.map((l) => lineText({ ...l, size: l.size })));
    this.opening = opener === "I'd like" ? `Hi! I'd like ${body}, please.` : `Hi! ${opener} ${body}, please?`;
    // Order when the barista greets us, or after a polite pause if they don't.
    this.later(m.index === 0 ? 4500 : 4000, () => this.sayOrder());
  }

  private sayOrder() {
    if (!this.opening || !this.ctx.mission()) return;
    const line = this.opening;
    this.opening = null;
    this.say(line);
  }

  onChat(msg: ChatMessage) {
    if (msg.role !== 'builder' || !this.ctx.mission()) return;
    this.brain.handle(msg.text, () => this.rules(msg.text));
  }

  private rules(text: string) {
    const started = Date.now();
    const st = this.ctx.state();
    const m = this.ctx.mission();
    if (!st || !m) return;
    const lower = text.toLowerCase();
    const status = trayStatus(st, m.order);
    const steps = [{ tool: 'check_tray', args: '', result: status.complete ? 'complete' : `missing ${status.missing.map(lineText).join(', ') || 'nothing'}; extra ${status.extra.length}` }];
    const reply = (line: string) => {
      this.say(line);
      this.traceRules(text, steps, line, started);
    };
    const sized = m.order.find((l) => l.size);
    const mentionedKinds = parseOrder(text, this.ctx.level).lines.map((l) => l.kind);
    // The barista's greeting is our cue to order.
    if (this.opening && (dialogAct(text) === 'greet' || /\b(what (?:can i get|would you like|can i do)|can i help|next,? please|ready to order)\b/.test(lower))) {
      const line = this.opening;
      this.opening = null;
      return reply(line);
    }
    if (/\b(small or (?:large|big)|(?:large|big) or small|what size|which size)\b/.test(lower)) {
      const line = m.order.find((l) => l.size && (!mentionedKinds.length || mentionedKinds.includes(l.kind))) ?? sized;
      if (!line) return reply("Oh, it doesn't matter. Just a normal one!");
      this.said.add(lineKey(line));
      return reply(`${sizeWord(line.size).replace(/^./, (c) => c.toUpperCase())}, please.`);
    }
    if (/\bhow many\b/.test(lower)) {
      const line = m.order.find((l) => mentionedKinds.includes(l.kind)) ?? m.order.find((l) => l.qty > 1) ?? m.order[0];
      return reply(`${NUMBER_WORDS[line.qty].replace(/^./, (c) => c.toUpperCase())}, please.`);
    }
    if (/\b(anything else|something else|is that (?:all|everything|it)|what else|that'?s all\??|else\?)\b/.test(lower) || /\bwhat (?:can i get you|would you like)\b/.test(lower)) {
      if (this.holdBack.length) {
        const late = this.holdBack;
        this.holdBack = [];
        late.forEach((l) => this.said.add(lineKey(l)));
        return reply(`Oh yes, and ${joinList(late.map(lineText))}, please.`);
      }
      const unsaid = m.order.filter((l) => !this.said.has(lineKey(l)) && status.missing.some((x) => lineKey(x) === lineKey(l)));
      if (unsaid.length) {
        unsaid.forEach((l) => this.said.add(lineKey(l)));
        return reply(`Yes, ${joinList(unsaid.map(lineText))}, please.`);
      }
      // Everything is said: confirm once, don't repeat ourselves.
      if (this.toldDone && Date.now() - this.lastDoneAt < 8000) return this.traceRules(text, steps, '(already said that is all)', started);
      this.toldDone = true;
      this.lastDoneAt = Date.now();
      if (status.complete || !status.extra.length) return reply(this.io.rng.pick(["No, that's all, thanks!", "That's everything, thank you!"]));
      return reply(this.describeProblems(status));
    }
    // The barista reads the order back: compare with the card.
    const readBack = parseOrder(text, this.ctx.level);
    if (readBack.lines.length) {
      const wrong = readBack.lines.filter((l) => {
        const want = m.order.find((o) => o.kind === l.kind);
        if (l.negated) return !!want;
        return !want || (l.qty !== null && l.qty !== want.qty) || (l.size && want.size && l.size !== want.size);
      });
      steps.push({ tool: 'compare_card', args: JSON.stringify(readBack.lines), result: wrong.length ? `wrong: ${wrong.map((w) => w.kind).join(', ')}` : 'matches' });
      if (!wrong.length) return reply(this.io.rng.pick(["Yes, that's right!", 'Yes, exactly, thanks!']));
      const w = wrong[0];
      const want = m.order.find((o) => o.kind === w.kind);
      if (!want) return reply(`Oh no, I didn't order any ${menuName(w.kind, 2)}.`);
      if (w.negated) return reply(`Oh, no! I do want ${lineText(want)}, please.`);
      return reply(`No, sorry, ${lineText(want)}, please.`);
    }
    if (/\b(here you (?:are|go)|there you go|enjoy)\b/.test(lower)) {
      return status.complete ? this.traceRules(text, steps, '(waiting for the tray)', started) : reply(this.describeProblems(status));
    }
    if (dialogAct(text) === 'greet') return this.traceRules(text, steps, '(already ordered)', started);
    if (isBackchannel(text)) return this.traceRules(text, steps, '(nothing to answer)', started);
    if (dialogAct(text) === 'repeat' || dialogAct(text) === 'confused') return reply(`${m.modelAnswer.replace(/^Hi! /, '')}`);
    this.traceRules(text, steps, '(listening)', started);
  }

  private describeProblems(status: ReturnType<typeof trayStatus>) {
    const st = this.ctx.state()!;
    const extra = status.extra.map((id) => st.scene.objects.find((o) => o.id === id)).filter((o) => !!o);
    if (extra.length) {
      const o = extra[0]!;
      const name = `${o.size !== 'regular' ? `${sizeWord(o.size as Size)} ` : ''}${getKind(o.kind)?.name ?? o.kind}`;
      return `Sorry, I didn't order ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}.`;
    }
    if (status.missing.length) return `I'm still missing ${joinList(status.missing.map(lineText))}.`;
    return 'That looks right!';
  }

  onFx(e: FxEvent) {
    const m = this.ctx.mission();
    if (e.type === 'success') return this.sayOne(['Thank you so much!', 'Lovely, thanks!', 'Perfect, thank you!']);
    if (!m) return;
    if (e.type === 'wrong') {
      const st = this.ctx.state();
      if (st) this.later(700, () => this.say(`Hmm, that's not quite right. ${this.describeProblems(trayStatus(st, m.order))}`));
      return;
    }
    if (e.type === 'tray') {
      // Watch the barista: complain once about an item that is not on the card, say "that's all" when it is right.
      this.cancel(this.trayTimer);
      this.trayTimer = this.later(2200, () => {
        const st = this.ctx.state();
        const live = this.ctx.mission();
        if (!st || !live) return;
        const status = trayStatus(st, live.order);
        const extra = status.extra.map((id) => st.scene.objects.find((o) => o.id === id)).find((o) => o && !this.complained.has(objectKey(o)));
        if (extra) {
          this.complained.add(objectKey(extra));
          this.say(this.describeProblems(status));
        } else if (status.complete && !this.toldDone && !this.holdBack.length && !this.opening) {
          this.toldDone = true;
          this.lastDoneAt = Date.now();
          this.say(this.io.rng.pick(["That's everything, thanks!", "Great, that's all!"]));
        }
      });
    }
  }

  private toolkit(): Toolkit {
    return {
      persona: `You are the customer. Your order card is in the notes below: order exactly that, politely, like a real customer (you may order in more than one sentence). Answer the barista's questions about sizes and numbers from your card. If the tray has something you didn't order, or is missing something, tell them kindly. When the tray matches your card, say that's all.`,
      observe: () => {
        const st = this.ctx.state();
        const m = this.ctx.mission();
        if (!st || !m) return 'Waiting in line.';
        const status = trayStatus(st, m.order);
        const tray = st.tray.map((id) => st.scene.objects.find((o) => o.id === id)).filter((o) => !!o);
        return `Your order card: ${joinList(m.order.map(lineText))}.\nOn the barista's tray: ${tray.map((o) => `${o!.size !== 'regular' ? `${sizeWord(o!.size as Size)} ` : ''}${getKind(o!.kind)?.name}`).join(', ') || 'nothing yet'}.\nTray check: ${status.complete ? 'matches your card exactly' : `missing ${status.missing.map(lineText).join(', ') || 'nothing'}; ${status.extra.length} item(s) you did not order`}.`;
      },
      tools: [
        {
          name: 'check_tray',
          description: "Compare the barista's tray with your order card.",
          input_schema: { type: 'object', properties: {} },
          run: () => {
            const st = this.ctx.state();
            const m = this.ctx.mission();
            if (!st || !m) return 'No order.';
            const s = trayStatus(st, m.order);
            return s.complete ? 'The tray matches your card.' : this.describeProblems(s);
          },
        },
      ],
      vetSay: (text) => {
        const m = this.ctx.mission();
        if (!m) return null;
        const p = parseOrder(text, this.ctx.level);
        const bad = p.lines.filter((l) => !l.negated && !m.order.some((o) => o.kind === l.kind));
        if (bad.length && !/\b(didn'?t|not|no)\b/i.test(text)) return `${menuName(bad[0].kind, 1)} is not on your order card.`;
        return null;
      },
    };
  }
}

export function createCafeBot(io: BotIO, ctx: CafeCtx): Bot {
  return io.role === 'guide' ? new AiCustomer(io, ctx) : new AiBarista(io, ctx);
}
