import type { ClientToServer, ServerToClient } from '@shared/protocol';
import type { Socket } from 'socket.io-client';

/**
 * In-page Socket.IO for the static build (GitHub Pages). The real server
 * code (server/realtime.ts + Room + engines + bots + coach) runs inside the
 * browser tab against this hub; game clients get a socket with the same
 * shape as socket.io-client's, so nothing else in the app changes.
 *
 * Supported: rooms (join / leave / to / except), emit with acknowledgements,
 * socket.data, connect / disconnect. Delivery is asynchronous (a microtask),
 * like a network, so React never sees re-entrant updates. Only one browser tab
 * takes part: friends on other devices need the full server (npm start).
 */

type Handler = (...args: unknown[]) => void;

class Emitter {
  private handlers = new Map<string, Set<Handler>>();
  on(event: string, fn: Handler) {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn);
    return this;
  }
  off(event: string, fn?: Handler) {
    if (fn) this.handlers.get(event)?.delete(fn);
    else this.handlers.delete(event);
    return this;
  }
  removeAllListeners() {
    this.handlers.clear();
    return this;
  }
  /** Call every handler for `event`; exceptions are logged, never thrown into the sender. */
  protected fire(event: string, args: unknown[]) {
    for (const fn of [...(this.handlers.get(event) ?? [])])
      try {
        fn(...args);
      } catch (err) {
        console.error(`[static] ${event} handler failed`, err);
      }
  }
}

/** Server-side end of one connection. */
class ServerSocket extends Emitter {
  readonly data: Record<string, unknown> = {};
  readonly rooms = new Set<string>();
  constructor(
    readonly id: string,
    private hub: Hub,
    private client: ClientSocket,
  ) {
    super();
  }
  join(room: string) {
    this.rooms.add(room);
    this.hub.join(room, this);
  }
  leave(room: string) {
    this.rooms.delete(room);
    this.hub.leave(room, this);
  }
  /** Server -> this client. */
  emit(event: string, ...args: unknown[]) {
    this.client.deliver(event, args);
    return true;
  }
  /** Client -> server: run the server's handlers (with a working ack). */
  receive(event: string, args: unknown[]) {
    this.fire(event, args);
  }
  closed() {
    for (const r of [...this.rooms]) this.leave(r);
    this.fire('disconnect', ['client namespace disconnect']);
    this.removeAllListeners();
  }
}

/** Client-side end: the object the app uses as its socket.io-client Socket. */
class ClientSocket extends Emitter {
  connected = false;
  readonly id: string;
  readonly io = { opts: {} };
  private server: ServerSocket | null = null;
  private closedByUser = false;
  /** Emits made before the (asynchronous) connection is up, sent once it is, like socket.io-client's buffer. */
  private outbox: [string, unknown[]][] = [];
  constructor(private hub: Hub) {
    super();
    this.id = hub.nextId();
    // Connect on the next tick so listeners attached right after creation see 'connect'.
    queueMicrotask(() => this.connect());
  }
  connect() {
    if (this.connected || this.closedByUser) return this;
    this.server = new ServerSocket(this.id, this.hub, this);
    this.connected = true;
    this.hub.connection(this.server);
    this.fire('connect', []);
    for (const [event, args] of this.outbox.splice(0)) this.emit(event, ...args);
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    if (this.closedByUser) return this;
    const server = this.server;
    if (!server) {
      this.outbox.push([event, args]);
      return this;
    }
    // Acknowledgements cross the "network" asynchronously too.
    const last = args[args.length - 1];
    const payload = typeof last === 'function' ? [...args.slice(0, -1), (...res: unknown[]) => queueMicrotask(() => (last as Handler)(...res))] : args;
    queueMicrotask(() => server.receive(event, payload));
    return this;
  }
  emitWithAck(event: string, ...args: unknown[]) {
    return new Promise((resolve) => this.emit(event, ...args, resolve));
  }
  /** Server -> client delivery. */
  deliver(event: string, args: unknown[]) {
    queueMicrotask(() => this.fire(event, args));
  }
  close() {
    const server = this.server;
    this.closedByUser = true;
    this.outbox = [];
    this.server = null;
    this.connected = false;
    if (server) queueMicrotask(() => server.closed());
    return this;
  }
  disconnect() {
    return this.close();
  }
}

/** A room / target selector, like `io.to(room).except(id).emit(...)`. */
class Broadcast {
  constructor(
    private hub: Hub,
    private targets: string[],
    private excluded: string[] = [],
  ) {}
  to(room: string) {
    return new Broadcast(this.hub, [...this.targets, room], this.excluded);
  }
  except(room: string) {
    return new Broadcast(this.hub, this.targets, [...this.excluded, room]);
  }
  emit(event: string, ...args: unknown[]) {
    const skip = new Set(this.excluded.flatMap((r) => this.hub.members(r).map((s) => s.id)));
    const sent = new Set<string>();
    for (const room of this.targets)
      for (const s of this.hub.members(room))
        if (!skip.has(s.id) && !sent.has(s.id)) {
          sent.add(s.id);
          s.emit(event, ...args);
        }
    return true;
  }
}

export class Hub extends Emitter {
  private seq = 0;
  private roomMembers = new Map<string, Set<ServerSocket>>();
  private sockets = new Map<string, ServerSocket>();

  nextId() {
    return `local-${++this.seq}-${Math.random().toString(36).slice(2, 8)}`;
  }
  connection(s: ServerSocket) {
    this.sockets.set(s.id, s);
    // Every socket is in a room named after its id, like Socket.IO.
    this.join(s.id, s);
    this.fire('connection', [s]);
  }
  join(room: string, s: ServerSocket) {
    let set = this.roomMembers.get(room);
    if (!set) this.roomMembers.set(room, (set = new Set()));
    set.add(s);
  }
  leave(room: string, s: ServerSocket) {
    this.roomMembers.get(room)?.delete(s);
  }
  members(room: string): ServerSocket[] {
    return [...(this.roomMembers.get(room) ?? [])];
  }
  /** The `io` the Room and attachRealtime() talk to. */
  to(room: string) {
    return new Broadcast(this, [room]);
  }
  except(room: string) {
    return new Broadcast(this, [], [room]);
  }
  /** A new client connection (what `io()` returns in socket.io-client). */
  connect(): Socket<ServerToClient, ClientToServer> {
    return new ClientSocket(this) as unknown as Socket<ServerToClient, ClientToServer>;
  }
}
