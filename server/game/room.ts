import { nanoid } from 'nanoid';
import type { Server, Socket } from 'socket.io';
import { analyzeSession, type MissionRecord } from '../../shared/analysis';
import { buildScene, generateMission, isPickCorrect, isPlaceCorrect, missionPlan, moveObject } from '../../shared/missions';
import { createRng, randomSeed, type Rng } from '../../shared/rng';
import { occupiedKeys } from '../../shared/spatial';
import {
  DEFAULT_SETTINGS,
  type ChatMessage,
  type ClientMission,
  type ClientRoomState,
  type ClientToServer,
  type FxEvent,
  type Held,
  type HoverEvent,
  type Phase,
  type PlayerInfo,
  type Replay,
  type ReplayEvent,
  type RoomSettings,
  type ServerToClient,
  type Via,
} from '../../shared/protocol';
import { cellKey, otherRole, sameCell, type Cell, type Mission, type MissionType, type Role, type SceneState } from '../../shared/types';
import { createBot, type Bot } from './bots';

type IO = Server<ClientToServer, ServerToClient>;
export type GameSocket = Socket<ClientToServer, ServerToClient>;

interface Player extends PlayerInfo {
  socketId: string | null;
  spectator: boolean;
  lastSeen: number;
}

export interface RoomHooks {
  saveReplay(replay: Replay): Promise<void>;
  enrichReplay?(replay: Replay): Promise<void>;
}

const COUNTDOWN_MS = 3000;
const NEXT_MISSION_DELAY = 1600;
const MAX_CHAT = 300;

const BRIEFS: Record<MissionType, Record<Role, string>> = {
  find: {
    guide: 'Only you can see the target (gold ring). Tell your partner which object to pick up.',
    builder: 'Your guide knows which object is the target. Listen, ask, then click it!',
  },
  place: {
    guide: 'Tell your partner what to move and where. The ghost shows the target spot.',
    builder: 'Your guide will tell you what to move and where. Click an object, then a spot.',
  },
};

export class Room {
  readonly players = new Map<string, Player>();
  settings: RoomSettings = { ...DEFAULT_SETTINGS };
  phase: Phase = 'lobby';
  createdAt = Date.now();
  lastActivity = Date.now();

  scene: SceneState | null = null;
  private initialScene: SceneState | null = null;
  mission: Mission | null = null;
  private plan: MissionType[] = [];
  private records: MissionRecord[] = [];
  private completed: number[] = [];
  private mistakes = 0;
  held: Held | null = null;
  private rng: Rng = createRng(randomSeed());

  private countdownEndsAt: number | null = null;
  private startedAt: number | null = null;
  private endsAt: number | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  private chat: ChatMessage[] = [];
  private events: ReplayEvent[] = [];
  private lastHoverKey = '';
  private lastHoverLog = 0;
  private results: ClientRoomState['results'] = null;
  private bots: Bot[] = [];

  constructor(
    readonly code: string,
    private io: IO,
    private hooks: RoomHooks,
  ) {}

  // -------------------------------------------------------------------------
  // Players & lobby
  // -------------------------------------------------------------------------

  get humans() {
    return [...this.players.values()].filter((p) => !p.isAI && !p.spectator);
  }

  private roleHolder(role: Role) {
    return [...this.players.values()].find((p) => p.role === role && !p.spectator);
  }

  addPlayer(opts: { name: string; playerId?: string; role?: Role | null; spectate?: boolean }, socket: GameSocket): Player {
    this.touch();
    const existing = opts.playerId ? this.players.get(opts.playerId) : undefined;
    if (existing && !existing.isAI) {
      existing.socketId = socket.id;
      existing.connected = true;
      existing.name = opts.name || existing.name;
      this.bind(existing, socket);
      return existing;
    }
    const spectator = !!opts.spectate || (this.phase !== 'lobby' && !!this.roleHolder('guide') && !!this.roleHolder('builder'));
    const player: Player = {
      id: opts.playerId && !this.players.has(opts.playerId) ? opts.playerId : nanoid(10),
      name: (opts.name || 'Player').slice(0, 24),
      role: null,
      isAI: false,
      isHost: !spectator && this.humans.length === 0,
      connected: true,
      socketId: socket.id,
      spectator,
      lastSeen: Date.now(),
    };
    if (!spectator) {
      const wanted = opts.role && !this.roleHolder(opts.role) ? opts.role : null;
      player.role = wanted ?? (!this.roleHolder('guide') ? 'guide' : !this.roleHolder('builder') ? 'builder' : null);
    }
    this.players.set(player.id, player);
    this.bind(player, socket);
    this.syncAI();
    this.broadcast();
    return player;
  }

