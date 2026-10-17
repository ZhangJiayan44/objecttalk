import { nanoid } from 'nanoid';
import type { Server, Socket } from 'socket.io';
import { getKind } from '../../shared/catalog';
import { isLevel, levelOf } from '../../shared/levels';
import { dailySeed, questsFor } from '../../shared/quests';
import { glossaryTranslate, hasChinese, lifelinePenalty, MAX_LIFELINES, saidLifeline, type Lifeline } from '../../shared/lifeline';
import { createRng, randomSeed, type Rng } from '../../shared/rng';
import { speechDuration } from '../../shared/speech';
import {
  DEFAULT_SETTINGS,
  type AgentTrace,
  type ChatMessage,
  type ClientRoomState,
  type ClientToServer,
  type FxEvent,
  type HoverEvent,
  type Phase,
  type PlayerInfo,
  type Pose,
  type Replay,
  type ReplayEvent,
  type RoomSettings,
  type ServerToClient,
  type Via,
} from '../../shared/protocol';
import { otherRole, ROLES, type Cell, type Role } from '../../shared/types';
import type { SessionReport } from '../../shared/analysis';
import { BedroomEngine } from './engines/bedroom';
import { CafeEngine } from './engines/cafe';
import { CityEngine } from './engines/city';
import { TabletopEngine } from './engines/tabletop';
import type { AnyMission, Bot, EngineHost, LevelEngine } from './engines/types';

type IO = Server<ClientToServer, ServerToClient>;
export type GameSocket = Socket<ClientToServer, ServerToClient>;

interface Player extends PlayerInfo {
  socketId: string | null;
  spectator: boolean;
  /** Which role's filtered view a spectator / sim-mode viewer receives. */
  viewAs: Role | null;
  lastSeen: number;
}

export interface RoomHooks {
  saveReplay(replay: Replay): Promise<void>;
  enrichReplay?(replay: Replay): Promise<void>;
}

const COUNTDOWN_MS = 3000;
const NEXT_MISSION_DELAY = 1600;
const MAX_CHAT = 300;
const AI_NAMES: Record<Role, string> = { guide: 'Nova', builder: 'Pixel' };

function createEngine(kind: string, host: EngineHost): LevelEngine {
  if (kind === 'order') return new CafeEngine(host);
  if (kind === 'walknav') return new CityEngine(host);
  if (kind === 'walksearch') return new BedroomEngine(host);
  return new TabletopEngine(host);
}

export class Room {
  readonly players = new Map<string, Player>();
  settings: RoomSettings = { ...DEFAULT_SETTINGS };
  phase: Phase = 'lobby';
  createdAt = Date.now();
  lastActivity = Date.now();

  private engine: LevelEngine | null = null;
  private completed: number[] = [];
  private mistakes = 0;
  rng: Rng = createRng(randomSeed());

  private countdownEndsAt: number | null = null;
  private startedAt: number | null = null;
  private endsAt: number | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  private chat: ChatMessage[] = [];
  private events: ReplayEvent[] = [];
  private traces: AgentTrace[] = [];
  /** Chinese lifelines per player id: private to that player, scored and taught after the game. */
  private lifelines = new Map<string, Lifeline[]>();
  /** Chat message ids the player said with a lifeline's help (not counted for the CEFR estimate). */
  private assisted = new Set<string>();
  private results: ClientRoomState['results'] = null;
  private bots = new Map<string, Bot>();
  private speechQueue: { message: ChatMessage; missionId: string }[] = [];
  private speech: { message: ChatMessage; missionId: string; timer: ReturnType<typeof setTimeout>; playback: boolean } | null = null;

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

