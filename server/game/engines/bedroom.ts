import { analyzeBedroom, type BedroomRecord } from '../../../shared/coach';
import { buildBedroom, canReach, collideRoom, FURNITURE, generateSeekMission, itemName, possessive, REACH, START_POSE, spotById, type BedroomState, type SeekMission } from '../../../shared/bedroom';
import type { Pose } from '../../../shared/city';
import type { ClientMission, ReplayMission } from '../../../shared/protocol';
import type { Role } from '../../../shared/types';
import { createBedroomBot } from '../bots/bedroom';
import type { BotIO, EngineHost, LevelEngine, ReportInput } from './types';

const MISSIONS = 3;
const MAX_SPEED = 8;
/** Containers the seeker can open. Items inside stay invisible to the seeker until then. */
const CONTAINERS: Record<string, string> = { toybox: 'toybox' };

const wrapYaw = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Messy Bedroom: the owner remembers where things are, the seeker walks around and finds them. */
export class BedroomEngine implements LevelEngine {
  readonly kind = 'bedroom' as const;
  private state: BedroomState | null = null;
  private initial: BedroomState | null = null;
  private pose: Pose = { ...START_POSE };
  private lastMoveAt = 0;
  private opened = new Set<string>();
  private current: SeekMission | null = null;
  private records: BedroomRecord[] = [];
  private trail: [number, number, number, number][] = [];
  private lastSample = -1;

  constructor(private host: EngineHost) {}

  missionsTotal() {
    return MISSIONS;
  }

  begin() {
    this.state = buildBedroom(this.host.rng, this.host.settings.customKinds);
    this.initial = structuredClone(this.state);
    this.pose = { ...START_POSE };
    this.opened.clear();
    this.records = [];
    this.trail = [];
    this.lastSample = -1;
    this.current = null;
  }

  startMission(index: number) {
    if (!this.state || index >= MISSIONS) return null;
    const s = this.host.settings;
    const m = generateSeekMission(this.state, index, s.quest === 'hidden' ? 'tricky' : s.difficulty, this.host.rng, s.customKinds);
    if (!m) return null;
    this.current = m;
    this.records.push({ mission: m, startPose: { ...this.pose }, startT: this.host.now(), endT: this.host.now(), success: false, mistakes: 0, wrongPicks: [] });
    this.sample(true);
    return m;
  }

  mission() {
    return this.current;
  }

  endMission() {
    const rec = this.records[this.records.length - 1];
    if (rec && rec.mission === this.current) rec.endT = this.host.now();
    this.current = null;
  }

  missionFor(view: Role): ClientMission | null {
    const m = this.current;
    if (!m) return null;
    const base: ClientMission = {
      id: m.id,
      index: m.index,
      type: 'seek',
      title: view === 'guide' ? `Find ${possessive(m.kind)}` : `Lost thing #${m.index + 1}`,
      brief:
        view === 'guide'
          ? `You lost ${possessive(m.kind)}. You remember where (gold ring). Tell your friend what it is and exactly where to look.`
          : 'Your friend lost something in this room. Ask what it is and where to look, walk there (WASD + mouse) and click it.',
    };
    if (view !== 'guide') return base;
    return { ...base, targetId: m.targetId, spotId: m.spotId, modelAnswer: m.modelAnswer, hint: m.hint };
  }

  scene() {
    return null;
  }

  world(view: Role) {
    if (!this.state) return null;
    // Closed containers hide their contents from the seeker, on the wire.
    const hidden = (spot: string) => spot === 'toybox' && !this.opened.has('toybox');
    const items = view === 'guide' ? this.state.items : this.state.items.filter((i) => !hidden(i.spot));
    return { kind: 'bedroom' as const, items, found: this.state.found, pose: this.pose, open: [...this.opened] };
  }

  held() {
    return null;
  }

  private sample(force = false) {
    const t = this.host.now();
    if (!force && t - this.lastSample < 200) return;
    this.lastSample = t;
    this.trail.push([t, +this.pose.x.toFixed(2), +this.pose.z.toFixed(2), +this.pose.yaw.toFixed(3)]);
  }