  private bind(player: Player, socket: GameSocket) {
    socket.join(this.code);
    socket.data.playerId = player.id;
    socket.data.roomCode = this.code;
    socket.emit('chat:history', this.chat);
    this.emitState(player);
  }

  disconnect(socketId: string) {
    for (const p of this.players.values())
      if (p.socketId === socketId) {
        p.connected = false;
        p.socketId = null;
        p.lastSeen = Date.now();
        if (p.isHost) this.reassignHost();
      }
    this.broadcast();
  }

  leave(playerId: string) {
    const p = this.players.get(playerId);
    if (!p) return;
    this.players.delete(playerId);
    if (p.isHost) this.reassignHost();
    if (this.phase === 'playing' && p.role) this.finish('abandoned');
    this.syncAI();
    this.broadcast();
  }

  private reassignHost() {
    const next = this.humans.find((p) => p.connected) ?? this.humans[0];
    for (const p of this.players.values()) p.isHost = p === next;
  }

  hasConnectedHumans() {
    return [...this.players.values()].some((p) => !p.isAI && p.connected);
  }

  updateSettings(playerId: string, patch: Partial<RoomSettings>) {
    const p = this.players.get(playerId);
    if (!p?.isHost || this.phase !== 'lobby') return;
    const next = { ...this.settings, ...patch };
    next.durationSec = Math.min(180, Math.max(45, Math.round(next.durationSec)));
    next.interests = next.interests.slice(0, 5);
    next.customKinds = next.customKinds.slice(0, 2);
    this.settings = next;
    if (next.mode === 'ai' && p.role === next.aiRole) p.role = otherRole(next.aiRole);
    this.syncAI();
    this.broadcast();
  }

  setRole(playerId: string, role: Role | null) {
    const p = this.players.get(playerId);
    if (!p || p.spectator || this.phase !== 'lobby') return;
    const holder = role ? this.roleHolder(role) : undefined;
    if (holder && holder !== p) {
      if (holder.isAI) {
        // Taking the AI's seat swaps the AI to the other role.
        this.settings.aiRole = otherRole(role!);
      } else holder.role = p.role;
    }
    p.role = role;
    this.syncAI();
    this.broadcast();
  }

  /** Keep exactly one AI player in AI mode, sitting in `settings.aiRole`. */
  private syncAI() {
    const ai = [...this.players.values()].find((p) => p.isAI);
    if (this.settings.mode !== 'ai') {
      if (ai) this.players.delete(ai.id);
      return;
    }
    const human = this.humans.find((h) => h.role === this.settings.aiRole);
    if (human) human.role = otherRole(this.settings.aiRole);
    for (const h of this.humans) if (!h.role) h.role = otherRole(this.settings.aiRole);
    if (ai) ai.role = this.settings.aiRole;
    else
      this.players.set(`ai-${this.code}`, {
        id: `ai-${this.code}`,
        name: this.settings.aiRole === 'guide' ? 'Nova (AI guide)' : 'Pixel (AI builder)',
        role: this.settings.aiRole,
        isAI: true,
        isHost: false,
        connected: true,
        socketId: null,
        spectator: false,
        lastSeen: Date.now(),
      });
    const bot = this.players.get(`ai-${this.code}`);
    if (bot) bot.name = this.settings.aiRole === 'guide' ? 'Nova (AI guide)' : 'Pixel (AI builder)';
  }

  // -------------------------------------------------------------------------
  // Run lifecycle
  // -------------------------------------------------------------------------

