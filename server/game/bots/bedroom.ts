import { getKind, kindName } from '../../../shared/catalog';
import {
  canReach,
  FURNITURE,
  itemName,
  matchSpots,
  parseSpot,
  possessive,
  pronoun,
  ROOM_D,
  ROOM_W,
  SPOTS,
  spotById,
  type BedroomItem,
  type BedroomState,
  type SeekMission,
  type Spot,
} from '../../../shared/bedroom';
import type { Pose } from '../../../shared/city';
import type { ChatMessage, FxEvent } from '../../../shared/protocol';
import type { Toolkit } from '../../agent/harness';
import { PartnerBrain } from '../../agent/partner';
import type { AnyMission, Bot, BotIO } from '../engines/types';
import { BaseBot, dialogAct, isBackchannel } from './common';

/**
 * Messy Bedroom AI partners.
 *  - Nova the owner (AI guide) remembers where she left her things, answers
 *    "under the bed?" with yes/no + a better phrase, and plays warmer/colder
 *    while she watches the seeker walk around.
 *  - Pixel the seeker (AI builder) walks to the furniture you name, looks
 *    there (opening the toy box if needed) and reports what is there, asking
 *    "the top shelf or the bottom shelf?" when your words fit two places.
 */

export interface BedroomCtx {
  state(): BedroomState | null;
  pose(): Pose;
  opened(): Set<string>;
  mission(): SeekMission | null;
  move(p: Pose): void;
  pick(itemId: string): void;
  open(id: string, open: boolean): void;
}

const RADIUS = 0.35;

/** Does the straight segment a->b stay clear of solid furniture? */
export function segmentClear(a: { x: number; z: number }, b: { x: number; z: number }) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.15);
  for (let k = 1; k <= n; k++) {
    const x = a.x + ((b.x - a.x) * k) / n;
    const z = a.z + ((b.z - a.z) * k) / n;
    if (Math.abs(x) > ROOM_W / 2 - RADIUS || Math.abs(z) > ROOM_D / 2 - RADIUS) return false;
    for (const f of FURNITURE) if (f.solid && Math.abs(x - f.x) < f.w / 2 + RADIUS - 0.02 && Math.abs(z - f.z) < f.d / 2 + RADIUS - 0.02) return false;
  }
  return true;
}

type P = { x: number; z: number };

/** Free-floor waypoints and the clear lines between them (furniture never moves, so build once). */
const WAYPOINTS: P[] = [];
for (let x = -3.9; x <= 3.95; x += 0.65)
  for (let z = -2.9; z <= 3.0; z += 0.65) {
    const p = { x: +x.toFixed(2), z: +z.toFixed(2) };
    if (segmentClear(p, p)) WAYPOINTS.push(p);
  }
const LINKS = WAYPOINTS.map((a) => WAYPOINTS.map((b, j) => (a !== b && Math.hypot(a.x - b.x, a.z - b.z) < 2.2 && segmentClear(a, b) ? j : -1)).filter((j) => j >= 0));

/** Shortest walk from a position to a spot's standing point (Dijkstra over the waypoint graph). */
export function pathTo(from: P, spot: Spot): P[] {
  const goal = { x: spot.approach[0], z: spot.approach[1] };
  if (segmentClear(from, goal)) return [goal];
  const n = WAYPOINTS.length;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  WAYPOINTS.forEach((w, i) => {
    if (segmentClear(from, w)) dist[i] = Math.hypot(w.x - from.x, w.z - from.z);
  });
  let best = -1;
  let bestCost = Infinity;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    const toGoal = segmentClear(WAYPOINTS[u], goal) ? dist[u] + Math.hypot(goal.x - WAYPOINTS[u].x, goal.z - WAYPOINTS[u].z) : Infinity;
    if (toGoal < bestCost) {
      bestCost = toGoal;
      best = u;
    }
    if (dist[u] > bestCost) break;
    for (const v of LINKS[u]) {
      const alt = dist[u] + Math.hypot(WAYPOINTS[v].x - WAYPOINTS[u].x, WAYPOINTS[v].z - WAYPOINTS[u].z);
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
      }
    }
  }
  if (best < 0) return [goal];
  const path: P[] = [goal];
  for (let at = best; at >= 0; at = prev[at]) path.unshift(WAYPOINTS[at]);
  return path;
}

