import { analyzeCity, type CityRecord } from '../../../shared/coach';
import { buildTown, collide, generateRouteMission, hasArrived, placeById, PLACE_DEFS, type Pose, type RouteMission, type Town } from '../../../shared/city';
import type { ClientMission, ReplayMission } from '../../../shared/protocol';
import type { Role } from '../../../shared/types';
import { moveWithCollision } from '../../../shared/collision';
import { createCityBot } from '../bots/city';
import type { BotIO, EngineHost, LevelEngine, ReportInput } from './types';

const MISSIONS = 3;
/** Generous speed cap (m/s): running is ~8, anything faster is a glitch or a cheat. */
const MAX_SPEED = 12;

const wrapYaw = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Toy Town: the navigator reads a map, the walker walks the streets in first person. */
export class CityEngine implements LevelEngine {
  readonly kind = 'city' as const;
  private town: Town | null = null;
  private pose: Pose = { x: 0, z: 0, yaw: 0 };
  private lastMoveAt = 0;
  private current: RouteMission | null = null;
  private visited: string[] = [];
  private records: CityRecord[] = [];
  private trail: [number, number, number, number][] = [];
  private lastSample = -1;

  constructor(private host: EngineHost) {}

  missionsTotal() {
    return MISSIONS;
  }

  begin() {
    this.town = buildTown(this.host.rng);
    this.pose = { ...this.town.start };
    this.visited = [];
    this.records = [];
    this.trail = [];
    this.lastSample = -1;
    this.current = null;
  }

  startMission(index: number) {
    if (!this.town || index >= MISSIONS) return null;
    const m = generateRouteMission(this.town, this.pose, index, this.host.rng, this.visited, this.host.settings.quest);
    if (!m) return null;
    this.current = m;
    this.records.push({ mission: m, startPose: { ...this.pose }, startT: this.host.now(), endT: this.host.now(), success: false, mistakes: 0 });
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
    const name = PLACE_DEFS[m.destination].name;
    const base: ClientMission = {
      id: m.id,
      index: m.index,
      type: 'route',
      title: view === 'guide' ? 'Guide the way' : `Get to the ${name}`,
      destination: m.destination,
      brief:
        view === 'guide'
          ? 'Guide your partner to the highlighted destination using the map and their point of view.'
          : `You want to go to the ${name}, but you don't know the way. Ask your navigator, then walk there (WASD + mouse).`,
    };
    if (view !== 'guide') return base;
    return { ...base, modelAnswer: m.modelAnswer, hint: m.hint };
  }

  scene() {
    return null;
  }

  world() {
    return this.town ? { kind: 'city' as const, town: this.town, pose: this.pose } : null;
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
    if (role !== 'builder' || !this.town) return;
    if (![p.x, p.z, p.yaw].every(Number.isFinite)) return;
    const now = Date.now();
    const dt = Math.min(1, Math.max(0.05, (now - (this.lastMoveAt || now - 100)) / 1000));
    this.lastMoveAt = now;
    let dx = p.x - this.pose.x;
    let dz = p.z - this.pose.z;
    const len = Math.hypot(dx, dz);
    const max = MAX_SPEED * dt + 0.5;
    if (len > max) {
      dx *= max / len;
      dz *= max / len;
    }
    const pos = moveWithCollision(this.pose, { x: this.pose.x + dx, z: this.pose.z + dz }, collide);
    this.pose = { x: pos.x, z: pos.z, yaw: wrapYaw(p.yaw) };
    this.host.emitPose(this.pose, playerId);
    this.sample();
    const m = this.current;
    if (!m) return;
    const place = placeById(this.town, m.destination);
    if (place && hasArrived(this.pose, place)) {
      this.visited.push(m.destination);
      const rec = this.records[this.records.length - 1];
      if (rec) {
        rec.success = true;
        rec.endT = this.host.now();
      }
      this.sample(true);
      this.host.fx({ type: 'arrive', by: 'builder', message: `You found the ${place.name}!` });
      this.host.succeed(`You found the ${place.name}!`);
    }
  }

  createBot(io: BotIO) {
    return createCityBot(io, {
      town: () => this.town,
      pose: () => this.pose,
      mission: () => this.current,
      move: (p) => this.move(io.role, io.id, p),
    });
  }

  report(input: ReportInput) {
    const report = analyzeCity({ records: this.records, town: this.town!, trail: this.trail, messages: input.messages, durationMs: input.durationMs, missionsTotal: MISSIONS, humanRoles: input.humanRoles });
    const missions: ReplayMission[] = this.records.map((r) => ({
      index: r.mission.index,
      type: 'route',
      title: `Get to the ${PLACE_DEFS[r.mission.destination].name}`,
      startT: r.startT,
      endT: r.endT,
      success: r.success,
      mistakes: r.mistakes,
      modelAnswer: r.mission.modelAnswer,
      destination: r.mission.destination,
    }));
    const town = this.town!;
    return { report, missions, records: [], extras: { initialScene: null, initialWorld: { kind: 'city' as const, town, pose: town.start }, poses: this.trail } };
  }
}
