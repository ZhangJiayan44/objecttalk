import { createContext, useContext } from 'react';
import { io, type Socket } from 'socket.io-client';
import { createStore, useStore, type StoreApi } from 'zustand';
import type {
  Ack,
  AgentTrace,
  ChatMessage,
  ClientRoomState,
  ClientToServer,
  FxEvent,
  HoverEvent,
  Pose,
  RoomSettings,
  ServerToClient,
  Via,
} from '@shared/protocol';
import type { Cell, Role } from '@shared/types';

/**
 * One GameClient = one player connection (socket + state). The normal game
 * page uses one; the split-screen demo page runs two side by side.
 */

export interface GameState {
  connected: boolean;
  state: ClientRoomState | null;
  chat: ChatMessage[];
  /** What the builder is pointing at (seen by everyone else). */
  remoteHover: (HoverEvent & { by: string }) | null;
  /** The walker's live pose in walking levels (for everyone but the walker). */
  remotePose: (Pose & { by: string; at: number }) | null;
  /** AI partner reasoning steps (agent panel). */
  traces: AgentTrace[];
  fx: (FxEvent & { key: number })[];
  clockOffset: number;
  error: string | null;
}

export interface GameActions {
  create(name: string, opts?: { settings?: Partial<RoomSettings>; role?: Role | null }): Promise<string>;
  join(code: string, name: string, opts?: { role?: Role | null; spectate?: boolean; viewAs?: Role | null }): Promise<string>;
  leave(): void;
  start(): Promise<void>;
  again(): void;
  setRole(role: Role | null): void;
  updateSettings(patch: Partial<RoomSettings>): void;
  hover(e: HoverEvent): void;
  pick(objectId: string): void;
  place(cell: Cell): void;
  drop(): void;
  tray(objectId: string, add: boolean): void;
  serve(): void;
  move(pose: Pose): void;
  open(id: string, open: boolean): void;
  say(text: string, via?: Via): void;
  /** Chinese lifeline: Chinese in, a private English line out (nothing reaches the partner). */
  assist(zh: string): Promise<{ en: string; source: 'llm' | 'glossary'; left: number }>;
}

export interface GameClient {
  store: StoreApi<GameState>;
  actions: GameActions;
  socket: Socket<ServerToClient, ClientToServer>;
  dispose(): void;
}

const idKey = (code: string) => `objecttalk:pid:${code}`;