  addPlayer(opts: { name: string; playerId?: string; role?: Role | null; spectate?: boolean; viewAs?: Role | null }, socket: GameSocket): Player {
    this.touch();
    const existing = opts.playerId ? this.players.get(opts.playerId) : undefined;
    if (existing && !existing.isAI) {
      existing.socketId = socket.id;
      existing.connected = true;
      existing.name = opts.name || existing.name;
      if (opts.viewAs) existing.viewAs = opts.viewAs;
      this.bind(existing, socket);
      this.broadcast();
      return existing;
    }
    const sim = this.settings.mode === 'sim';
    const spectator = !!opts.spectate || (this.phase !== 'lobby' && !sim && !!this.roleHolder('guide') && !!this.roleHolder('builder'));
    const player: Player = {
      id: opts.playerId && !this.players.has(opts.playerId) ? opts.playerId : nanoid(10),
      name: (opts.name || 'Player').slice(0, 24),
      role: null,
      isAI: false,
      isHost: !spectator && this.humans.length === 0,
      connected: true,
      socketId: socket.id,
      spectator,
      viewAs: opts.viewAs ?? null,
      lastSeen: Date.now(),
    };
    if (!spectator && !sim) {
      const wanted = opts.role && !this.roleHolder(opts.role) ? opts.role : null;
      player.role = wanted ?? (!this.roleHolder('guide') ? 'guide' : !this.roleHolder('builder') ? 'builder' : null);
    }
    if (sim && !player.viewAs) player.viewAs = this.humans.some((h) => h.viewAs === 'guide') ? 'builder' : 'guide';
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
    if (this.phase === 'playing' && p.role && this.settings.mode !== 'sim') void this.finish('abandoned');
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
    if (!isLevel(next.level)) next.level = this.settings.level;
    // A new level brings its own default round length.
    if (patch.level && patch.level !== this.settings.level && patch.durationSec === undefined) next.durationSec = levelOf(next.level).durationSec;
    next.durationSec = Math.min(next.level === 'nightmarket' ? 300 : 240, Math.max(45, Math.round(next.durationSec)));
    next.interests = next.interests.slice(0, 5);
    // Only real item kinds (a player's own Object Studio objects), at most two.
    next.customKinds = (Array.isArray(next.customKinds) ? next.customKinds : []).filter((k) => typeof k === 'string' && !!getKind(k)).slice(0, 2);
    if (!['easy', 'normal', 'tricky'].includes(next.difficulty)) next.difficulty = this.settings.difficulty;
    if (next.aiRole !== 'guide' && next.aiRole !== 'builder') next.aiRole = this.settings.aiRole;
    // A quest must exist for the level's engine (switching levels resets it).
    const engine = levelOf(next.level).engine;
    if (!questsFor(engine).some((q) => q.id === next.quest)) next.quest = 'mixed';
    next.daily = !!next.daily;
    if (!['duo', 'ai', 'sim'].includes(next.mode)) next.mode = 'duo';
    this.settings = next;
    if (next.mode === 'ai' && p.role === next.aiRole) p.role = otherRole(next.aiRole);
    this.syncAI();
    this.broadcast();
  }

