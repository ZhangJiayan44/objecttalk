import { analyzeCafe, type CafeRecord } from '../../../shared/coach';
import { buildCafe, generateOrderMission, lineText, joinList, objectKey, serveTray, trayStatus, TRAY_SLOTS, type CafeState, type OrderMission } from '../../../shared/cafe';
import { kindPoolOf, levelOf } from '../../../shared/levels';
import type { ClientMission, HoverEvent, ReplayMission } from '../../../shared/protocol';
import type { Role } from '../../../shared/types';
import { createCafeBot } from '../bots/cafe';
import { createMarketBot } from '../bots/nightmarket';
import { atMeeting, buildMarket, MARKET_START, marketStep, nearShop, shopForKind, shoppingInstruction } from '../../../shared/nightmarket';
import type { Pose } from '../../../shared/city';
import type { BotIO, EngineHost, LevelEngine, ReportInput } from './types';

const MISSIONS = 3;

/** Corner Cafe: the customer orders from a card, the barista fills the tray from the display case. */
export class CafeEngine implements LevelEngine {
  readonly kind = 'cafe' as const;
  private state: CafeState | null = null;
  private initial: CafeState | null = null;
  private current: OrderMission | null = null;
  private records: CafeRecord[] = [];
  private served = 0;
  private pose: Pose = { ...MARKET_START };
  private lastMoveAt = 0;
  private trail: [number, number, number, number][] = [];
  private get market() { return this.host.settings.level === 'nightmarket'; }

  constructor(private host: EngineHost) {}

  private get pool() {
    return kindPoolOf(levelOf(this.host.settings.level));
  }

  missionsTotal() {
    return MISSIONS;
  }

  begin() {
    this.state = this.market ? buildMarket(this.host.rng, this.host.settings.customKinds) : buildCafe(this.host.rng, this.pool, this.host.settings.customKinds);
    this.pose = { ...MARKET_START };
    this.lastMoveAt = 0;
    this.trail = [[this.host.now(), this.pose.x, this.pose.z, this.pose.yaw]];
    this.initial = structuredClone(this.state);
    this.current = null;
    this.records = [];
    this.served = 0;
  }

