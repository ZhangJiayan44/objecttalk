import type { SessionReport, MissionRecord, ChatRecord } from './analysis';
import type { Cell, Difficulty, InterestId, ItemKind, MissionType, Role, SceneState } from './types';

/**
 * Socket.IO protocol. The server is authoritative and sends each socket a
 * role-filtered view: the builder never receives the target, so the
 * information gap is enforced on the wire, not just hidden in the UI.
 */

export type Mode = 'duo' | 'ai';
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
  mode: Mode;
  /** Role the AI partner plays in `ai` mode. */
  aiRole: Role;
  interests: InterestId[];
  difficulty: Difficulty;
  durationSec: number;
  /** Extra item kinds (e.g. a player's own Rodin object) to put on the table. */
  customKinds: string[];
}

export const DEFAULT_SETTINGS: RoomSettings = {
  mode: 'duo',
  aiRole: 'guide',
  interests: ['space', 'food', 'games'],
  difficulty: 'normal',
  durationSec: 90,
  customKinds: [],
};

/** What every player may know about the current mission. */
export interface PublicMission {
  id: string;
  index: number;
  type: MissionType;
  brief: string;
}

/** Extra information only the guide (and spectators) receive. */
export interface SecretMission {
  targetId?: string;
  itemId?: string;
  targetCell?: Cell;
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
  players: PlayerInfo[];
  settings: RoomSettings;
  scene: SceneState | null;
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
}

/** Optional Claude-written coaching layered on top of the rule-based report. */
export interface Coaching {
  summary: string;
  rewrites: { original: string; better: string; why: string }[];
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

export type FxType = 'pick' | 'place' | 'drop' | 'wrong' | 'success' | 'mission' | 'timeup' | 'complete';

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

export type ReplayEventType = 'mission' | 'hover' | 'pick' | 'place' | 'drop' | 'wrong' | 'success' | 'end';

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
  startT: number;
  endT: number;
  success: boolean;
  mistakes: number;
  modelAnswer: string;
  targetId?: string;
  itemId?: string;
  targetCell?: Cell;
}

export interface Replay {
  id: string;
  createdAt: number;
  code: string;
  settings: RoomSettings;
  players: { name: string; role: Role; isAI: boolean }[];
  initialScene: SceneState;
  missions: ReplayMission[];
  records: MissionRecord[];
  events: ReplayEvent[];
  messages: ChatRecord[];
  durationMs: number;
  report: SessionReport;
  coaching?: Coaching;
}

export interface ServerInfo {
  version: string;
  lanUrls: string[];
  publicUrl: string | null;
  features: { rodin: boolean; llm: boolean };
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
}

export interface ItemsResponse {
  kinds: ItemKind[];
}

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ClientToServer {
  'room:create': (p: { name: string; playerId?: string; settings?: Partial<RoomSettings>; role?: Role | null }, ack: Ack<{ code: string; playerId: string }>) => void;
  'room:join': (p: { code: string; name: string; playerId?: string; role?: Role | null; spectate?: boolean }, ack: Ack<{ code: string; playerId: string }>) => void;
  'room:leave': () => void;
  'room:settings': (p: Partial<RoomSettings>) => void;
  'room:role': (p: { role: Role | null }) => void;
  'game:start': (ack?: Ack) => void;
  'game:again': () => void;
  'act:hover': (p: HoverEvent) => void;
  'act:pick': (p: { objectId: string }) => void;
  'act:place': (p: { cell: Cell }) => void;
  'act:drop': () => void;
  'chat:send': (p: { text: string; via: Via }) => void;
  'rtc:signal': (p: { to: string; data: unknown }) => void;
}

export interface ServerToClient {
  'room:state': (s: ClientRoomState) => void;
  'room:error': (e: { error: string }) => void;
  fx: (e: FxEvent) => void;
  chat: (m: ChatMessage) => void;
  'chat:history': (m: ChatMessage[]) => void;
  hover: (e: HoverEvent & { by: string }) => void;
  'rtc:signal': (p: { from: string; data: unknown }) => void;
}
