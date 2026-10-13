import {
  ARRIVE_RADIUS,
  AT_NODE,
  isAligned,
  BLOCK,
  cornerLandmark,
  dirBetween,
  distance,
  headingOf,
  nearestNode,
  nodeId,
  nodePos,
  NODES,
  parseDirections,
  parseNode,
  PLACE_DEFS,
  placeById,
  planRoute,
  sideOf,
  turnLeft,
  turnRight,
  opposite,
  yawOf,
  type Dir,
  type DirStep,
  type PlaceKind,
  type Pose,
  type RouteMission,
  type Town,
} from '../../../shared/city';
import type { ChatMessage, FxEvent } from '../../../shared/protocol';
import type { Toolkit } from '../../agent/harness';
import { PartnerBrain } from '../../agent/partner';
import type { AnyMission, Bot, BotIO } from '../engines/types';
import { BaseBot, dialogAct, isBackchannel, NUMBER_WORDS } from './common';

/**
 * Toy Town AI partners.
 *  - Pixel the walker (AI builder) really walks: it turns the navigator's
 *    sentences into steps ("turn left at the bank", "take the second right")
 *    and executes them on the street grid, reports what it sees at corners,
 *    and asks for left/right when the navigator uses map words like "north".
 *  - Nova the navigator (AI guide) watches the walker on the map and gives
 *    directions from the WALKER's heading, step by step, re-routing when they
 *    take a wrong turn.
 */

export interface CityCtx {
  town(): Town | null;
  pose(): Pose;
  mission(): RouteMission | null;
  move(p: Pose): void;
}

const VEC: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

function neighbor(node: string, d: Dir): string | null {
  const [i, j] = parseNode(node);
  const [dx, dz] = VEC[d];
  const ni = i + dx;
  const nj = j + dz;
  return ni < 0 || nj < 0 || ni >= NODES || nj >= NODES ? null : nodeId(ni, nj);
}

/** The node the walker is standing on, if any. */
function nodeHere(p: { x: number; z: number }): string | null {
  const n = nearestNode(p);
  const [i, j] = parseNode(n);
  return distance(p, nodePos(i, j)) < AT_NODE ? n : null;
}

/** The next intersection ahead of a pose along its heading. */
function nodeAhead(p: Pose): string | null {
  const h = headingOf(p.yaw);
  const here = nodeHere(p);
  if (here) return neighbor(here, h);
  const [dx, dz] = VEC[h];
  // Snap to the road the walker is on and find the next node in the heading direction.
  const i = (p.x / BLOCK + (NODES - 1) / 2);
  const j = (p.z / BLOCK + (NODES - 1) / 2);
  const ni = dx > 0 ? Math.ceil(i - 0.05) : dx < 0 ? Math.floor(i + 0.05) : Math.round(i);
  const nj = dz > 0 ? Math.ceil(j - 0.05) : dz < 0 ? Math.floor(j + 0.05) : Math.round(j);
  if (ni < 0 || nj < 0 || ni >= NODES || nj >= NODES) return null;
  return nodeId(ni, nj);
}

const placeName = (id: PlaceKind) => PLACE_DEFS[id].name;

/** The closest point on a street centre line, and the street direction nearest to the pose's yaw. */
function snapToStreet(p: Pose): { x: number; z: number; heading: Dir } {
  const lines = Array.from({ length: NODES }, (_, k) => (k - (NODES - 1) / 2) * BLOCK);
  const lim = lines[NODES - 1];
  const clamp = (v: number) => Math.max(-lim, Math.min(lim, v));
  const vx = lines.reduce((a, b) => (Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a));
  const hz = lines.reduce((a, b) => (Math.abs(b - p.z) < Math.abs(a - p.z) ? b : a));
  const onVertical = Math.abs(vx - p.x) <= Math.abs(hz - p.z);
  const h = headingOf(p.yaw);
  // Facing vector is (-sin yaw, -cos yaw): north when cos > 0, east when -sin > 0.
  if (onVertical) return { x: vx, z: clamp(p.z), heading: h === 'N' || h === 'S' ? h : Math.cos(p.yaw) > 0 ? 'N' : 'S' };
  return { x: clamp(p.x), z: hz, heading: h === 'E' || h === 'W' ? h : -Math.sin(p.yaw) > 0 ? 'E' : 'W' };
}