  setRole(playerId: string, role: Role | null) {
    const p = this.players.get(playerId);
    if (!p || p.spectator || this.phase !== 'lobby') return;
    if (this.settings.mode === 'sim') {
      p.viewAs = role;
      this.broadcast();
      return;
    }
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

  private aiName(role: Role) {
    const copy = levelOf(this.settings.level).roles[role];
    return `${AI_NAMES[role]} (AI ${copy.name.toLowerCase()})`;
  }

  /** ai mode: one AI in `settings.aiRole`; sim mode: AIs in both seats, humans watch. */
  private syncAI() {
    const mode = this.settings.mode;
    const want: Role[] = mode === 'ai' ? [this.settings.aiRole] : mode === 'sim' ? [...ROLES] : [];
    for (const p of [...this.players.values()]) if (p.isAI && (!p.role || !want.includes(p.role))) this.players.delete(p.id);
    if (mode === 'sim') {
      for (const h of this.humans) {
        h.role = null;
        h.viewAs ??= 'guide';
      }
    } else {
      for (const h of this.humans) if (h.role && want.includes(h.role)) h.role = null;
      for (const h of this.humans)
        if (!h.role) {
          const free = ROLES.find((r) => !want.includes(r) && !this.roleHolder(r));
          if (free) h.role = free;
        }
    }
    for (const role of want) {
      const id = `ai-${role}-${this.code}`;
      const existing = this.players.get(id);
      if (existing) existing.name = this.aiName(role);
      else
        this.players.set(id, {
          id,
          name: this.aiName(role),
          role,
          isAI: true,
          isHost: false,
          connected: true,
          socketId: null,
          spectator: false,
          viewAs: null,
          lastSeen: Date.now(),
        });
    }
  }

  // -------------------------------------------------------------------------
  // Run lifecycle
  // -------------------------------------------------------------------------

  start(playerId: string): string | null {
    const p = this.players.get(playerId);
    const sim = this.settings.mode === 'sim';
    if (!p || (p.spectator && !sim)) return 'Only players can start the game.';
    if (sim && !p.isHost) return 'Only the host can start the simulation.';
    if (this.phase !== 'lobby') return 'The game is already running.';
    if (!this.roleHolder('guide') || !this.roleHolder('builder')) return 'You need both seats filled (invite a friend or switch to AI partner).';
    this.touch();
    this.phase = 'countdown';
    this.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    this.later(COUNTDOWN_MS, () => this.begin());
    this.broadcast();
    return null;
  }

  private host(): EngineHost {
    return {
      settings: this.settings,
      rng: this.rng,
      now: () => this.now(),
      fx: (e) => this.fx(e),
      log: (e) => this.log(e),
      broadcast: () => this.broadcast(),
      succeed: (message) => this.succeed(message),
      mistake: (message, objectId, cell) => this.mistake(message, objectId, cell),
      emitHover: (e, by) => this.emitHover(e, by),
      emitPose: (p, by) => this.emitPose(p, by),
      notifyBots: (e) => {
        for (const b of this.bots.values()) b.onFx(e);
      },
    };
  }

  private begin() {
    // The Daily Challenge plays today's world: same seed for everyone, so scores compare.
    const seed = this.settings.daily ? dailySeed(this.settings.level) : randomSeed();
    this.rng = createRng(seed);
    this.engine = createEngine(levelOf(this.settings.level).engine, this.host());
    this.engine.begin(seed);
    this.completed = [];
    this.mistakes = 0;
    this.events = [];
    this.traces = [];
    this.lifelines.clear();
    this.assisted.clear();
    this.results = null;
    this.chat = this.chat.filter((m) => m.via === 'system').slice(-5);
    this.phase = 'playing';
    this.startedAt = Date.now();
    this.endsAt = this.startedAt + this.settings.durationSec * 1000;
    this.countdownEndsAt = null;
    this.disposeBots();
    for (const ai of this.players.values()) {
      if (!ai.isAI || !ai.role) continue;
      const role = ai.role;
      this.bots.set(
        ai.id,
        this.engine.createBot({
          difficulty: this.settings.difficulty,
          rng: this.rng,
          id: ai.id,
          role,
          listening: () => this.settings.mode === 'sim' && !!this.speech && this.speech.message.role !== role,
          say: (text) => this.say(ai.id, text, 'ai'),
          trace: (t) => this.trace(role, t),
          transcript: () => this.chat.filter((m) => m.t >= 0 && m.role).slice(-16),
        }),
      );
    }
    this.later(this.settings.durationSec * 1000, () => void this.finish('timeup'));
    this.startMission(0);
  }

  private now() {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  private startMission(index: number) {
    if (!this.engine || this.phase !== 'playing') return;
    this.clearSpeech();
    const mission = this.engine.startMission(index);
    if (!mission) {
      void this.finish('complete');
      return;
    }
    this.log({ type: 'mission', missionIndex: index });
    this.fx({ type: 'mission', message: missionCheer(mission) });
    this.broadcast();
    for (const b of this.bots.values()) b.onMissionStart(mission);
  }

  private succeed(message?: string) {
    const engine = this.engine;
    const m = engine?.mission();
    if (!engine || !m) return;
    this.completed.push(m.index);
    this.log({ type: 'success', missionIndex: m.index });
    this.fx({ type: 'success', message: message ?? 'Nice teamwork!' });
    for (const b of this.bots.values()) b.onFx({ type: 'success' });
    engine.endMission();
    this.broadcast();
    const next = m.index + 1;
    if (next >= engine.missionsTotal()) this.later(1200, () => void this.finish('complete'));
    else this.later(NEXT_MISSION_DELAY, () => this.startMission(next));
  }

  private mistake(message: string, objectId?: string, cell?: Cell) {
    this.mistakes++;
    this.log({ type: 'wrong', objectId, cell, message });
    const e: FxEvent = { type: 'wrong', by: 'builder', objectId, cell, message };
    this.fx(e);
    for (const b of this.bots.values()) b.onFx(e);
  }

  private async finish(reason: 'timeup' | 'complete' | 'abandoned') {
    if (this.phase !== 'playing' || !this.engine) return;
    this.clearTimers();
    this.disposeBots();
    const durationMs = this.now();
    this.engine.endMission();
    this.log({ type: 'end', message: reason });
    this.phase = 'results';
    this.fx({ type: reason === 'complete' ? 'complete' : 'timeup', message: reason === 'complete' ? 'All missions complete!' : "Time's up!" });

    const humanRoles = this.settings.mode === 'sim' ? [] : this.humans.map((h) => h.role).filter((r): r is Role => !!r);
    const messages = this.chat.filter((m) => m.role && m.t >= 0).map((m) => ({ id: m.id, t: m.t, role: m.role as Role, text: m.text, ...(this.assisted.has(m.id) ? { assisted: true } : {}) }));
    const { report, missions, records, extras } = this.engine.report({ messages, durationMs, humanRoles });
    this.applyLifelines(report);
    const replay: Replay = {
      id: nanoid(12),
      createdAt: Date.now(),
      code: this.code,
      level: this.settings.level,
      settings: { ...this.settings },
      players: [...this.players.values()].filter((p) => p.role && !p.spectator).map((p) => ({ name: p.name, role: p.role as Role, isAI: p.isAI })),
      initialScene: null,
      missions,
      records,
      events: this.events,
      messages,
      traces: this.traces,
      durationMs,
      report,
      ...extras,
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
    if (!p || (p.spectator && this.settings.mode !== 'sim') || this.phase !== 'results') return;
    this.phase = 'lobby';
    this.engine = null;
    this.results = null;
    this.completed = [];
    this.mistakes = 0;
    this.startedAt = this.endsAt = null;
    this.broadcast();
  }

  // -------------------------------------------------------------------------
  // Player actions (validated by the engines)
  // -------------------------------------------------------------------------

  private actor(playerId: string): Role | null {
    const p = this.players.get(playerId);
    return this.phase === 'playing' && this.engine && p?.role && !p.spectator ? p.role : null;
  }

  hover(playerId: string, e: HoverEvent) {
    const role = this.actor(playerId);
    if (role) this.engine!.hover?.(role, playerId, e);
  }

  pick(playerId: string, objectId: string) {
    const role = this.actor(playerId);
    if (!role) return;
    this.touch();
    this.engine!.pick?.(role, objectId);
  }

  place(playerId: string, cell: Cell) {
    const role = this.actor(playerId);
    if (!role) return;
    this.touch();
    this.engine!.place?.(role, cell);
  }

  drop(playerId: string) {
    const role = this.actor(playerId);
    if (role) this.engine!.drop?.(role);
  }

  tray(playerId: string, objectId: string, add: boolean) {
    const role = this.actor(playerId);
    if (!role) return;
    this.touch();
    this.engine!.tray?.(role, objectId, add);
  }

  serve(playerId: string) {
    const role = this.actor(playerId);
    if (!role) return;
    this.touch();
    this.engine!.serve?.(role);
  }

  move(playerId: string, pose: Pose) {
    const role = this.actor(playerId);
    if (role) this.engine!.move?.(role, playerId, pose);
  }

  open(playerId: string, id: string, open: boolean) {
    const role = this.actor(playerId);
    if (role) this.engine!.open?.(role, id, open);
  }

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------

  say(playerId: string, text: string, via: Via) {
    const p = this.players.get(playerId);
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT);
    if (!p || !clean) return;
    this.touch();
    // The partner must hear English: Chinese goes through the private lifeline instead (chat:assist).
    if (!p.isAI && this.phase === 'playing' && hasChinese(clean)) return;
    const mine = this.lifelines.get(p.id);
    const pending = mine?.filter((l) => !l.used && saidLifeline(l.en, clean)) ?? [];
    for (const l of pending) l.used = true;
    if (pending.length) this.emitState(p);
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
    if (pending.length) this.assisted.add(msg.id);
    if (this.phase === 'playing' && this.settings.mode === 'sim' && p.isAI) {
      const mission = this.engine?.mission();
      if (!mission || this.completed.includes(mission.index)) return;
      if (!this.speechQueue.some((e) => e.message.playerId === msg.playerId && e.message.text === msg.text)) {
        this.speechQueue.push({ message: msg, missionId: mission.id });
      }
      this.nextSpeech();
      return;
    }
    this.publishChat(msg);
    if (this.phase !== 'playing') return;
    const missionId = this.engine?.mission()?.id;
    const delay = p.isAI ? speechDuration(clean) : 200;
    for (const [id, b] of this.bots) if (msg.playerId !== id) this.later(delay, () => {
      if (this.phase === 'playing' && this.engine?.mission()?.id === missionId) b.onChat(msg);
    });
  }

  private publishChat(msg: ChatMessage) {
    this.chat.push(msg);
    if (this.chat.length > 400) this.chat.shift();
    this.io.to(this.code).emit('chat', msg);
  }

  private nextSpeech(): void {
    if (this.speech || this.phase !== 'playing') return;
    const entry = this.speechQueue.shift();
    if (!entry) return;
    const mission = this.engine?.mission();
    if (mission?.id !== entry.missionId || this.completed.includes(mission.index)) return this.nextSpeech();
    const message = { ...entry.message, at: Date.now(), t: this.now() };
    this.speech = { ...entry, message, playback: false, timer: this.later(speechDuration(message.text), () => this.endSpeech(message.id)) };
    this.publishChat(message);
  }

  /** Only the simulation host controls pacing; spectator tabs cannot end a line early. */
  playback(playerId: string, id: string, state: 'started' | 'ended' | 'unavailable') {
    const p = this.players.get(playerId);
    const speech = this.speech;
    if (!p?.connected || !p.isHost || this.settings.mode !== 'sim' || this.phase !== 'playing' || speech?.message.id !== id) return;
    if (state === 'ended') {
      if (speech.playback) this.endSpeech(id);
    } else if (state === 'started' && !speech.playback) {
      speech.playback = true;
      this.cancelTimer(speech.timer);
      // A disconnected tab or stalled synthesis must not deadlock the simulation.
      speech.timer = this.later(60_000, () => this.endSpeech(id));
    } else if (state === 'unavailable' && speech.playback) {
      speech.playback = false;
      this.cancelTimer(speech.timer);
      speech.timer = this.later(Math.max(200, speechDuration(speech.message.text) - (Date.now() - speech.message.at)), () => this.endSpeech(id));
    }
  }

  private endSpeech(id: string) {
    const speech = this.speech;
    if (!speech || speech.message.id !== id) return;
    this.cancelTimer(speech.timer);
    this.speech = null;
    const mission = this.engine?.mission();
    if (this.phase === 'playing' && mission?.id === speech.missionId && !this.completed.includes(mission.index)) {
      for (const [botId, b] of this.bots) if (botId !== speech.message.playerId) b.onChat(speech.message);
    }
    this.nextSpeech();
  }

  private clearSpeech() {
    if (this.speech) this.cancelTimer(this.speech.timer);
    this.speech = null;
    this.speechQueue = [];
  }

  /**
   * Chinese lifeline: the player is stuck and says it in Chinese. They get an English line back
   * privately (LLM, or the offline glossary) and must say it themselves; the partner never sees
   * the Chinese. Each lifeline after the first costs a few points, and the report teaches them.
   */
  async assist(playerId: string, zh: string, translate: (zh: string, context: string) => Promise<string | null>): Promise<{ en: string; source: 'llm' | 'glossary'; left: number } | { error: string }> {
    const p = this.players.get(playerId);
    const clean = zh.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!p || p.isAI || p.spectator || !p.role) return { error: 'Only players can ask for help.' };
    if (this.phase !== 'playing') return { error: 'The lifeline works during a round.' };
    if (!hasChinese(clean)) return { error: 'Type or say it in Chinese (中文) and I will give you the English.' };
    const mine = this.lifelines.get(p.id) ?? [];
    if (mine.length >= MAX_LIFELINES) return { error: 'No lifelines left this round: try simple words!' };
    this.touch();
    const level = levelOf(this.settings.level);
    const things = this.engine?.scene()?.objects.map((o) => o.kind) ?? [];
    const context = `${level.title} (${level.tagline}). The player is the ${level.roles[p.role].name}. Things here: ${[...new Set(things)].slice(0, 16).join(', ') || 'see the level'}.`;
    const llm = await translate(clean, context).catch(() => null);
    const en = llm ?? glossaryTranslate(clean);
    if (!en) return { error: 'Sorry, I could not translate that. Try a shorter phrase.' };
    if (this.phase !== 'playing') return { error: 'The round is over.' };
    const entry: Lifeline = { t: this.now(), zh: clean, en, source: llm ? 'llm' : 'glossary', used: false };
    this.lifelines.set(p.id, [...mine, entry]);
    this.emitState(p);
    return { en, source: entry.source, left: MAX_LIFELINES - mine.length - 1 };
  }

  /** Fold the human players' lifelines into the report: a small score cost and a "borrowed words" list. */
  private applyLifelines(report: SessionReport) {
    const all = [...this.lifelines.entries()].flatMap(([id, list]) => list.map((l) => ({ ...l, role: this.players.get(id)?.role ?? null })));
    if (!all.length) return;
    report.lifelines = all.map(({ role, ...l }) => ({ ...l, role }));
    const cost = lifelinePenalty(all.length);
    if (!cost) return;
    report.lifelinePenalty = cost;
    report.clarity = Math.max(0, report.clarity - cost);
    if (report.stars === 3 && report.clarity < 75) report.stars = 2;
  }

  private trace(role: Role, t: Omit<AgentTrace, 'id' | 't' | 'role'>) {
    const full: AgentTrace = { id: nanoid(8), t: this.now(), role, ...t };
    this.traces.push(full);
    if (this.traces.length > 300) this.traces.shift();
    this.io.to(this.code).emit('ai:trace', full);
  }

  // -------------------------------------------------------------------------
  // State fan-out
  // -------------------------------------------------------------------------

  /** Whose information a player gets: their own role, or the role a viewer chose (guide by default). */
  private viewOf(p: Player): Role {
    if (p.role && !p.spectator) return p.role;
    return p.viewAs ?? 'guide';
  }

  stateFor(p: Player): ClientRoomState {
    const view = this.viewOf(p);
    const engine = this.phase === 'playing' || this.phase === 'countdown' ? this.engine : null;
    return {
      code: this.code,
      phase: this.phase,
      you: p.id,
      yourRole: p.spectator ? null : p.role,
      spectator: p.spectator || (!p.role && this.settings.mode === 'sim'),
      viewAs: p.role && !p.spectator ? null : view,
      players: [...this.players.values()].map(({ id, name, role, isAI, isHost, connected }) => ({ id, name, role, isAI, isHost, connected })),
      settings: this.settings,
      scene: engine?.scene() ?? null,
      world: engine?.world(view) ?? null,
      held: engine?.held() ?? null,
      mission: engine?.missionFor(view, p.role && !p.spectator ? 'player' : 'spectator') ?? null,
      missionsTotal: engine?.missionsTotal() ?? levelOf(this.settings.level).missions,
      completed: this.completed,
      mistakes: this.mistakes,
      countdownEndsAt: this.countdownEndsAt,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      serverNow: Date.now(),
      results: this.results,
      lifelines: this.lifelines.get(p.id) ?? [],
    };
  }

  private emitState(p: Player) {
    if (p.socketId) this.io.to(p.socketId).emit('room:state', this.stateFor(p));
  }

  broadcast() {
    for (const p of this.players.values()) this.emitState(p);
  }

  private emitHover(e: HoverEvent, by: string) {
    const sock = this.players.get(by)?.socketId;
    (sock ? this.io.to(this.code).except(sock) : this.io.to(this.code)).emit('hover', { ...e, by });
    for (const [id, b] of this.bots) if (id !== by) b.onHover?.(e);
  }

  private emitPose(p: Pose, by: string) {
    const sock = this.players.get(by)?.socketId;
    (sock ? this.io.to(this.code).except(sock) : this.io.to(this.code)).emit('pose', { ...p, by });
    for (const [id, b] of this.bots) if (id !== by) b.onPose?.(p);
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
    return t;
  }

  private cancelTimer(t: ReturnType<typeof setTimeout>) {
    clearTimeout(t);
    this.timers.delete(t);
  }

  private clearTimers() {
    this.clearSpeech();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private disposeBots() {
    for (const b of this.bots.values()) b.dispose();
    this.bots.clear();
  }

  dispose() {
    this.clearTimers();
    this.disposeBots();
  }
}

function missionCheer(m: AnyMission): string {
  switch (m.type) {
    case 'find':
      return 'Find it!';
    case 'place':
      return 'Place it!';
    case 'order':
      return 'New customer!';
    case 'route':
      return 'Where to?';
    case 'seek':
      return 'Something is lost!';
  }
}