const phraseOf = (spotId: string) => spotById(spotId)?.phrase ?? 'somewhere';

function itemsAt(st: BedroomState, spotId: string, hiddenToybox: boolean): BedroomItem[] {
  return st.items.filter((i) => i.spot === spotId && !st.found.includes(i.id) && !(hiddenToybox && i.spot === 'toybox'));
}

// ---------------------------------------------------------------------------
// AI owner
// ---------------------------------------------------------------------------

class AiOwner extends BaseBot {
  private lastDist = Infinity;
  private lastHotCold = 0;
  private refined = false;
  private reachedSaid = false;
  private brain: PartnerBrain;

  constructor(
    io: BotIO,
    private ctx: BedroomCtx,
    level: string,
  ) {
    super(io);
    this.brain = new PartnerBrain(io, level, () => this.toolkit());
  }

  private target() {
    const m = this.ctx.mission();
    const st = this.ctx.state();
    return m && st ? st.items.find((i) => i.id === m.targetId) : undefined;
  }

  onMissionStart(m: AnyMission) {
    if (m.type !== 'seek') return;
    const spot = spotById(m.spotId)!;
    const thing = possessive(m.kind);
    const p = pronoun(m.kind);
    this.refined = this.io.difficulty !== 'tricky';
    this.reachedSaid = false;
    this.lastDist = Infinity;
    this.lastHotCold = Date.now();
    const furniture = FURNITURE.find((f) => f.id === spot.furniture)!;
    const where = this.refined ? spot.phrase : `somewhere near the ${furniture.name}`;
    const extra = this.io.difficulty === 'easy' ? ` It's ${getKind(m.kind)?.baseColor ?? ''} ${kindName(m.kind)}.`.replace('  ', ' ') : '';
    this.later(m.index === 0 ? 1400 : 1600, () =>
      this.sayOne([
        `Oh no, I can't find ${thing}! I think ${p.it === 'they' ? "they're" : "it's"} ${where}.${extra}`,
        `Can you help me? I lost ${thing}. I think I left ${p.it === 'they' ? 'them' : 'it'} ${where}.${extra}`,
      ]),
    );
  }

  onChat(msg: ChatMessage) {
    if (msg.role !== 'builder' || !this.ctx.mission()) return;
    this.brain.handle(msg.text, () => this.rules(msg.text));
  }

  private rules(text: string) {
    const started = Date.now();
    const m = this.ctx.mission();
    const st = this.ctx.state();
    const item = this.target();
    if (!m || !st || !item) return;
    const lower = text.toLowerCase();
    const guess = parseSpot(text);
    const matches = matchSpots(guess);
    const steps = [{ tool: 'parse_spot', args: text, result: JSON.stringify(guess) + ` -> ${matches.map((s) => s.id).join(',') || 'none'}` }];
    const reply = (line: string) => {
      this.say(line);
      this.traceRules(text, steps, line, started);
    };
    const p = pronoun(m.kind);
    const It = p.it === 'they' ? "They're" : "It's";
    // A guess about the place ("under the bed?").
    if (guess.furniture) {
      this.refined = true;
      if (matches.some((s) => s.id === m.spotId)) return reply(this.io.rng.pick([`Yes! ${It} ${phraseOf(m.spotId)}.`, `Yes, exactly, ${phraseOf(m.spotId)}!`]));
      const sameFurniture = spotById(m.spotId)!.furniture === guess.furniture;
      if (sameFurniture) return reply(`Almost! Not ${guess.prep ?? 'there'}: ${phraseOf(m.spotId)}.`);
      const wrongPlace = matches[0]?.phrase ?? `${guess.prep ?? 'near'} the ${FURNITURE.find((f) => f.id === guess.furniture)?.name}`;
      return reply(`No, not ${wrongPlace}. ${It} ${phraseOf(m.spotId)}.`);
    }
    // The seeker names an item they see ("I found a cap").
    if (guess.item) {
      if (guess.item === item.kind) return reply(`Yes, ${possessive(item.kind)}! Pick ${p.it === 'they' ? 'them' : 'it'} up!`);
      return reply(`No, that's my ${itemName(guess.item)}. I need ${possessive(item.kind)}.`);
    }
    if (/\b(what (?:is it|did you lose|are you looking for|do you need)|what does it look like|which thing)\b/.test(lower)) {
      const k = getKind(item.kind);
      return reply(`${possessive(item.kind).replace(/^./, (c) => c.toUpperCase())}. ${p.it === 'they' ? 'They are' : 'It is'} ${k?.baseColor ?? 'small'}.`);
    }
    if (/\bwhere\b|\bcan'?t find\b|\bno idea\b|\bhelp\b|\bnot here\b|\bnothing\b/.test(lower)) {
      this.refined = true;
      const f = FURNITURE.find((x) => x.id === spotById(m.spotId)!.furniture)!;
      const side = f.x < -1.5 ? 'on the left side of the room' : f.x > 1.5 ? 'on the right side of the room' : 'in the middle of the room';
      return reply(`${It} ${phraseOf(m.spotId)}. The ${f.name} is ${f.z < -1.5 ? 'at the back' : f.z > 1.5 ? 'at the front' : ''} ${side}.`.replace(/\s+/g, ' '));
    }
    if (dialogAct(text) === 'repeat' || dialogAct(text) === 'confused') return reply(`I lost ${possessive(item.kind)}. ${It} ${phraseOf(m.spotId)}.`);
    if (isBackchannel(text) || dialogAct(text) === 'yes') return this.traceRules(text, steps, '(nothing to answer)', started);
    if (dialogAct(text) === 'greet') return reply(`Hi! Can you help me find ${possessive(item.kind)}?`);
    if (lower.includes('?')) return reply(`${It} ${phraseOf(m.spotId)}.`);
    this.traceRules(text, steps, '(listening)', started);
  }