  move(role: Role, playerId: string, p: Pose) {
    if (role !== 'builder' || !this.state) return;
    if (![p.x, p.z, p.yaw].every(Number.isFinite)) return;
    const now = Date.now();
    const dt = Math.min(1, Math.max(0.05, (now - (this.lastMoveAt || now - 100)) / 1000));
    this.lastMoveAt = now;
    let dx = p.x - this.pose.x;
    let dz = p.z - this.pose.z;
    const len = Math.hypot(dx, dz);
    const max = MAX_SPEED * dt + 0.4;
    if (len > max) {
      dx *= max / len;
      dz *= max / len;
    }
    const pos = collideRoom({ x: this.pose.x + dx, z: this.pose.z + dz });
    this.pose = { x: pos.x, z: pos.z, yaw: wrapYaw(p.yaw) };
    this.host.emitPose(this.pose, playerId);
    this.sample();
  }

  open(role: Role, id: string, open: boolean) {
    if (role !== 'builder' || !CONTAINERS[id] || this.opened.has(id) === open) return;
    const f = FURNITURE.find((x) => x.id === id);
    if (!f || Math.hypot(this.pose.x - f.x, this.pose.z - f.z) > REACH + 0.6) return;
    if (open) this.opened.add(id);
    else this.opened.delete(id);
    this.host.log({ type: 'reveal', message: `${open ? 'open' : 'close'} ${id}` });
    const e = { type: 'reveal' as const, by: 'builder' as const, message: open ? 'open' : 'close', objectId: id };
    this.host.fx(e);
    this.host.notifyBots(e);
    this.host.broadcast();
  }

  pick(role: Role, objectId: string) {
    const st = this.state;
    const m = this.current;
    if (role !== 'builder' || !st || !m) return;
    const item = st.items.find((i) => i.id === objectId);
    if (!item || st.found.includes(item.id)) return;
    if (item.spot === 'toybox' && !this.opened.has('toybox')) return;
    // A little slack over REACH for network lag.
    if (!canReach({ x: this.pose.x, z: this.pose.z }, item) && Math.hypot(this.pose.x - (spotById(item.spot)?.approach[0] ?? 99), this.pose.z - (spotById(item.spot)?.approach[1] ?? 99)) > 1.2) return;
    const rec = this.records[this.records.length - 1];
    this.host.log({ type: 'pick', objectId });
    if (item.id === m.targetId) {
      this.state = { ...st, found: [...st.found, item.id] };
      if (rec) {
        rec.success = true;
        rec.endT = this.host.now();
      }
      this.host.fx({ type: 'pick', by: 'builder', objectId });
      this.host.succeed(`Found ${possessive(item.kind).replace(/^my/, 'the')}!`);
      return;
    }
    if (rec) {
      rec.mistakes++;
      rec.wrongPicks.push(item.kind);
    }
    this.host.mistake(`That's the ${itemName(item.kind)}, not it!`, objectId);
  }

  createBot(io: BotIO) {
    return createBedroomBot(io, {
      state: () => this.state,
      pose: () => this.pose,
      opened: () => this.opened,
      mission: () => this.current,
      move: (p) => this.move(io.role, io.id, p),
      pick: (id) => this.pick(io.role, id),
      open: (id, open) => this.open(io.role, id, open),
    });
  }

  report(input: ReportInput) {
    const report = analyzeBedroom({ records: this.records, messages: input.messages, durationMs: input.durationMs, missionsTotal: MISSIONS, humanRoles: input.humanRoles });
    const missions: ReplayMission[] = this.records.map((r) => ({
      index: r.mission.index,
      type: 'seek',
      title: `Find ${possessive(r.mission.kind)}`,
      startT: r.startT,
      endT: r.endT,
      success: r.success,
      mistakes: r.mistakes,
      modelAnswer: r.mission.modelAnswer,
      targetId: r.mission.targetId,
      spotId: r.mission.spotId,
    }));
    const init = this.initial!;
    return {
      report,
      missions,
      records: [],
      extras: { initialScene: null, initialWorld: { kind: 'bedroom' as const, items: init.items, found: [], pose: { ...START_POSE }, open: [] }, poses: this.trail },
    };
  }
}
