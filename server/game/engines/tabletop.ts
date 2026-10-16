import { analyzeSession, type MissionRecord } from '../../../shared/analysis';
import { kindsFor } from '../../../shared/catalog';
import { levelOf } from '../../../shared/levels';
import { buildScene, generateMission, isPickCorrect, isPlaceCorrect, missionPlan, moveObject } from '../../../shared/missions';
import type { ClientMission, Held, HoverEvent, ReplayMission } from '../../../shared/protocol';
import { occupiedKeys } from '../../../shared/spatial';
import { cellKey, sameCell, type Cell, type Mission, type Role, type SceneState, type TableMissionType } from '../../../shared/types';
import { createTabletopBot } from '../bots/tabletop';
import type { BotIO, EngineHost, LevelEngine, ReportInput } from './types';

const BRIEFS: Record<TableMissionType, Record<Role, string>> = {
  find: {
    guide: 'Only you can see the target (gold ring). Tell your partner which object to pick up.',
    builder: 'Your guide knows which object is the target. Listen, ask, then click it!',
  },
  place: {
    guide: 'Tell your partner what to move and where. The ghost shows the target spot.',
    builder: 'Your guide will tell you what to move and where. Click an object, then a spot.',
  },
};

/** The original ObjectTalk table: find and place things described in space. */
export class TabletopEngine implements LevelEngine {
  readonly kind = 'tabletop' as const;
  private sceneState: SceneState | null = null;
  private initial: SceneState | null = null;
  private current: Mission | null = null;
  private plan: TableMissionType[] = [];
  private records: MissionRecord[] = [];
  private heldState: Held | null = null;
  private lastHoverKey = '';
  private lastHoverLog = 0;

  constructor(private host: EngineHost) {}

  missionsTotal() {
    return this.plan.length || 3;
  }

  begin(seed: number) {
    const s = this.host.settings;
    const level = levelOf(s.level);
    // Levels with their own Rodin objects (Pet Shop, agent-made levels) use them; the study uses the player's interests.
    const own = level.id !== 'study';
    const levelKinds = own ? this.host.rng.shuffle(kindsFor(level.id).map((k) => k.id)) : [];
    this.sceneState = buildScene({ seed, interests: own ? [] : s.interests, difficulty: s.difficulty, kinds: [...s.customKinds, ...levelKinds], pool: own ? level.id : undefined });
    this.initial = structuredClone(this.sceneState);
    this.plan = missionPlan(this.host.rng, s.quest);
    this.records = [];
    this.heldState = null;
    this.current = null;
  }

  startMission(index: number) {
    if (!this.sceneState || index >= this.plan.length) return null;
    const m = generateMission(this.sceneState, index, this.plan[index] ?? 'find', this.host.settings.difficulty, this.host.rng);
    if (!m) return null;
    this.current = m;
    this.heldState = null;
    this.records.push({ mission: m, scene: structuredClone(this.sceneState), startT: this.host.now(), endT: this.host.now(), success: false, mistakes: 0 });
    return m;
  }

  mission() {
    return this.current;
  }

  endMission() {
    const rec = this.records[this.records.length - 1];
    if (rec && rec.mission === this.current) rec.endT = this.host.now();
    this.current = null;
    this.heldState = null;
  }

  missionFor(view: Role): ClientMission | null {
    const m = this.current;
    if (!m) return null;
    const base: ClientMission = { id: m.id, index: m.index, type: m.type, title: m.type === 'find' ? 'Find it' : 'Place it', brief: BRIEFS[m.type][view] };
    if (view !== 'guide') return base;
    return {
      ...base,
      modelAnswer: m.modelAnswer,
      hint: m.hint,
      targetId: m.type === 'find' ? m.targetId : undefined,
      itemId: m.type === 'place' ? m.itemId : undefined,
      targetCell: m.type === 'place' ? m.targetCell : undefined,
    };
  }

  scene() {
    return this.sceneState;
  }

  world() {
    return { kind: 'tabletop' as const };
  }

  held() {
    return this.heldState;
  }

  private markMistake() {
    const rec = this.records[this.records.length - 1];
    if (rec) rec.mistakes++;
  }

  private markSuccess() {
    const rec = this.records[this.records.length - 1];
    if (rec) {
      rec.success = true;
      rec.endT = this.host.now();
    }
  }

