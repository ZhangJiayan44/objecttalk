import type { ChatRecord, MissionRecord, SessionReport } from './analysis';
import type { BedroomItem } from './bedroom';
import type { OrderLine } from './cafe';
import type { Pose, Town } from './city';
import type { LevelMeta } from './levels';
import type { Lifeline } from './lifeline';
import type { Cell, Difficulty, InterestId, ItemKind, MissionType, Role, SceneState } from './types';

/**
 * Socket.IO protocol. The server is authoritative and sends each socket a
 * role-filtered view: the builder never receives the target, so the
 * information gap is enforced on the wire, not just hidden in the UI.
 */

/** duo: two humans; ai: one human + an AI partner; sim: two AI partners, humans watch. */
export type Mode = 'duo' | 'ai' | 'sim';
export type Phase = 'lobby' | 'countdown' | 'playing' | 'results';
export type Via = 'voice' | 'text' | 'quick' | 'ai' | 'system';

export interface PlayerInfo {
  id: string;
  name: string;
  role: Role | null;
  isAI: boolean;
  isHost: boolean;
  connected: boolean;
}

export interface RoomSettings {
  /** A built-in level id (study, cafe, city, bedroom) or an agent-made level id. */
  level: string;
  mode: Mode;
  /** Role the AI partner plays in `ai` mode. */
  aiRole: Role;
  interests: InterestId[];
  difficulty: Difficulty;
  durationSec: number;
  /** Extra item kinds (e.g. a player's own Rodin object) to put on the table. */
  customKinds: string[];
  /** What the round is about (shared/quests.ts); 'mixed' when unset. */
  quest?: string;
  /** Daily Challenge: today's fixed world + missions, the same in every room. */
  daily?: boolean;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  level: 'study',
  mode: 'duo',
  aiRole: 'guide',
  interests: ['space', 'food', 'games'],
  difficulty: 'normal',
  durationSec: 90,
  customKinds: [],
};

export type { Pose };

/**
 * Level-specific shared world. The tabletop and the cafe display case live in
 * `ClientRoomState.scene`; walking levels add the walker's pose.
 */
export type WorldState =
  | { kind: 'tabletop' }
  | { kind: 'cafe'; tray: string[]; served: number; market?: { pose: Pose } }
  | { kind: 'city'; town: Town; pose: Pose }
  | { kind: 'bedroom'; items: BedroomItem[]; found: string[]; pose: Pose; open: string[] };

/** What every player may know about the current mission. */
export interface PublicMission {
  id: string;
  index: number;
  type: MissionType;
  /** Short card title, e.g. "Find it", "Order 2", "Get to the hospital". */
  title: string;
  brief: string;
  /** City: where the walker wants to go (the walker knows the name, not the way). */
  destination?: string;
}

/** Extra information only the guide (and guide-view spectators) receive. */
export interface SecretMission {
  targetId?: string;
  itemId?: string;
  targetCell?: Cell;
  /** Cafe: the customer's order card. */
  order?: OrderLine[];
  /** Bedroom: the spot the lost item is in. */
  spotId?: string;
  modelAnswer: string;
  hint: string;
}

export type ClientMission = PublicMission & Partial<SecretMission>;

export interface Held {
  objectId: string;
  from: Cell;
}

export interface ClientRoomState {
  code: string;
  phase: Phase;
  you: string;
  yourRole: Role | null;
  spectator: boolean;
  /** Spectators (and sim-mode viewers) see one role's filtered view. */
  viewAs: Role | null;
  players: PlayerInfo[];
  settings: RoomSettings;
  scene: SceneState | null;
  world: WorldState | null;
  held: Held | null;
  mission: ClientMission | null;
  missionsTotal: number;
  completed: number[];
  mistakes: number;
  countdownEndsAt: number | null;
  startedAt: number | null;
  endsAt: number | null;
  serverNow: number;
  results: { replayId: string; report: SessionReport; coaching?: Coaching } | null;
  /** Your own Chinese lifelines this run (private: never sent to the partner). */
  lifelines: Lifeline[];
}

/** Optional LLM-written coaching layered on top of the rule-based report. */
export interface Coaching {
  summary: string;
  rewrites: { original: string; better: string; why: string }[];
  /** CEFR estimate refined by the LLM coach (the rule estimate is in the report). */
  /** Which model wrote it. */
  model?: string;
  cefr?: string;
}

export interface ChatMessage {
  id: string;
  /** ms since the run started (negative in the lobby). */
  t: number;
  at: number;
  playerId: string;
  name: string;
  role: Role | null;
  text: string;
  via: Via;
}

export type FxType = 'pick' | 'place' | 'drop' | 'wrong' | 'success' | 'mission' | 'timeup' | 'complete' | 'tray' | 'serve' | 'reveal' | 'arrive';