  /** Warmer / colder while watching the seeker. */
  onPose(p: Pose) {
    const item = this.target();
    const m = this.ctx.mission();
    if (!item || !m) return;
    const spot = spotById(item.spot)!;
    const d = Math.hypot(p.x - spot.approach[0], p.z - spot.approach[1]);
    if (canReach(p, item) && !this.reachedSaid) {
      this.reachedSaid = true;
      const extra = item.spot === 'toybox' && !this.ctx.opened().has('toybox') ? ' Open the toy box!' : spot.prep === 'under' ? ' Look down, under it!' : spot.prep === 'on top of' ? ' Look up!' : '';
      this.say(`Yes, you're right there!${extra}`);
      return;
    }
    if (Date.now() - this.lastHotCold < 3500 || this.quietFor() < 2.5) return;
    if (this.lastDist === Infinity) {
      this.lastDist = d;
      return;
    }
    if (d < this.lastDist - 1.6) {
      this.lastHotCold = Date.now();
      this.lastDist = d;
      this.sayOne(["You're getting warmer!", 'Warmer, warmer!', "Yes, you're getting closer!"]);
    } else if (d > this.lastDist + 1.6) {
      this.lastHotCold = Date.now();
      this.lastDist = d;
      this.sayOne(["Colder... you're going the wrong way.", 'No, colder!', "Hmm, you're getting colder."]);
    }
  }

  onFx(e: FxEvent) {
    const item = this.target();
    if (e.type === 'success') return this.sayOne(['Yes! Thank you so much!', "That's it! You're a star!", 'Found it! Thanks!']);
    if (e.type === 'wrong' && item) {
      const st = this.ctx.state();
      const picked = st?.items.find((i) => i.id === e.objectId);
      this.later(500, () => this.say(`No, that's my ${picked ? itemName(picked.kind) : 'other thing'}. I need ${possessive(item.kind)}, ${phraseOf(item.spot)}.`));
    }
    if (e.type === 'reveal' && e.message === 'open' && item?.spot === 'toybox') this.later(400, () => this.say('Yes! Look inside!'));
  }