/** Places on each side of a walker at a node, for "I can see the bank on my left". */
function surroundings(town: Town, p: Pose) {
  const h = headingOf(p.yaw);
  const near = town.places.filter((pl) => distance(p, pl.center) < BLOCK * 0.95).sort((a, b) => distance(p, a.center) - distance(p, b.center));
  const left: string[] = [];
  const right: string[] = [];
  const ahead: string[] = [];
  for (const pl of near.slice(0, 4)) {
    const [vx, vz] = VEC[h];
    const along = (pl.center.x - p.x) * vx + (pl.center.z - p.z) * vz;
    (along > BLOCK * 0.6 ? ahead : sideOf(h, p, pl.center) === 'left' ? left : right).push(placeName(pl.id));
  }
  return { left, right, ahead, lights: town.lights.includes(nodeHere(p) ?? '') };
}

function describeSurroundings(town: Town, p: Pose) {
  const s = surroundings(town, p);
  const bits: string[] = [];
  if (s.left.length) bits.push(`the ${s.left.join(' and the ')} on my left`);
  if (s.right.length) bits.push(`the ${s.right.join(' and the ')} on my right`);
  if (s.ahead.length) bits.push(`the ${s.ahead[0]} ahead`);
  const where = nodeHere(p) ? (s.lights ? "I'm at the traffic lights" : "I'm at a crossroads") : "I'm on a street";
  return bits.length ? `${where}. I can see ${bits.join(', and ')}.` : `${where}.`;
}

// ---------------------------------------------------------------------------
// AI walker
// ---------------------------------------------------------------------------

type Exec =
  | { do: 'turn'; dir: 'left' | 'right' | 'around'; at: 'now' | 'next' | { place: PlaceKind | 'lights' } | { nth: number } }
  | { do: 'walk'; blocks: number | null; until: PlaceKind | 'lights' | null }
  | { do: 'stop' };

class AiWalker extends BaseBot {
  private queue: Exec[] = [];
  private target: { x: number; z: number } | null = null;
  private heading: Dir = 'N';
  private tick: ReturnType<typeof setInterval> | null = null;
  private walking = false;
  private turnsSeen = 0;
  /** Walking back onto the street after the last arrival. */
  private snapping = false;
  /** Intersection where the last decision was made: a "next" turn never fires there twice. */
  private decidedAt: string | null = null;
  private brain: PartnerBrain;
  private announced = false;
  private stuckReported = '';

  constructor(
    io: BotIO,
    private ctx: CityCtx,
    level: string,
  ) {
    super(io);
    this.brain = new PartnerBrain(io, level, () => this.toolkit());
    this.tick = setInterval(() => this.step(0.1), 100);
  }

  dispose() {
    if (this.tick) clearInterval(this.tick);
    super.dispose();
  }

  onMissionStart(m: AnyMission) {
    if (m.type !== 'route') return;
    this.queue = [];
    this.walking = false;
    this.announced = false;
    // After the last arrival the walker stands by a door: step back onto the street.
    const snap = snapToStreet(this.ctx.pose());
    this.heading = snap.heading;
    this.snapping = distance(snap, this.ctx.pose()) > 0.5;
    this.target = this.snapping ? { x: snap.x, z: snap.z } : null;
    if (!this.snapping) this.ctx.move({ ...this.ctx.pose(), yaw: yawOf(this.heading) });
    const name = placeName(m.destination);
    // Ask once we are back on the street, facing along it.
    this.later(m.index === 0 ? 1000 : 2400, () => this.sayOne([`Excuse me! How do I get to the ${name}?`, `Hi! Can you help me? I'm looking for the ${name}.`, `Excuse me, where is the ${name}, please?`]));
  }