export function createGameClient(opts: { persistIdentity?: boolean } = {}): GameClient {
  const persist = opts.persistIdentity ?? true;
  const socket: Socket<ServerToClient, ClientToServer> = io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 3000 });
  const store = createStore<GameState>(() => ({ connected: false, state: null, chat: [], remoteHover: null, remotePose: null, traces: [], fx: [], clockOffset: 0, error: null }));
  let session: { code: string; name: string; playerId: string; spectate?: boolean; viewAs?: Role | null } | null = null;
  let fxKey = 0;
  let lastHover = 0;
  let lastMove = 0;
  let queuedPose: Pose | null = null;
  let moveTimer: ReturnType<typeof setTimeout> | null = null;

  const remember = (code: string, playerId: string, name: string, spectate?: boolean, viewAs?: Role | null) => {
    session = { code, playerId, name, spectate, viewAs };
    if (persist) {
      try {
        sessionStorage.setItem(idKey(code), playerId);
      } catch {
        /* storage may be unavailable (private mode) */
      }
    }
  };
  const storedId = (code: string) => {
    if (!persist) return undefined;
    try {
      return sessionStorage.getItem(idKey(code)) ?? undefined;
    } catch {
      return undefined;
    }
  };

  socket.on('connect', () => {
    store.setState({ connected: true, error: null });
    // Transparent rejoin after a dropped connection (Wi-Fi hiccup, phone sleep...).
    if (session) socket.emit('room:join', { code: session.code, name: session.name, playerId: session.playerId, spectate: session.spectate, viewAs: session.viewAs }, () => {});
  });
  socket.on('disconnect', () => store.setState({ connected: false }));
  socket.on('room:state', (s) => {
    store.setState({ state: s, clockOffset: s.serverNow - Date.now() });
    if (s.phase !== 'playing') store.setState({ remoteHover: null, remotePose: null });
  });
  socket.on('pose', (p) => store.setState({ remotePose: { ...p, at: performance.now() } }));
  socket.on('ai:trace', (t) => store.setState((st) => ({ traces: [...st.traces, t].slice(-60) })));
  socket.on('chat', (m) => store.setState((st) => ({ chat: [...st.chat, m].slice(-200) })));
  socket.on('chat:history', (m) => store.setState({ chat: m }));
  socket.on('hover', (e) => store.setState({ remoteHover: e }));
  socket.on('fx', (e) => store.setState((st) => ({ fx: [...st.fx, { ...e, key: ++fxKey }].slice(-8) })));
  socket.on('room:error', ({ error }) => store.setState({ error }));

  const ackToPromise = <T extends object>(fn: (ack: Ack<T>) => void) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The server did not answer. Is it running?')), 8000);
      fn((res) => {
        clearTimeout(timer);
        if (res.ok) resolve(res as T);
        else reject(new Error(res.error));
      });
    });

  const actions: GameActions = {
    async create(name, o = {}) {
      const res = await ackToPromise<{ code: string; playerId: string }>((ack) => socket.emit('room:create', { name, settings: o.settings, role: o.role ?? null }, ack));
      remember(res.code, res.playerId, name);
      return res.code;
    },
    async join(code, name, o = {}) {
      const upper = code.trim().toUpperCase();
      const res = await ackToPromise<{ code: string; playerId: string }>((ack) =>
        socket.emit('room:join', { code: upper, name, playerId: storedId(upper), role: o.role ?? null, spectate: o.spectate, viewAs: o.viewAs ?? null }, ack),
      );
      remember(res.code, res.playerId, name, o.spectate, o.viewAs);
      return res.code;
    },
    leave() {
      socket.emit('room:leave');
      session = null;
      store.setState({ state: null, chat: [], remoteHover: null, remotePose: null, traces: [], fx: [] });
    },
    async start() {
      await ackToPromise((ack) => socket.emit('game:start', ack));
    },
    again: () => socket.emit('game:again'),
    setRole: (role) => socket.emit('room:role', { role }),
    updateSettings: (patch) => socket.emit('room:settings', patch),
    hover(e) {
      const now = performance.now();
      if (now - lastHover < 60 && (e.objectId || e.cell)) return;
      lastHover = now;
      socket.emit('act:hover', e);
    },
    pick: (objectId) => socket.emit('act:pick', { objectId }),
    place: (cell) => socket.emit('act:place', { cell }),
    drop: () => socket.emit('act:drop'),
    tray: (objectId, add) => socket.emit('act:tray', { objectId, add }),
    serve: () => socket.emit('act:serve'),
    open: (id, open) => socket.emit('act:open', { id, open }),
    move(pose) {
      // ~12 updates a second is plenty for a walking avatar; always send the latest pose.
      queuedPose = pose;
      const wait = 80 - (performance.now() - lastMove);
      if (wait <= 0) {
        lastMove = performance.now();
        socket.emit('act:move', pose);
        queuedPose = null;
      } else if (!moveTimer)
        moveTimer = setTimeout(() => {
          moveTimer = null;
          if (!queuedPose) return;
          lastMove = performance.now();
          socket.emit('act:move', queuedPose);
          queuedPose = null;
        }, wait);
    },
    say: (text, via = 'text') => socket.emit('chat:send', { text, via }),
    assist: (zh) => ackToPromise<{ en: string; source: 'llm' | 'glossary'; left: number }>((ack) => socket.emit('chat:assist', { text: zh }, ack)),
  };

  const client: GameClient = {
    store,
    actions,
    socket,
    dispose() {
      socket.removeAllListeners();
      socket.close();
    },
  };
  // Dev-only handle for automated UI tests (stripped from production builds).
  if (import.meta.env.DEV) {
    const w = window as unknown as { __ot?: { clients: GameClient[] } };
    (w.__ot ??= { clients: [] }).clients.push(client);
  }
  return client;
}

export const GameContext = createContext<GameClient | null>(null);

export function useGameClient(): GameClient {
  const c = useContext(GameContext);
  if (!c) throw new Error('useGameClient must be used inside <GameContext.Provider>');
  return c;
}

export function useGame<T>(selector: (s: GameState) => T): T {
  return useStore(useGameClient().store, selector);
}

/** Server-synchronised clock (ms). */
export function serverNow(offset: number) {
  return Date.now() + offset;
}