  startMission(index: number) {
    if (!this.state || index >= MISSIONS) return null;
    const m = generateOrderMission(this.state, index, this.host.settings.difficulty, this.host.rng, this.host.settings.customKinds, this.host.settings.quest);
    if (!m) return null;
    if (this.market) {
      const shops = new Set(m.order.map((l) => shopForKind(l.kind).id));
      if (shops.size < 2 || !m.order.some((l) => Math.abs(shopForKind(l.kind).x) > 6)) {
        const candidate = this.host.rng.pick(this.state.scene.objects.filter((o) => Math.abs(shopForKind(o.kind).x) > 6 && !m.order.some((l) => l.kind === o.kind)));
        m.order[m.order.length - 1] = { kind: candidate.kind, size: null, qty: this.host.settings.quest === 'party' ? 2 : 1 };
      }
      m.modelAnswer = m.order.map(shoppingInstruction).join(' ') + ' Then bring the shopping bag back to the entrance gate.';
      m.hint = 'Give one shop and item at a time. Use your partner’s heading for left and right. Only you can see this list.';
    }
    this.current = m;
    this.state = { ...this.state, tray: [] };
    this.records.push({ mission: m, scene: structuredClone(this.state.scene), startT: this.host.now(), endT: this.host.now(), success: false, mistakes: 0, serves: [] });
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
      type: 'order',
      title: `${this.market ? 'Shopping list' : 'Order'} ${m.index + 1}`,
      brief:
        view === 'guide'
          ? 'You are the customer. Order everything on your card: numbers, sizes and all. Say "That\'s all" when you are done.'
          : `You are the ${levelOf(this.host.settings.level).roles.builder.name.toLowerCase()}. Listen to the order, ask about sizes and numbers, put everything on the tray, then serve it.`,
    };
    if (this.market) base.brief = view === 'guide'
      ? 'You have the secret shopping list. Tell your partner which shops to visit, what to buy and how many. Guide them back to the entrance gate.'
      : 'Listen to your partner, walk to the shops and talk to the owners to buy food. Bring your bag back to the entrance gate. Ask for directions and sizes!';
    if (view !== 'guide') return base;
    return { ...base, order: m.order, modelAnswer: m.modelAnswer, hint: m.hint };
  }

  scene() {
    return this.state?.scene ?? null;
  }

  world() {
    return this.state ? { kind: 'cafe' as const, tray: this.state.tray, served: this.served, ...(this.market ? { market: { pose: this.pose } } : {}) } : null;
  }

  move(role: Role, playerId: string, p: Pose) {
    if (!this.market || role !== 'builder' || !this.state || !this.current || ![p.x, p.z, p.yaw].every(Number.isFinite)) return;
    const now = Date.now();
    const dt = Math.min(0.5, Math.max(0.05, (now - (this.lastMoveAt || now - 100)) / 1000));
    this.lastMoveAt = now;
    this.pose = marketStep(this.pose, p, 10 * dt + 0.25);
    this.host.emitPose(this.pose, playerId);
    const t = this.host.now();
    if (!this.trail.length || t - this.trail[this.trail.length - 1][0] >= 200) this.trail.push([t, this.pose.x, this.pose.z, this.pose.yaw]);
  }

  held() {
    return null;
  }

  hover(role: Role, playerId: string, e: HoverEvent) {
    if (role !== 'builder' || !this.current) return;
    this.host.emitHover(e, playerId);
  }

  tray(role: Role, objectId: string, add: boolean) {
    const st = this.state;
    if (role !== 'builder' || !st || !this.current) return;
    const obj = st.scene.objects.find((o) => o.id === objectId);
    if (!obj) return;
    const on = st.tray.includes(objectId);
    if (add === on) return;
    if (this.market && add && !nearShop(this.pose, shopForKind(obj.kind))) return;
    if (add && st.tray.length >= TRAY_SLOTS) return;
    this.state = { ...st, tray: add ? [...st.tray, objectId] : st.tray.filter((id) => id !== objectId) };
    this.host.log({ type: add ? 'tray' : 'untray', objectId });
    const e = { type: 'tray' as const, by: 'builder' as const, objectId, message: add ? 'add' : 'remove' };
    this.host.fx(e);
    this.host.notifyBots(e);
    this.host.broadcast();
  }

  serve(role: Role) {
    const st = this.state;
    const m = this.current;
    if (role !== 'builder' || !st || !m) return;
    if (!st.tray.length) return;
    if (this.market && !atMeeting(this.pose)) {
      this.host.fx({ type: 'arrive', message: 'Bring your shopping bag back to the entrance gate first.' });
      return;
    }
    const status = trayStatus(st, m.order);
    const rec = this.records[this.records.length - 1];
    rec?.serves.push({ t: this.host.now(), tray: st.tray.map((id) => objectKey(st.scene.objects.find((o) => o.id === id)!)), ok: status.complete });
    this.host.log({ type: 'serve', message: status.complete ? 'ok' : 'wrong' });
    if (status.complete) {
      this.served++;
      this.state = this.market ? { ...st, tray: [] } : serveTray(st, this.host.rng, this.pool);
      if (rec) {
        rec.success = true;
        rec.endT = this.host.now();
      }
      this.host.fx({ type: 'serve', by: 'builder', message: 'Order up!' });
      this.host.succeed('Order complete!');
      return;
    }
    if (rec) rec.mistakes++;
    const extra = status.extra.map((id) => st.scene.objects.find((o) => o.id === id)).filter((o) => !!o);
    const parts: string[] = [];
    if (status.missing.length) parts.push(`missing ${joinList(status.missing.map(lineText))}`);
    if (extra.length) parts.push(`${extra.length === 1 ? 'one thing' : `${extra.length} things`} I didn't order`);
    this.host.mistake(`Not my order: ${parts.join(', ')}`);
    this.host.broadcast();
  }

  createBot(io: BotIO) {
    if (this.market) return createMarketBot(io, {
      state: () => this.state, mission: () => this.current, pose: () => this.pose,
      move: (p) => this.move(io.role, io.id, p),
      tray: (id, add) => this.tray(io.role, id, add), serve: () => this.serve(io.role),
      specials: this.host.settings.customKinds,
    });
    return createCafeBot(io, {
      level: this.pool,
      specials: this.host.settings.customKinds,
      state: () => this.state,
      mission: () => this.current,
      hover: (e) => {
        if (io.role === 'builder' && this.current) this.host.emitHover(e, io.id);
      },
      tray: (objectId, add) => this.tray(io.role, objectId, add),
      serve: () => this.serve(io.role),
    });
  }

  report(input: ReportInput) {
    const report = analyzeCafe({ records: this.records, messages: input.messages, durationMs: input.durationMs, missionsTotal: MISSIONS, humanRoles: input.humanRoles, level: this.pool, specials: this.host.settings.customKinds });
    const missions: ReplayMission[] = this.records.map((r) => ({
      index: r.mission.index,
      type: 'order',
      title: `Order ${r.mission.index + 1}`,
      startT: r.startT,
      endT: r.endT,
      success: r.success,
      mistakes: r.mistakes,
      modelAnswer: r.mission.modelAnswer,
      order: r.mission.order,
    }));
    return { report, missions, records: [], extras: { initialScene: this.initial?.scene ?? null, initialWorld: { kind: 'cafe' as const, tray: [], served: 0, ...(this.market ? { market: { pose: MARKET_START } } : {}) }, ...(this.market ? { poses: this.trail } : {}) } };
  }
}