  hover(role: Role, playerId: string, e: HoverEvent) {
    if (role !== 'builder' || !this.current) return;
    this.host.emitHover(e, playerId);
    const key = `${e.objectId ?? ''}|${e.cell ? cellKey(e.cell) : ''}`;
    const now = this.host.now();
    if (key !== this.lastHoverKey && now - this.lastHoverLog > 250) {
      this.lastHoverKey = key;
      this.lastHoverLog = now;
      this.host.log({ type: 'hover', objectId: e.objectId ?? undefined, cell: e.cell });
    }
  }

  pick(role: Role, objectId: string) {
    const m = this.current;
    if (role !== 'builder' || !m || !this.sceneState) return;
    const obj = this.sceneState.objects.find((o) => o.id === objectId);
    if (!obj) return;
    if (m.type === 'find') {
      if (isPickCorrect(m, objectId)) {
        this.host.log({ type: 'pick', objectId });
        this.host.fx({ type: 'pick', by: 'builder', objectId });
        this.markSuccess();
        this.host.succeed();
      } else {
        this.markMistake();
        this.host.mistake('Not that one!', objectId);
      }
      return;
    }
    if (this.heldState?.objectId === objectId) return;
    this.heldState = { objectId, from: obj.cell };
    this.host.log({ type: 'pick', objectId });
    this.host.fx({ type: 'pick', by: 'builder', objectId });
    this.host.notifyBots({ type: 'pick', by: 'builder', objectId });
    this.host.broadcast();
  }

  place(role: Role, cell: Cell) {
    const m = this.current;
    if (role !== 'builder' || !m || !this.sceneState || !this.heldState) return;
    const { objectId, from } = this.heldState;
    if (occupiedKeys(this.sceneState, objectId).has(cellKey(cell))) return;
    this.sceneState = moveObject(this.sceneState, objectId, cell);
    this.heldState = null;
    this.host.log({ type: 'place', objectId, cell });
    this.host.fx({ type: 'place', by: 'builder', objectId, cell });
    if (isPlaceCorrect(m, objectId, cell)) {
      this.markSuccess();
      this.host.succeed();
      return;
    }
    if (!sameCell(cell, from)) {
      this.markMistake();
      this.host.mistake(m.type === 'place' && m.itemId !== objectId ? 'Wrong object!' : 'Not quite!', objectId, cell);
    }
    this.host.broadcast();
  }

  drop(role: Role) {
    if (role !== 'builder' || !this.heldState) return;
    this.host.log({ type: 'drop', objectId: this.heldState.objectId });
    this.heldState = null;
    this.host.broadcast();
  }

  createBot(io: BotIO) {
    return createTabletopBot(
      io,
      {
      scene: () => this.sceneState,
      mission: () => this.current,
      held: () => this.heldState,
      hover: (e) => {
        if (io.role !== 'builder' || !this.current) return;
        this.host.emitHover(e, io.id);
        this.host.log({ type: 'hover', objectId: e.objectId ?? undefined, cell: e.cell });
      },
      pick: (objectId) => this.pick(io.role, objectId),
      place: (cell) => this.place(io.role, cell),
      },
      this.host.settings.level,
    );
  }

  report(input: ReportInput) {
    const report = analyzeSession({ missions: this.records, messages: input.messages, durationMs: input.durationMs, missionsTotal: this.plan.length, humanRoles: input.humanRoles, level: this.host.settings.level });
    const missions: ReplayMission[] = this.records.map((r) => ({
      index: r.mission.index,
      type: r.mission.type,
      title: r.mission.type === 'find' ? 'Find it' : 'Place it',
      startT: r.startT,
      endT: r.endT,
      success: r.success,
      mistakes: r.mistakes,
      modelAnswer: r.mission.modelAnswer,
      targetId: r.mission.type === 'find' ? r.mission.targetId : undefined,
      itemId: r.mission.type === 'place' ? r.mission.itemId : undefined,
      targetCell: r.mission.type === 'place' ? r.mission.targetCell : undefined,
    }));
    return { report, missions, records: this.records, extras: { initialScene: this.initial, initialWorld: { kind: 'tabletop' as const } } };
  }
}