  onChat(msg: ChatMessage) {
    if (msg.role !== 'guide' || !this.ctx.mission()) return;
    this.brain.handle(msg.text, () => this.rules(msg.text));
  }

  /** Turn parsed sentences into executable steps. */
  private compile(steps: DirStep[]): Exec[] {
    const out: Exec[] = [];
    // At a corner, or facing across the street (e.g. a door): a first left/right means "now".
    const here = !!nodeHere(this.ctx.pose()) || !isAligned(this.ctx.pose());
    steps.forEach((s, k) => {
      if (s.type === 'straight') out.push({ do: 'walk', blocks: s.blocks, until: s.until });
      else if (s.type === 'turn') {
        if (s.dir === 'around' || s.dir === 'straight') {
          if (s.dir === 'around') out.push({ do: 'turn', dir: 'around', at: 'now' });
          return;
        }
        const at = s.at && s.at !== 'corner' ? { place: s.at } : s.ordinal ? { nth: s.ordinal } : k === 0 && here && !out.length ? 'now' : 'next';
        out.push({ do: 'turn', dir: s.dir, at });
      } else if (s.type === 'stop') out.push({ do: 'stop' });
    });
    // After the last turn people keep walking: carry on to the next corner, then ask.
    if (out.length && out[out.length - 1].do === 'turn') out.push({ do: 'walk', blocks: null, until: null });
    return out;
  }

  private rules(text: string) {
    const started = Date.now();
    const town = this.ctx.town();
    const m = this.ctx.mission();
    if (!town || !m) return;
    const parsed = parseDirections(text);
    const steps = [{ tool: 'parse_directions', args: text, result: JSON.stringify(parsed.steps) + (parsed.mapWords.length ? ` mapWords=${parsed.mapWords.join(',')}` : '') }];
    const reply = (line: string) => {
      this.say(line);
      this.traceRules(text, steps, line, started);
    };
    if (parsed.mapWords.length && !parsed.steps.some((s) => s.type === 'turn')) {
      const w = parsed.mapWords[0];
      return reply(/up|down/.test(w) ? `Sorry, "${w}" is hard for me, I can't see a map. Is that left, right, or straight ahead?` : `Sorry, I don't know which way ${w} is. Do you mean left or right?`);
    }
    const goto = parsed.steps.find((s): s is Extract<DirStep, { type: 'goto' }> => s.type === 'goto');
    const exec = this.compile(parsed.steps);
    if (exec.length) {
      this.start(exec);
      steps.push({ tool: 'plan', args: '', result: JSON.stringify(exec) });
      return reply(this.io.rng.pick(['Okay!', 'Got it, thanks!', 'Alright!', 'Okay, on my way.']));
    }
    const side = parsed.steps.find((s): s is Extract<DirStep, { type: 'side' }> => s.type === 'side');
    if (side) return reply(this.io.rng.pick([`Okay, I'll look on my ${side.side}.`, `On my ${side.side}, got it!`]));
    if (goto) return reply(`I don't know where the ${placeName(goto.place)} is. Which way should I go: left, right or straight?`);
    if (/\b(where are you|what can you see|what do you see)\b/i.test(text)) return reply(describeSurroundings(town, this.ctx.pose()));
    if (/\bstop\b/i.test(text)) {
      this.queue = [];
      this.walking = false;
      return reply('Okay, I stopped.');
    }
    if (dialogAct(text) === 'repeat' || isBackchannel(text)) return this.traceRules(text, steps, '(nothing to do)', started);
    if (dialogAct(text) === 'greet' || /(need help|can i help|where do you want|where are you going)/i.test(text)) return reply(`Yes, please! How do I get to the ${placeName(m.destination)}?`);
    return reply(this.io.rng.pick(['Sorry, which way should I go? Left, right or straight?', "I'm not sure what to do. Should I turn left or right?"]));
  }

