import type { Server } from 'socket.io';
import type { ClientToServer, ServerToClient } from '../../shared/protocol';
import { Room, type RoomHooks } from './room';

const ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ'; // no I/O/Q: easy to read aloud and type

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweeper: ReturnType<typeof setInterval>;

  constructor(
    private io: Server<ClientToServer, ServerToClient>,
    private hooks: RoomHooks,
  ) {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref?.();
  }

  create(): Room {
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(code, this.io, this.hooks);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string | undefined | null): Room | undefined {
    return code ? this.rooms.get(code.trim().toUpperCase()) : undefined;
  }

  get size() {
    return this.rooms.size;
  }

  /** Drop rooms with nobody connected for 10 minutes, or idle for 2 hours. */
  private sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const idle = now - room.lastActivity;
      if ((!room.hasConnectedHumans() && idle > 10 * 60_000) || idle > 2 * 3600_000) {
        room.dispose();
        this.rooms.delete(code);
      }
    }
  }

  dispose() {
    clearInterval(this.sweeper);
    for (const room of this.rooms.values()) room.dispose();
  }
}