  start(playerId: string): string | null {
    const p = this.players.get(playerId);
    if (!p || p.spectator) return 'Only players can start the game.';
    if (this.phase !== 'lobby') return 'The game is already running.';
    if (!this.roleHolder('guide') || !this.roleHolder('builder')) return 'You need a guide and a builder (invite a friend or switch to AI partner).';
    this.touch();
    this.phase = 'countdown';
    this.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    this.later(COUNTDOWN_MS, () => this.begin());
    this.broadcast();
    return null;
  }

  private begin() {
    const seed = randomSeed();
    this.rng = createRng(seed);
    this.scene = buildScene({ seed, interests: this.settings.interests, difficulty: this.settings.difficulty, kinds: this.settings.customKinds });
    this.initialScene = structuredClone(this.scene);
    this.plan = missionPlan(this.rng);
    this.records = [];
    this.completed = [];
    this.mistakes = 0;
    this.held = null;
    this.events = [];
    this.results = null;
    this.chat = this.chat.filter((m) => m.via === 'system').slice(-5);
    this.phase = 'playing';
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + this.settings.durationSec * 1000;
    this.countdownEndsAt = null;
    this.bots.forEach((b) => b.dispose());
    const ai = [...this.players.values()].find((p) => p.isAI && p.role);
    this.bots = ai?.role ? [createBot(ai.role, this.botContext(ai))] : [];
    this.later(this.settings.durationSec * 1000, () => this.finish('timeup'));
    this.startMission(0);
  }