  private start(exec: Exec[]) {
    this.queue = exec;
    this.walking = true;
    this.turnsSeen = 0;
    this.stuckReported = '';
    this.target = null;
    this.decidedAt = nodeHere(this.ctx.pose());
  }

  /** Movement loop: follow the queue on the street grid. */
  private step(dt: number) {
    const town = this.ctx.town();
    const m = this.ctx.mission();
    if (!town || !m || this.disposed) return;
    const pose = this.ctx.pose();
    const dest = placeById(town, m.destination);
    // The destination door is in sight: walk straight to it.
    if (dest && distance(pose, dest.door) < BLOCK * 0.85 && this.seesDoor(pose, dest.door)) {
      if (!this.announced) {
        this.announced = true;
        this.say(`I can see the ${dest.name}!`);
      }
      this.target = dest.door;
      this.walking = true;
      this.queue = [];
    }
    if (!this.target && this.walking) this.target = this.nextTarget(pose, town);
    if (!this.target) return;
    const dx = this.target.x - pose.x;
    const dz = this.target.z - pose.z;
    const d = Math.hypot(dx, dz);
    const speed = 4.2;
    if (d < 0.3) {
      this.target = null;
      if (this.snapping) {
        this.snapping = false;
        this.ctx.move({ ...pose, yaw: yawOf(this.heading) });
      }
      return;
    }
    const k = Math.min(1, (speed * dt) / d);
    const wantYaw = Math.atan2(-dx, -dz);
    const diff = Math.atan2(Math.sin(wantYaw - pose.yaw), Math.cos(wantYaw - pose.yaw));
    const yaw = pose.yaw + Math.sign(diff) * Math.min(Math.abs(diff), 6 * dt);
    // Turn on the spot first, then walk.
    const move = Math.abs(diff) > 0.6 ? 0 : k;
    this.ctx.move({ x: pose.x + dx * move, z: pose.z + dz * move, yaw });
    if (dest && distance(this.ctx.pose(), dest.door) < ARRIVE_RADIUS) this.walking = false;
  }

  private seesDoor(pose: Pose, door: { x: number; z: number }) {
    // Only when the door is on the street the walker is on (roughly in line along its heading).
    const h = headingOf(pose.yaw);
    const [vx, vz] = VEC[h];
    const along = (door.x - pose.x) * vx + (door.z - pose.z) * vz;
    const across = Math.abs((door.x - pose.x) * -vz + (door.z - pose.z) * vx);
    return along > -4 && across < 9;
  }

