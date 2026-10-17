import type { ChatRecord, MissionRecord, SessionReport } from '../../../shared/analysis';
import type { OrderMission } from '../../../shared/cafe';
import type { Pose, RouteMission } from '../../../shared/city';
import type { SeekMission } from '../../../shared/bedroom';
import type { AgentTrace, ChatMessage, ClientMission, FxEvent, Held, HoverEvent, Replay, ReplayEvent, ReplayMission, RoomSettings, WorldState } from '../../../shared/protocol';
import type { Rng } from '../../../shared/rng';
import type { Cell, Difficulty, Mission, Role, SceneState } from '../../../shared/types';

/**
 * A level engine owns the world and the rules of one kind of level
 * (tabletop, order, walknav, walksearch). The Room owns everything that is
 * the same for every level: players, chat, timers, mission sequencing,
 * replays and the AI partner lifecycle.
 */

export type AnyMission = Mission | OrderMission | RouteMission | SeekMission;

/** What an engine may ask of its room. */
export interface EngineHost {
  readonly settings: RoomSettings;
  readonly rng: Rng;
  /** ms since the run started. */
  now(): number;
  fx(e: FxEvent): void;
  log(e: Omit<ReplayEvent, 't'>): void;
  broadcast(): void;
  /** The current mission is solved. */
  succeed(message?: string): void;
  /** A wrong action by the builder. */
  mistake(message: string, objectId?: string, cell?: Cell): void;
  /** Send a hover marker to everybody except `exceptPlayerId`. */
  emitHover(e: HoverEvent, byPlayerId: string): void;
  /** Send the walker's pose to everybody except `exceptPlayerId`. */
  emitPose(p: Pose, byPlayerId: string): void;
  /** Tell the bots something happened in the world. */
  notifyBots(e: FxEvent): void;
}

/** Everything an AI partner needs regardless of level. */
export interface BotIO {
  difficulty: Difficulty;
  rng: Rng;
  /** The AI player's id. */
  id: string;
  role: Role;
  /** Simulation: defer scheduled reactions while the other AI is speaking. */
  listening?(): boolean;
  say(text: string): void;
  /** Record a reasoning trace (shown in the agent panel + saved with the replay). */
  trace(t: Omit<AgentTrace, 'id' | 't' | 'role'>): void;
  /** Recent dialogue, oldest first (both roles). */
  transcript(): ChatMessage[];
}

export interface Bot {
  onMissionStart(m: AnyMission): void;
  onChat(msg: ChatMessage): void;
  onHover?(e: HoverEvent): void;
  onPose?(p: Pose): void;
  onFx(e: FxEvent): void;
  dispose(): void;
}

export interface ReportInput {
  messages: ChatRecord[];
  durationMs: number;
  humanRoles: Role[];
}

export interface LevelEngine {
  readonly kind: WorldState['kind'];
  missionsTotal(): number;
  /** Build a fresh world for a run (called when the countdown ends). */
  begin(seed: number): void;
  /** Make mission `index`, or null when the level has nothing left to ask. */
  startMission(index: number): AnyMission | null;
  mission(): AnyMission | null;
  /** The current mission is over (success or time). */
  endMission(): void;
  missionFor(view: Role, viewer: 'player' | 'spectator'): ClientMission | null;
  scene(): SceneState | null;
  world(view: Role): WorldState | null;
  held(): Held | null;

  // Actions. `role` is the acting player's role; engines ignore what that role may not do.
  hover?(role: Role, playerId: string, e: HoverEvent): void;
  pick?(role: Role, objectId: string): void;
  place?(role: Role, cell: Cell): void;
  drop?(role: Role): void;
  tray?(role: Role, objectId: string, add: boolean): void;
  serve?(role: Role): void;
  move?(role: Role, playerId: string, pose: Pose): void;
  open?(role: Role, id: string, open: boolean): void;

  createBot(io: BotIO): Bot;

  /** Post-game analysis + level-specific replay data. */
  report(input: ReportInput): { report: SessionReport; missions: ReplayMission[]; records: MissionRecord[]; extras: Partial<Replay> };
}