export interface FxEvent {
  type: FxType;
  by?: Role;
  objectId?: string;
  cell?: Cell;
  message?: string;
}

export interface HoverEvent {
  objectId: string | null;
  cell: Cell | null;
}

export type ReplayEventType = 'mission' | 'hover' | 'pick' | 'place' | 'drop' | 'wrong' | 'success' | 'end' | 'tray' | 'untray' | 'serve' | 'reveal';

export interface ReplayEvent {
  t: number;
  type: ReplayEventType;
  objectId?: string;
  cell?: Cell | null;
  missionIndex?: number;
  message?: string;
}

export interface ReplayMission {
  index: number;
  type: MissionType;
  title?: string;
  startT: number;
  endT: number;
  success: boolean;
  mistakes: number;
  modelAnswer: string;
  targetId?: string;
  itemId?: string;
  targetCell?: Cell;
  order?: OrderLine[];
  destination?: string;
  spotId?: string;
}

/** One step the AI partner took: which brain answered and which tools it used. */
export interface AgentTrace {
  id: string;
  t: number;
  role: Role;
  /** `llm`: the tool-use agent (DeepSeek, Qwen, Claude...); `rules`: the offline rule brain. */
  brain: 'rules' | 'llm';
  /** The model that answered (LLM turns only). */
  model?: string;
  input: string;
  steps: { tool: string; args: string; result: string }[];
  output: string;
  ms: number;
}

export interface Replay {
  id: string;
  createdAt: number;
  code: string;
  level: string;
  settings: RoomSettings;
  players: { name: string; role: Role; isAI: boolean }[];
  initialScene: SceneState | null;
  initialWorld?: WorldState | null;
  /** Walking levels: sampled path [t, x, z, yaw, optional foot height]. */
  poses?: [number, number, number, number, number?][];
  missions: ReplayMission[];
  records: MissionRecord[];
  events: ReplayEvent[];
  messages: ChatRecord[];
  traces?: AgentTrace[];
  durationMs: number;
  report: SessionReport;
  coaching?: Coaching;
}

export interface ServerInfo {
  version: string;
  lanUrls: string[];
  publicUrl: string | null;
  features: { rodin: boolean; llm: boolean; llmModel?: string };
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
}

export interface ItemsResponse {
  kinds: ItemKind[];
}

export interface LevelsResponse {
  levels: LevelMeta[];
}

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ClientToServer {
  'room:create': (p: { name: string; playerId?: string; settings?: Partial<RoomSettings>; role?: Role | null }, ack: Ack<{ code: string; playerId: string }>) => void;
  'room:join': (p: { code: string; name: string; playerId?: string; role?: Role | null; spectate?: boolean; viewAs?: Role | null }, ack: Ack<{ code: string; playerId: string }>) => void;
  'room:leave': () => void;
  'room:settings': (p: Partial<RoomSettings>) => void;
  'room:role': (p: { role: Role | null }) => void;
  'game:start': (ack?: Ack) => void;
  'game:again': () => void;
  'act:hover': (p: HoverEvent) => void;
  'act:pick': (p: { objectId: string }) => void;
  'act:place': (p: { cell: Cell }) => void;
  'act:drop': () => void;
  /** Cafe: put a display-case item on the tray (or take it back off). */
  'act:tray': (p: { objectId: string; add: boolean }) => void;
  /** Cafe: hand the tray to the customer. */
  'act:serve': () => void;
  /** Walking levels: the walker's pose (client-predicted, server-validated). */
  'act:move': (p: Pose) => void;
  /** Bedroom: open or close the toy box / wardrobe. */
  'act:open': (p: { id: string; open: boolean }) => void;
  'chat:send': (p: { text: string; via: Via }) => void;
  /** Sim host reports the active AI line's browser speech playback. */
  'chat:playback': (p: { id: string; state: 'started' | 'ended' | 'unavailable' }) => void;
  /** Chinese lifeline: Chinese in, a private English sentence back (nothing is sent to the partner). */
  'chat:assist': (p: { text: string }, ack: Ack<{ en: string; source: 'llm' | 'glossary'; left: number }>) => void;
  'rtc:signal': (p: { to: string; data: unknown }) => void;
}

export interface ServerToClient {
  'room:state': (s: ClientRoomState) => void;
  'room:error': (e: { error: string }) => void;
  fx: (e: FxEvent) => void;
  chat: (m: ChatMessage) => void;
  'chat:history': (m: ChatMessage[]) => void;
  hover: (e: HoverEvent & { by: string }) => void;
  /** Live walker pose for everyone but the walker. */
  pose: (p: Pose & { by: string }) => void;
  /** AI partner reasoning steps (shown in the agent panel). */
  'ai:trace': (t: AgentTrace) => void;
  'rtc:signal': (p: { from: string; data: unknown }) => void;
}