  /** Decide the next waypoint from the current instruction. */
  private nextTarget(pose: Pose, town: Town): { x: number; z: number } | null {
    const here = nodeHere(pose);
    // "Go straight, then turn left": an open-ended walk hands over to the next step, which decides where.
    while (this.queue.length > 1 && this.queue[0].do === 'walk' && (this.queue[0] as Extract<Exec, { do: 'walk' }>).blocks === null && !(this.queue[0] as Extract<Exec, { do: 'walk' }>).until) this.queue.shift();
    const cmd = this.queue[0];
    if (!cmd) {
      this.walking = false;
      if (here && this.stuckReported !== here) {
        this.stuckReported = here;
        this.later(300, () => this.say(`${describeSurroundings(town, pose)} Where now?`));
      }
      return null;
    }
    if (cmd.do === 'stop') {
      this.queue.shift();
      this.walking = false;
      return null;
    }
    if (cmd.do === 'turn' && cmd.at === 'now') {
      this.queue.shift();
      // Facing across the street (e.g. still looking at a door): turn relative to where we actually face.
      const base = isAligned(pose) ? this.heading : headingOf(pose.yaw);
      this.heading = cmd.dir === 'around' ? opposite(base) : cmd.dir === 'left' ? turnLeft(base) : turnRight(base);
      this.decidedAt = here;
      this.ctx.move({ ...pose, yaw: yawOf(this.heading) });
      return this.nextTarget({ ...pose, yaw: yawOf(this.heading) }, town);
    }
    // Arrived at an intersection: does the current command apply here?
    if (here) {
      if (cmd.do === 'turn') {
        const h = this.heading;
        const nd = cmd.dir === 'left' ? turnLeft(h) : cmd.dir === 'right' ? turnRight(h) : opposite(h);
        const fresh = here !== this.decidedAt;
        let applies = cmd.at === 'next' && fresh;
        if (typeof cmd.at === 'object' && 'nth' in cmd.at && fresh) {
          if (neighbor(here, nd)) this.turnsSeen++;
          applies = this.turnsSeen >= cmd.at.nth;
        }
        if (typeof cmd.at === 'object' && 'place' in cmd.at) {
          const lm = cornerLandmark(town, here);
          applies = cmd.at.place === 'lights' ? town.lights.includes(here) : !!lm && lm.includes(placeName(cmd.at.place)) || town.places.some((p) => p.id === (cmd.at as { place: PlaceKind }).place && distance(p.center, nodePos(...parseNode(here))) < BLOCK * 0.75);
        }
        if (applies) {
          this.queue.shift();
          this.turnsSeen = 0;
          this.decidedAt = here;
          if (!neighbor(here, nd)) {
            this.walking = false;
            this.say(`I can't turn ${cmd.dir} here, it's the edge of town. Which way now?`);
            return null;
          }
          this.heading = nd;
          const next = neighbor(here, nd)!;
          return { ...nodePos(...parseNode(next)) };
        }
      }
      if (cmd.do === 'walk' && here !== this.decidedAt) {
        this.decidedAt = here;
        if (cmd.until && (cmd.until === 'lights' ? town.lights.includes(here) : town.places.some((p) => p.id === cmd.until && distance(p.center, nodePos(...parseNode(here))) < BLOCK * 0.75))) {
          this.queue.shift();
          this.decidedAt = null;
          return this.nextTarget(pose, town);
        }
        if (cmd.blocks !== null) {
          cmd.blocks--;
          if (cmd.blocks <= 0) {
            this.queue.shift();
            // The next step (e.g. "then turn left") happens right here.
            this.decidedAt = null;
            return this.nextTarget(pose, town);
          }
        } else if (!cmd.until && this.queue.length === 1) {
          // "Go straight" with nothing after it: stop at the next corner and ask.
          this.queue.shift();
          return this.nextTarget(pose, town);
        }
      }
    }
    // Keep walking forward to the next intersection.
    const ahead = nodeAhead({ ...pose, yaw: yawOf(this.heading) });
    if (!ahead || ahead === here) {
      this.queue = [];
      this.walking = false;
      this.say("This is the end of the street. Which way now?");
      return null;
    }
    // A "walk N blocks" that started mid-street counts the first corner as one block.
    return { ...nodePos(...parseNode(ahead)) };
  }

  onFx(e: FxEvent) {
    if (e.type === 'success') {
      this.queue = [];
      this.walking = false;
      this.target = null;
      this.sayOne(['I found it! Thank you!', "I'm here! Thanks for your help!", 'Yes, here it is! Thanks!']);
    }
  }

