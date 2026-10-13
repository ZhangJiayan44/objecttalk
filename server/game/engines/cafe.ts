import { analyzeCafe, type CafeRecord } from '../../../shared/coach';
import { buildCafe, generateOrderMission, lineText, joinList, objectKey, serveTray, trayStatus, TRAY_SLOTS, type CafeState, type OrderMission } from '../../../shared/cafe';
import { kindPoolOf, levelOf } from '../../../shared/levels';
import type { ClientMission, HoverEvent, ReplayMission } from '../../../shared/protocol';
import type { Role } from '../../../shared/types';
import { createCafeBot } from '../bots/cafe';
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

  constructor(private host: EngineHost) {}

  private get pool() {
    return kindPoolOf(levelOf(this.host.settings.level));
  }

  missionsTotal() {
    return MISSIONS;
  }

  begin() {
    this.state = buildCafe(this.host.rng, this.pool, this.host.settings.customKinds);
    this.initial = structuredClone(this.state);
    this.current = null;
    this.records = [];
    this.served = 0;
  }

  startMission(index: number) {
    if (!this.state || index >= MISSIONS) return null;
    const m = generateOrderMission(this.state, index, this.host.settings.difficulty, this.host.rng, this.host.settings.customKinds, this.host.settings.quest);
    if (!m) return null;
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
      title: `Order ${m.index + 1}`,
      brief:
        view === 'guide'
          ? 'You are the customer. Order everything on your card: numbers, sizes and all. Say "That\'s all" when you are done.'
          : `You are the ${levelOf(this.host.settings.level).roles.builder.name.toLowerCase()}. Listen to the order, ask about sizes and numbers, put everything on the tray, then serve it.`,
    };
    if (view !== 'guide') return base;
    return { ...base, order: m.order, modelAnswer: m.modelAnswer, hint: m.hint };
  }

  scene() {
    return this.state?.scene ?? null;
  }

  world() {
    return this.state ? { kind: 'cafe' as const, tray: this.state.tray, served: this.served } : null;
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
    const status = trayStatus(st, m.order);
    const rec = this.records[this.records.length - 1];
    rec?.serves.push({ t: this.host.now(), tray: st.tray.map((id) => objectKey(st.scene.objects.find((o) => o.id === id)!)), ok: status.complete });
    this.host.log({ type: 'serve', message: status.complete ? 'ok' : 'wrong' });
    if (status.complete) {
      this.served++;
      this.state = serveTray(st, this.host.rng, this.pool);
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
    return createCafeBot(io, {
      level: this.pool,
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
    const report = analyzeCafe({ records: this.records, messages: input.messages, durationMs: input.durationMs, missionsTotal: MISSIONS, humanRoles: input.humanRoles, level: this.pool });
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
    return { report, missions, records: [], extras: { initialScene: this.initial?.scene ?? null, initialWorld: { kind: 'cafe' as const, tray: [], served: 0 } } };
  }
}