  private now() {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  private startMission(index: number) {
    if (!this.scene || this.phase !== 'playing') return;
    const type = this.plan[index] ?? 'find';
    const mission = generateMission(this.scene, index, type, this.settings.difficulty, this.rng);
    if (!mission) {
      this.finish('complete');
      return;
    }
    this.mission = mission;
    this.held = null;
    this.records.push({ mission, scene: structuredClone(this.scene), startT: this.now(), endT: this.now(), success: false, mistakes: 0 });
    this.log({ type: 'mission', missionIndex: index });
    this.fx({ type: 'mission', message: mission.type === 'find' ? 'Find it!' : 'Place it!' });
    this.broadcast();
    for (const b of this.bots) b.onMissionStart(mission);
  }

  private currentRecord() {
    return this.records[this.records.length - 1];
  }

  private succeed() {
    const rec = this.currentRecord();
    if (!rec || !this.mission) return;
    rec.success = true;
    rec.endT = this.now();
    this.completed.push(this.mission.index);
    this.log({ type: 'success', missionIndex: this.mission.index });
    this.fx({ type: 'success', message: 'Nice teamwork!' });
    for (const b of this.bots) b.onFx({ type: 'success' });
    const next = this.mission.index + 1;
    this.mission = null;
    this.broadcast();
    if (next >= this.plan.length) this.later(1200, () => this.finish('complete'));
    else this.later(NEXT_MISSION_DELAY, () => this.startMission(next));
  }

  private mistake(message: string, objectId?: string, cell?: Cell) {
    this.mistakes++;
    const rec = this.currentRecord();
    if (rec) rec.mistakes++;
    this.log({ type: 'wrong', objectId, cell, message });
    const e: FxEvent = { type: 'wrong', by: 'builder', objectId, cell, message };
    this.fx(e);
    for (const b of this.bots) b.onFx(e);
  }

  private async finish(reason: 'timeup' | 'complete' | 'abandoned') {
    if (this.phase !== 'playing') return;
    this.clearTimers();
    this.bots.forEach((b) => b.dispose());
    this.bots = [];
    const durationMs = this.now();
    const rec = this.currentRecord();
    if (rec && !rec.success) rec.endT = durationMs;
    this.log({ type: 'end', message: reason });
    this.phase = 'results';
    this.mission = null;
    this.held = null;
    this.fx({ type: reason === 'complete' ? 'complete' : 'timeup', message: reason === 'complete' ? 'All missions complete!' : "Time's up!" });

    const humanRoles = this.humans.map((h) => h.role).filter((r): r is Role => !!r);
    const messages = this.chat.filter((m) => m.role && m.t >= 0).map((m) => ({ id: m.id, t: m.t, role: m.role as Role, text: m.text }));
    const report = analyzeSession({ missions: this.records, messages, durationMs, missionsTotal: this.plan.length, humanRoles });
    const replay: Replay = {
      id: nanoid(12),
      createdAt: Date.now(),
      code: this.code,
      settings: { ...this.settings },
      players: [...this.players.values()].filter((p) => p.role && !p.spectator).map((p) => ({ name: p.name, role: p.role as Role, isAI: p.isAI })),
      initialScene: this.initialScene ?? this.scene!,
      missions: this.records.map((r) => ({
        index: r.mission.index,
        type: r.mission.type,
        startT: r.startT,
        endT: r.endT,
        success: r.success,
        mistakes: r.mistakes,
        modelAnswer: r.mission.modelAnswer,
        targetId: r.mission.type === 'find' ? r.mission.targetId : undefined,
        itemId: r.mission.type === 'place' ? r.mission.itemId : undefined,
        targetCell: r.mission.type === 'place' ? r.mission.targetCell : undefined,
      })),
      records: this.records,
      events: this.events,
      messages,
      durationMs,
      report,
    };
    this.results = { replayId: replay.id, report };
    this.broadcast();
    try {
      await this.hooks.saveReplay(replay);
      if (this.hooks.enrichReplay) {
        await this.hooks.enrichReplay(replay);
        if (replay.coaching && this.results?.replayId === replay.id) {
          this.results = { ...this.results, coaching: replay.coaching };
          this.broadcast();
        }
      }
    } catch (err) {
      console.warn('[room] saving replay failed', err);
    }
  }

  again(playerId: string) {
    const p = this.players.get(playerId);
    if (!p || p.spectator || this.phase !== 'results') return;
    this.phase = 'lobby';
    this.scene = null;
    this.mission = null;
    this.results = null;
    this.startedAt = this.endsAt = null;
    this.broadcast();
  }

  // -------------------------------------------------------------------------
  // Builder actions (validated on the server)
  // -------------------------------------------------------------------------

  private canAct(playerId: string) {
    const p = this.players.get(playerId);
    return this.phase === 'playing' && !!this.mission && !!this.scene && p?.role === 'builder';
  }

  hover(playerId: string, e: HoverEvent) {
    if (!this.canAct(playerId)) return;
    this.io.to(this.code).except(this.players.get(playerId)?.socketId ?? '').emit('hover', { ...e, by: playerId });
    const key = `${e.objectId ?? ''}|${e.cell ? cellKey(e.cell) : ''}`;
    const now = this.now();
    if (key !== this.lastHoverKey && now - this.lastHoverLog > 250) {
      this.lastHoverKey = key;
      this.lastHoverLog = now;
      this.log({ type: 'hover', objectId: e.objectId ?? undefined, cell: e.cell });
    }
    for (const b of this.bots) b.onHover(e);
  }

  pick(playerId: string, objectId: string) {
    if (!this.canAct(playerId)) return;
    const obj = this.scene!.objects.find((o) => o.id === objectId);
    if (!obj) return;
    this.touch();
    const m = this.mission!;
    if (m.type === 'find') {
      if (isPickCorrect(m, objectId)) {
        this.log({ type: 'pick', objectId });
        this.fx({ type: 'pick', by: 'builder', objectId });
        this.succeed();
      } else this.mistake('Not that one!', objectId);
      return;
    }
    if (this.held?.objectId === objectId) return;
    this.held = { objectId, from: obj.cell };
    this.log({ type: 'pick', objectId });
    const e: FxEvent = { type: 'pick', by: 'builder', objectId };
    this.fx(e);
    for (const b of this.bots) b.onFx(e);
    this.broadcast();
  }

  place(playerId: string, cell: Cell) {
    if (!this.canAct(playerId) || !this.held) return;
    const { objectId, from } = this.held;
    const occupied = occupiedKeys(this.scene!, objectId);
    if (occupied.has(cellKey(cell))) return;
    this.touch();
    this.scene = moveObject(this.scene!, objectId, cell);
    this.held = null;
    this.log({ type: 'place', objectId, cell });
    this.fx({ type: 'place', by: 'builder', objectId, cell });
    const m = this.mission!;
    if (isPlaceCorrect(m, objectId, cell)) this.succeed();
    else {
      if (!sameCell(cell, from)) this.mistake(m.type === 'place' && m.itemId !== objectId ? 'Wrong object!' : 'Not quite!', objectId, cell);
      this.broadcast();
    }
  }

  drop(playerId: string) {
    if (!this.canAct(playerId) || !this.held) return;
    this.log({ type: 'drop', objectId: this.held.objectId });
    this.held = null;
    this.broadcast();
  }

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------

  say(playerId: string, text: string, via: Via) {
    const p = this.players.get(playerId);
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT);
    if (!p || !clean) return;
    this.touch();
    const msg: ChatMessage = {
      id: nanoid(8),
      t: this.startedAt && this.phase === 'playing' ? this.now() : -1,
      at: Date.now(),
      playerId: p.id,
      name: p.name,
      role: p.spectator ? null : p.role,
      text: clean,
      via: p.isAI ? 'ai' : via,
    };
    this.chat.push(msg);
    if (this.chat.length > 400) this.chat.shift();
    this.io.to(this.code).emit('chat', msg);
    if (this.phase === 'playing') for (const b of this.bots) if (msg.playerId !== `ai-${this.code}`) b.onChat(msg);
  }