  private toolkit(): Toolkit {
    return {
      persona: `You lost something in your bedroom and you remember exactly where it is (see notes). Your partner walks around the room looking for it. Tell them WHAT it is and WHERE, using furniture and prepositions (under, on, on top of, inside, behind, between, next to). Answer their guesses with yes/no and the better phrase. Give warmer/colder hints if they wander.`,
      observe: () => {
        const m = this.ctx.mission();
        const item = this.target();
        if (!m || !item) return 'Nothing lost right now.';
        const p = this.ctx.pose();
        const spot = spotById(item.spot)!;
        const d = Math.hypot(p.x - spot.approach[0], p.z - spot.approach[1]);
        return `You lost ${possessive(item.kind)} (${getKind(item.kind)?.baseColor} ${kindName(item.kind)}). It is ${spot.phrase}.\nYour partner is ${d < 1.5 ? 'right next to it' : `about ${d.toFixed(0)} metres away from it`}.${item.spot === 'toybox' ? ` The toy box is ${this.ctx.opened().has('toybox') ? 'open' : 'closed'}.` : ''}`;
      },
      tools: [
        {
          name: 'check_guess',
          description: "Check whether a place your partner mentions (e.g. 'on the bed') is where your thing really is.",
          input_schema: { type: 'object', properties: { place: { type: 'string' } }, required: ['place'] },
          run: ({ place }) => {
            const m = this.ctx.mission();
            if (!m) return 'Nothing lost.';
            const hits = matchSpots(parseSpot(String(place)));
            if (!hits.length) return 'That place is not clear (no furniture named).';
            return hits.some((s) => s.id === m.spotId) ? `Yes: it is ${phraseOf(m.spotId)}.` : `No: it is ${phraseOf(m.spotId)}, not there.`;
          },
        },
      ],
      vetSay: (text) => {
        const m = this.ctx.mission();
        if (!m) return null;
        const g = parseSpot(text);
        if (!g.furniture || /\b(not|no|isn'?t)\b/i.test(text)) return null;
        const hits = matchSpots(g);
        if (hits.length && !hits.some((s) => s.id === m.spotId)) return `That would send them to the wrong place: your thing is ${phraseOf(m.spotId)}.`;
        return null;
      },
    };
  }
}

// ---------------------------------------------------------------------------
// AI seeker
// ---------------------------------------------------------------------------

class AiSeeker extends BaseBot {
  private wantKind: string | null = null;
  private route: { x: number; z: number }[] = [];
  private goal: Spot | null = null;
  private asked: Spot[] = [];
  private tick: ReturnType<typeof setInterval>;
  private awaitingYes: BedroomItem | null = null;
  private brain: PartnerBrain;

  constructor(
    io: BotIO,
    private ctx: BedroomCtx,
    level: string,
  ) {
    super(io);
    this.brain = new PartnerBrain(io, level, () => this.toolkit());
    this.tick = setInterval(() => this.step(0.1), 100);
  }

  dispose() {
    clearInterval(this.tick);
    super.dispose();
  }

  onMissionStart(m: AnyMission) {
    if (m.type !== 'seek') return;
    this.wantKind = null;
    this.route = [];
    this.goal = null;
    this.asked = [];
    this.awaitingYes = null;
    this.later(m.index === 0 ? 900 : 1200, () => this.sayOne(m.index === 0 ? ["Sure, I'll help! What did you lose, and where did you leave it?"] : ['Okay, what else is missing?', 'What are we looking for now?']));
  }

  onChat(msg: ChatMessage) {
    if (msg.role !== 'guide' || !this.ctx.mission()) return;
    this.brain.handle(msg.text, () => this.rules(msg.text));
  }

  private goTo(spot: Spot) {
    this.goal = spot;
    this.route = pathTo(this.ctx.pose(), spot);
  }

  private rules(text: string) {
    const started = Date.now();
    const st = this.ctx.state();
    if (!st) return;
    const g = parseSpot(text);
    if (g.item) this.wantKind = g.item;
    let matches = matchSpots(g);
    // An answer to "the top shelf or the bottom shelf?".
    if (!matches.length && this.asked.length > 1) {
      const pick = /\b(top|upper|first|on (?:the )?bed|on it)\b/i.test(text) ? this.asked[0] : /\b(bottom|lower|second|under)\b/i.test(text) ? this.asked[1] : null;
      if (pick) matches = [pick];
    }
    const steps = [{ tool: 'parse_spot', args: text, result: `${JSON.stringify(g)} -> ${matches.map((s) => s.id).join(',') || 'none'}` }];
    const reply = (line: string) => {
      this.say(line);
      this.traceRules(text, steps, line, started);
    };
    if (this.awaitingYes && dialogAct(text) === 'yes') {
      const item = this.awaitingYes;
      this.awaitingYes = null;
      this.ctx.pick(item.id);
      return this.traceRules(text, steps, `(picked ${item.kind})`, started);
    }
    if (this.awaitingYes && dialogAct(text) === 'no') {
      this.awaitingYes = null;
      return reply('Oh, okay. Where else should I look?');
    }
    if (matches.length === 1) {
      this.asked = [];
      this.goTo(matches[0]);
      const what = this.wantKind ? `your ${itemName(this.wantKind)}` : 'it';
      return reply(this.io.rng.pick([`Okay, I'll look ${matches[0].phrase}.`, `Got it, ${matches[0].phrase}. Looking for ${what}!`]));
    }
    if (matches.length > 1) {
      this.asked = matches.slice(0, 2);
      return reply(`Do you mean ${this.asked[0].phrase} or ${this.asked[1].phrase}?`);
    }
    if (g.furniture && !matches.length) {
      const options = SPOTS.filter((s) => s.furniture === g.furniture).slice(0, 2);
      if (options.length === 1) {
        this.goTo(options[0]);
        return reply(`Okay, I'll check ${options[0].phrase}.`);
      }
      this.asked = options;
      return reply(`Where exactly? ${options.map((o) => o.phrase.replace(/^./, (c) => c.toUpperCase())).join('? Or ')}?`);
    }
    if (g.item && !g.furniture) return reply(`Your ${itemName(g.item)}? Okay! Where do you think ${pronoun(g.item).it === 'they' ? 'they are' : 'it is'}?`);
    if (g.vague) return reply("Where is 'there'? Can you tell me which furniture, like under the bed or on the desk?");
    if (isBackchannel(text) || dialogAct(text) === 'thanks') return this.traceRules(text, steps, '(nothing to answer)', started);
    if (dialogAct(text) === 'greet') return reply('Hi! What did you lose?');
    return reply(this.io.rng.pick(['Sorry, where should I look? Under, on or inside which furniture?', "I don't understand. Which furniture is it near?"]));
  }

  private step(dt: number) {
    if (this.disposed || !this.ctx.mission()) return;
    const next = this.route[0];
    if (!next) return;
    const pose = this.ctx.pose();
    const dx = next.x - pose.x;
    const dz = next.z - pose.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) {
      this.route.shift();
      if (!this.route.length) this.arrive();
      return;
    }
    const wantYaw = Math.atan2(-dx, -dz);
    const diff = Math.atan2(Math.sin(wantYaw - pose.yaw), Math.cos(wantYaw - pose.yaw));
    const yaw = pose.yaw + Math.sign(diff) * Math.min(Math.abs(diff), 5 * dt);
    const k = Math.abs(diff) > 0.7 ? 0 : Math.min(1, (2.2 * dt) / d);
    this.ctx.move({ x: pose.x + dx * k, z: pose.z + dz * k, yaw });
  }

  /** At the furniture: look (open the toy box first), then pick or report. */
  private arrive() {
    const spot = this.goal;
    const st = this.ctx.state();
    if (!spot || !st) return;
    const pose = this.ctx.pose();
    // Face the spot.
    this.ctx.move({ ...pose, yaw: Math.atan2(-(spot.pos[0] - pose.x), -(spot.pos[2] - pose.z)) });
    const look = () => {
      const live = this.ctx.state();
      if (!live) return;
      const here = itemsAt(live, spot.id, !this.ctx.opened().has('toybox'));
      if (!here.length) return this.say(`There's nothing ${spot.phrase}. Where else could it be?`);
      const item = here[0];
      if (!this.wantKind) {
        this.awaitingYes = item;
        return this.say(`I found ${getKind(item.kind)?.name === getKind(item.kind)?.plural ? 'some' : 'a'} ${itemName(item.kind)} ${spot.phrase}. Is that it?`);
      }
      if (item.kind === this.wantKind) {
        this.say(`Found it! Your ${itemName(item.kind)}!`);
        this.later(500, () => this.ctx.pick(item.id));
      } else this.say(`Hmm, there's a ${itemName(item.kind)} ${spot.phrase}, but no ${itemName(this.wantKind)}.`);
    };
    if (spot.id === 'toybox' && !this.ctx.opened().has('toybox')) {
      this.ctx.open('toybox', true);
      this.later(700, look);
    } else this.later(400, look);
  }

  onFx(e: FxEvent) {
    if (e.type === 'success') this.sayOne(['Here you go!', 'Got it! What else?', 'Yay, found it!']);
    if (e.type === 'wrong') this.later(300, () => this.say("Oops, that's not it. What does it look like?"));
  }

  private toolkit(): Toolkit {
    const furnitureIds = FURNITURE.map((f) => f.id);
    return {
      persona: `You are helping your friend find something they lost in their bedroom. You don't know what it is or where it is until they tell you. Use go_to to walk to a place (furniture + preposition), then look_here, then pick_up the right thing. If their description fits two places (e.g. top or bottom shelf), ask which.`,
      observe: () => {
        const st = this.ctx.state();
        const p = this.ctx.pose();
        const nearest = [...FURNITURE].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
        return `Furniture in the room: ${FURNITURE.map((f) => f.name).join(', ')}.\nYou are standing near the ${nearest.name}.${this.goal ? ` You are going to look ${this.goal.phrase}.` : ''}\nLooking for: ${this.wantKind ? itemName(this.wantKind) : 'you have not been told yet'}.\nThings found so far: ${st?.found.length ?? 0}.`;
      },
      tools: [
        {
          name: 'go_to',
          description: 'Walk to a place in the room.',
          acts: true,
          input_schema: {
            type: 'object',
            properties: { furniture: { type: 'string', enum: furnitureIds }, preposition: { type: 'string', enum: ['under', 'on', 'on top of', 'inside', 'between', 'behind', 'next to'] }, shelf: { type: 'string', enum: ['top', 'bottom', 'any'] } },
            required: ['furniture'],
          },
          run: ({ furniture, preposition, shelf }) => {
            const hits = matchSpots({ furniture: furniture as Spot['furniture'], prep: (preposition as Spot['prep']) ?? null, shelf: shelf === 'top' || shelf === 'bottom' ? shelf : null, item: null, vague: false });
            if (!hits.length) return `There is no such place. Places at the ${furniture}: ${SPOTS.filter((s) => s.furniture === furniture).map((s) => s.phrase).join('; ')}.`;
            if (hits.length > 1) return `That fits ${hits.length} places: ${hits.map((h) => h.phrase).join('; ')}. Ask which one.`;
            this.goTo(hits[0]);
            return `Walking to: ${hits[0].phrase}. You will look there automatically when you arrive.`;
          },
        },
        {
          name: 'look_here',
          description: 'Look at the place you walked to and list what is there.',
          input_schema: { type: 'object', properties: {} },
          run: () => {
            const st = this.ctx.state();
            if (!st || !this.goal) return 'You have not gone anywhere yet.';
            const here = itemsAt(st, this.goal.id, !this.ctx.opened().has('toybox'));
            return here.length ? `${this.goal.phrase}: ${here.map((i) => itemName(i.kind)).join(', ')}.` : `Nothing ${this.goal.phrase}.`;
          },
        },
        {
          name: 'pick_up',
          description: 'Pick up a thing of this kind if it is within reach.',
          acts: true,
          input_schema: { type: 'object', properties: { thing: { type: 'string', description: 'what it is, e.g. keys, glasses, cap' } }, required: ['thing'] },
          run: ({ thing }) => {
            const st = this.ctx.state();
            if (!st) return 'Nothing here.';
            const g = parseSpot(String(thing));
            const kind = g.item ?? this.wantKind;
            const item = st.items.find((i) => i.kind === kind && !st.found.includes(i.id) && canReach(this.ctx.pose(), i) && !(i.spot === 'toybox' && !this.ctx.opened().has('toybox')));
            if (!item) return 'No such thing within reach. Walk closer first.';
            this.ctx.pick(item.id);
            return this.ctx.mission()?.targetId === item.id || !this.ctx.mission() ? 'Picked up: it was the right thing!' : 'Picked up, but it was the wrong thing.';
          },
        },
      ],
    };
  }
}

export function createBedroomBot(io: BotIO, ctx: BedroomCtx, level = 'bedroom'): Bot {
  return io.role === 'guide' ? new AiOwner(io, ctx, level) : new AiSeeker(io, ctx, level);
}