  private toolkit(): Toolkit {
    return {
      persona: `You are the walker in a small town. You have NO map: you only see the street in front of you. Your partner has the map. You know where you want to go (see notes) but not the way.
Ask for directions politely. When your partner gives directions you understand, call follow with their words; the game walks you there. If they use map words (north, south, east, west, up, down), you cannot use them: ask "is that left or right?". If you get lost, describe what you can see with look_around.`,
      observe: () => {
        const town = this.ctx.town();
        const m = this.ctx.mission();
        if (!town || !m) return 'Waiting.';
        return `You want to go to the ${placeName(m.destination)}.\n${describeSurroundings(town, this.ctx.pose())}\n${this.queue.length ? `You are following directions (${this.queue.length} step(s) left).` : 'You are standing still, waiting for directions.'}`;
      },
      tools: [
        {
          name: 'follow',
          description: "Walk by your partner's directions. Pass their direction sentence(s) exactly as said, e.g. 'turn left at the bank and go straight for two blocks'.",
          acts: true,
          input_schema: { type: 'object', properties: { directions: { type: 'string' } }, required: ['directions'] },
          run: ({ directions }) => {
            const parsed = parseDirections(String(directions));
            const exec = this.compile(parsed.steps);
            if (!exec.length) return parsed.mapWords.length ? `Those are map words (${parsed.mapWords.join(', ')}): you can't use them. Ask left or right.` : 'No usable direction in that (need left / right / straight / turn around / stop).';
            this.start(exec);
            return `Walking: ${exec.map((e) => (e.do === 'walk' ? `straight${e.blocks ? ` ${e.blocks} block(s)` : ''}${e.until ? ` until the ${e.until}` : ''}` : e.do === 'turn' ? `turn ${e.dir}${typeof e.at === 'object' ? ` at ${'place' in e.at ? e.at.place : `turn #${e.at.nth}`}` : ''}` : 'stop')).join(', then ')}.`;
          },
        },
        {
          name: 'look_around',
          description: 'Describe what you can see from where you stand (buildings on your left/right, traffic lights).',
          input_schema: { type: 'object', properties: {} },
          run: () => {
            const town = this.ctx.town();
            return town ? describeSurroundings(town, this.ctx.pose()) : 'Nothing.';
          },
        },
        {
          name: 'stop_walking',
          description: 'Stop where you are.',
          acts: true,
          input_schema: { type: 'object', properties: {} },
          run: () => {
            this.queue = [];
            this.walking = false;
            this.target = null;
            return 'Stopped.';
          },
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// AI navigator
// ---------------------------------------------------------------------------

class AiNavigator extends BaseBot {
  private lastNode: string | null = null;
  /** Corners left to go at the last check: if it does not shrink at a new corner, the walker went the wrong way. */
  private expectHops: number | null = null;
  private lastAdvice = '';
  private lastAdviceAt = 0;
  private trapUsed = false;
  private nearSaid = false;
  /** The walker has spoken since the mission started. */
  private heardSince = false;
  private brain: PartnerBrain;

  constructor(
    io: BotIO,
    private ctx: CityCtx,
    level: string,
  ) {
    super(io);
    this.brain = new PartnerBrain(io, level, () => this.toolkit());
  }

  private plan() {
    const town = this.ctx.town();
    const m = this.ctx.mission();
    return town && m ? planRoute(town, this.ctx.pose(), m.destination) : null;
  }

  onMissionStart(m: AnyMission) {
    if (m.type !== 'route') return;
    this.lastNode = nodeHere(this.ctx.pose());
    this.nearSaid = false;
    this.trapUsed = false;
    const plan = this.plan();
    this.expectHops = plan?.hops ?? null;
    const name = placeName(m.destination);
    this.heardSince = false;
    // Wait a moment: the walker should ask first. If they don't, offer help.
    this.later(7000, () => {
      if (this.heardSince || this.quietFor() < 3 || !this.ctx.mission() || this.ctx.mission()!.id !== m.id) return;
      this.say(`Do you need help getting to the ${name}? Just ask me!`);
    });
  }

  private give(text: string) {
    this.lastAdvice = text;
    this.lastAdviceAt = Date.now();
    this.say(text);
  }

  /** The first instruction (or the whole route on easy). Tricky: sometimes a map word slips out. */
  private directions(full: boolean): string {
    const plan = this.plan();
    if (!plan) return "Hmm, let me look at the map.";
    if (this.io.difficulty === 'tricky' && !this.trapUsed && plan.legs[0]) {
      this.trapUsed = true;
      const map: Record<Dir, string> = { N: 'north', S: 'south', E: 'east', W: 'west' };
      return `Go ${map[plan.legs[0].dir]}${plan.legs[0].blocks > 1 ? ` for ${NUMBER_WORDS[plan.legs[0].blocks]} blocks` : ''}.`;
    }
    return full || this.io.difficulty === 'easy' ? plan.text : plan.next;
  }

  onChat(msg: ChatMessage) {
    if (msg.role !== 'builder' || !this.ctx.mission()) return;
    this.heardSince = true;
    this.brain.handle(msg.text, () => this.rules(msg.text));
  }

  private rules(text: string) {
    const started = Date.now();
    const town = this.ctx.town();
    const m = this.ctx.mission();
    if (!town || !m) return;
    const lower = text.toLowerCase();
    const plan = this.plan();
    const steps = [{ tool: 'route', args: '', result: plan?.text ?? 'none' }];
    const reply = (line: string) => {
      this.give(line);
      this.traceRules(text, steps, line, started);
    };
    if (/\b(left or right|which way is|is that left|what'?s? (?:north|south|east|west)|where is (?:north|south|east|west)|i don'?t have a map)\b/.test(lower)) {
      // Own up to the map word and give the same step from the walker's point of view.
      return reply(`Sorry, my mistake! From where you are: ${(plan?.next ?? 'go straight ahead.').replace(/^./, (c) => c.toLowerCase())}`);
    }
    if (/\b(how do i get|where is|which way|where (?:should|do) i go|can you help|i'?m looking for|excuse me|directions|how can i get|where now|what now|now what)\b/.test(lower)) return reply(this.directions(/\bhow do i get|where is|looking for\b/.test(lower)));
    if (/\b(am i close|is it far|how far|nearly there|almost there)\b/.test(lower)) {
      const blocks = plan ? Math.max(0, plan.nodes.length - 1) : 0;
      return reply(blocks <= 1 ? `You're very close! It's on your ${plan?.finalSide ?? 'right'}.` : `Not far. About ${NUMBER_WORDS[blocks] ?? blocks} blocks.`);
    }
    if (/\b(lost|wrong way|confused|i don'?t know where i am)\b/.test(lower)) return reply(`No problem. ${plan?.text ?? ''}`);
    const parsed = parseDirections(text);
    if (parsed.landmarks.length && /\b(see|i'?m (?:at|near|next to)|there'?s)\b/.test(lower)) {
      const seen = parsed.landmarks[0];
      if (seen === m.destination) return reply(`Yes! That's it, go to the door.`);
      return reply(`Great, I can see you on the map. ${plan?.next ?? ''}`);
    }
    if (dialogAct(text) === 'repeat') return reply(this.lastAdvice || this.directions(true));
    if (dialogAct(text) === 'greet') return reply('Hi! Where do you want to go?');
    if (isBackchannel(text) || dialogAct(text) === 'yes') return this.traceRules(text, steps, '(nothing to answer)', started);
    if (lower.includes('?')) return reply(plan?.next ?? 'Keep going!');
    this.traceRules(text, steps, '(listening)', started);
  }

  /** Watch the walker on the map and coach them at every corner. */
  onPose(p: Pose) {
    const town = this.ctx.town();
    const m = this.ctx.mission();
    if (!town || !m) return;
    const dest = placeById(town, m.destination);
    if (!dest) return;
    const d = distance(p, dest.door);
    if (d < BLOCK * 0.7 && !this.nearSaid) {
      this.nearSaid = true;
      const side = sideOf(headingOf(p.yaw), p, dest.center);
      this.give(`You're almost there! The ${dest.name} is on your ${side}.`);
      return;
    }
    const here = nodeHere(p);
    if (here && here !== this.lastNode) {
      this.lastNode = here;
      const plan = this.plan();
      if (!plan) return;
      const wrong = this.expectHops !== null && plan.hops >= this.expectHops;
      this.expectHops = plan.hops;
      if (wrong) {
        this.give(`Oops, that's not the way. ${plan.next}`);
        return;
      }
      // Walkers who know the way pass straight through; only someone waiting at the corner gets the next step.
      const node = here;
      this.later(1600, () => {
        const live = this.ctx.mission();
        if (!live || live.id !== m.id || nodeHere(this.ctx.pose()) !== node || Date.now() - this.lastAdviceAt < 2500) return;
        const now = this.plan();
        if (!now) return;
        const turn = now.firstTurn;
        if (now.legs.length === 0) this.give(`Now it's on your ${now.finalSide}.`);
        else if (turn === 'straight') this.give(this.io.rng.pick(['Keep going straight.', 'Go straight on.', 'Straight ahead!']));
        else {
          const at = cornerLandmark(town, node, live.type === 'route' ? live.destination : undefined);
          this.give(`Now turn ${turn === 'around' ? 'around' : turn}${at ? `, here at ${at}` : ''}.`);
        }
      });
    }
  }

  onFx(e: FxEvent) {
    if (e.type === 'success') this.sayOne(['You made it! Great job!', 'Well done, you found it!', 'Perfect, you are there!']);
  }

  private toolkit(): Toolkit {
    return {
      persona: `You have the town map; the walker only sees the street in front of them. Give directions from the WALKER's point of view: "turn left", "go straight for two blocks", "turn right at the bank", "it's on your left". Never say north/south/east/west or up/down: the walker has no map.
Call route first: it gives the correct directions from the walker's CURRENT position and heading. Give one or two steps at a time, and use landmarks at corners.`,
      observe: () => {
        const town = this.ctx.town();
        const m = this.ctx.mission();
        if (!town || !m) return 'Waiting.';
        const p = this.ctx.pose();
        const plan = this.plan();
        return `Destination: the ${placeName(m.destination)}.\nWalker: ${describeSurroundings(town, p).replace(/\bI'm\b/g, 'they are').replace(/\bI can\b/g, 'they can').replace(/\bmy\b/g, 'their')}\nCorrect route from the walker's view right now: ${plan?.text ?? 'unknown'}\nYour last advice: "${this.lastAdvice}"`;
      },
      tools: [
        {
          name: 'route',
          description: "Directions from the walker's current position and heading to the destination (already from THEIR point of view).",
          input_schema: { type: 'object', properties: {} },
          run: () => {
            const plan = this.plan();
            return plan ? `Full: ${plan.text}\nNext step only: ${plan.next}\nBlocks to go: ${plan.nodes.length - 1}` : 'No route.';
          },
        },
      ],
      vetSay: (text) => {
        const parsed = parseDirections(text);
        if (parsed.mapWords.length && !(this.io.difficulty === 'tricky' && !this.trapUsed)) return `The walker has no map: "${parsed.mapWords[0]}" means nothing to them. Use left / right / straight.`;
        if (this.io.difficulty === 'tricky' && parsed.mapWords.length) this.trapUsed = true;
        const plan = this.plan();
        const first = parsed.steps.find((s) => s.type === 'turn' && s.at === null && s.ordinal === null);
        if (plan && first && first.type === 'turn' && plan.firstTurn !== 'straight' && first.dir !== plan.firstTurn && parsed.steps.indexOf(first) === 0)
          return `From the walker's heading the first move is "${plan.firstTurn === 'around' ? 'turn around' : `turn ${plan.firstTurn}`}", not "turn ${first.dir}".`;
        return null;
      },
    };
  }
}

export function createCityBot(io: BotIO, ctx: CityCtx, level = 'city'): Bot {
  return io.role === 'guide' ? new AiNavigator(io, ctx, level) : new AiWalker(io, ctx, level);
}

/** Exposed for tests. */
export const __test = { nodeAhead, nodeHere, surroundings, dirBetween };