  // -------------------------------------------------------------------------
  // State fan-out
  // -------------------------------------------------------------------------

  private missionFor(p: Player): ClientMission | null {
    const m = this.mission;
    if (!m) return null;
    const seesSecret = p.spectator || p.role === 'guide';
    const base: ClientMission = { id: m.id, index: m.index, type: m.type, brief: BRIEFS[m.type][p.role === 'guide' || p.spectator ? 'guide' : 'builder'] };
    if (!seesSecret) return base;
    return {
      ...base,
      modelAnswer: m.modelAnswer,
      hint: m.hint,
      targetId: m.type === 'find' ? m.targetId : undefined,
      itemId: m.type === 'place' ? m.itemId : undefined,
      targetCell: m.type === 'place' ? m.targetCell : undefined,
    };
  }

  stateFor(p: Player): ClientRoomState {
    return {
      code: this.code,
      phase: this.phase,
      you: p.id,
      yourRole: p.spectator ? null : p.role,
      spectator: p.spectator,
      players: [...this.players.values()].map(({ id, name, role, isAI, isHost, connected }) => ({ id, name, role, isAI, isHost, connected })),
      settings: this.settings,
      scene: this.scene,
      held: this.held,
      mission: this.missionFor(p),
      missionsTotal: this.plan.length || 3,
      completed: this.completed,
      mistakes: this.mistakes,
      countdownEndsAt: this.countdownEndsAt,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      serverNow: Date.now(),
      results: this.results,
    };
  }

  private emitState(p: Player) {
    if (p.socketId) this.io.to(p.socketId).emit('room:state', this.stateFor(p));
  }

  broadcast() {
    for (const p of this.players.values()) this.emitState(p);
  }

  private fx(e: FxEvent) {
    this.io.to(this.code).emit('fx', e);
  }

  private log(e: Omit<ReplayEvent, 't'>) {
    this.events.push({ t: this.now(), ...e });
  }

  private touch() {
    this.lastActivity = Date.now();
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  dispose() {
    this.clearTimers();
    this.bots.forEach((b) => b.dispose());
  }

  // -------------------------------------------------------------------------
  // AI partner bridge
  // -------------------------------------------------------------------------

  private botContext(ai: Player) {
    return {
      difficulty: this.settings.difficulty,
      rng: this.rng,
      scene: () => this.scene,
      mission: () => this.mission,
      held: () => this.held,
      say: (text: string) => this.say(ai.id, text, 'ai'),
      hover: (e: HoverEvent) => {
        if (ai.role !== 'builder' || this.phase !== 'playing') return;
        this.io.to(this.code).emit('hover', { ...e, by: ai.id });
        this.log({ type: 'hover', objectId: e.objectId ?? undefined, cell: e.cell });
      },
      pick: (objectId: string) => this.pick(ai.id, objectId),
      place: (cell: Cell) => this.place(ai.id, cell),
    };
  }
}
