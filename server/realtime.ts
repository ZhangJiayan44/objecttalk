import type { Server } from 'socket.io';
import type { ClientToServer, ServerToClient } from '../shared/protocol';
import type { Cell, Role } from '../shared/types';
import type { RoomManager } from './game/manager';

/**
 * The realtime protocol: Socket.IO events in, room actions out. The Node
 * server and the in-browser server of the static GitHub Pages build
 * (src/static/hub.ts) both use this, so they run exactly the same game.
 * Inputs are untrusted: every payload is type-checked and rate-limited here.
 */

export const isRole = (r: unknown): r is Role => r === 'guide' || r === 'builder';
export const isCell = (c: unknown): c is Cell =>
  !!c && typeof c === 'object' && Number.isInteger((c as Cell).c) && Number.isInteger((c as Cell).r);
export const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');

export interface RealtimeDeps {
  /** Chinese lifeline translator (an LLM); returning null falls back to the offline glossary. */
  assist(zh: string, context: string): Promise<string | null>;
}

export function attachRealtime(io: Server<ClientToServer, ServerToClient>, rooms: RoomManager, deps: RealtimeDeps) {
  io.on('connection', (socket) => {
    const room = () => rooms.get(socket.data.roomCode as string | undefined);
    const pid = () => socket.data.playerId as string;
    let chatBudget = { count: 0, since: Date.now() };

    socket.on('room:create', (p, ack) => {
      if (typeof ack !== 'function') return;
      const r = rooms.create();
      const player = r.addPlayer({ name: str(p?.name, 24), playerId: str(p?.playerId, 20) || undefined, role: isRole(p?.role) ? p.role : null }, socket);
      if (p?.settings) r.updateSettings(player.id, p.settings);
      ack({ ok: true, code: r.code, playerId: player.id });
    });

    socket.on('room:join', (p, ack) => {
      if (typeof ack !== 'function') return;
      const r = rooms.get(str(p?.code, 8));
      if (!r) return ack({ ok: false, error: 'Room not found. Check the 4-letter code.' });
      const prev = room();
      if (prev && prev !== r) {
        prev.disconnect(socket.id);
        socket.leave(prev.code);
      }
      const player = r.addPlayer(
        { name: str(p?.name, 24), playerId: str(p?.playerId, 20) || undefined, role: isRole(p?.role) ? p.role : null, spectate: !!p?.spectate, viewAs: isRole(p?.viewAs) ? p.viewAs : null },
        socket,
      );
      ack({ ok: true, code: r.code, playerId: player.id });
    });

    socket.on('room:leave', () => {
      const r = room();
      if (!r) return;
      r.leave(pid());
      socket.leave(r.code);
      socket.data.roomCode = undefined;
    });

    socket.on('room:settings', (patch) => room()?.updateSettings(pid(), patch ?? {}));
    socket.on('room:role', (p) => room()?.setRole(pid(), isRole(p?.role) ? p.role : null));
    socket.on('game:start', (ack) => {
      const r = room();
      // Room.start returns null on success, so do not use `??` here (it would treat success as missing).
      const error = r ? r.start(pid()) : 'Join a room first.';
      if (typeof ack === 'function') ack(error ? { ok: false, error } : { ok: true });
      if (error) socket.emit('room:error', { error });
    });
    socket.on('game:again', () => room()?.again(pid()));
    socket.on('act:hover', (e) =>
      room()?.hover(pid(), { objectId: typeof e?.objectId === 'string' ? e.objectId : null, cell: isCell(e?.cell) ? e.cell : null }),
    );
    socket.on('act:pick', (p) => typeof p?.objectId === 'string' && room()?.pick(pid(), p.objectId));
    socket.on('act:place', (p) => isCell(p?.cell) && room()?.place(pid(), p.cell));
    socket.on('act:drop', () => room()?.drop(pid()));
    socket.on('act:tray', (p) => typeof p?.objectId === 'string' && room()?.tray(pid(), p.objectId, !!p.add));
    socket.on('act:serve', () => room()?.serve(pid()));
    socket.on('act:open', (p) => typeof p?.id === 'string' && room()?.open(pid(), p.id, !!p.open));
    let moveBudget = { count: 0, since: Date.now() };
    socket.on('act:move', (p) => {
      const now = Date.now();
      if (now - moveBudget.since > 1000) moveBudget = { count: 0, since: now };
      if (++moveBudget.count > 30) return;
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
      const pose = { x: n(p?.x), z: n(p?.z), yaw: n(p?.yaw) };
      if (Number.isFinite(pose.x + pose.z + pose.yaw)) room()?.move(pid(), pose);
    });
    socket.on('chat:send', (p) => {
      const now = Date.now();
      if (now - chatBudget.since > 3000) chatBudget = { count: 0, since: now };
      if (++chatBudget.count > 6) return;
      const via = p?.via === 'voice' || p?.via === 'quick' ? p.via : 'text';
      room()?.say(pid(), str(p?.text), via);
    });
    socket.on('chat:playback', (p) => {
      if (typeof p?.id !== 'string' || !['started', 'ended', 'unavailable'].includes(p?.state)) return;
      room()?.playback(pid(), p.id, p.state);
    });
    let assistBudget = { count: 0, since: Date.now() };
    socket.on('chat:assist', async (p, ack) => {
      if (typeof ack !== 'function') return;
      const now = Date.now();
      if (now - assistBudget.since > 10_000) assistBudget = { count: 0, since: now };
      if (++assistBudget.count > 4) return ack({ ok: false, error: 'One moment…' });
      const r = room();
      if (!r) return ack({ ok: false, error: 'Not in a room.' });
      const res = await r.assist(pid(), str(p?.text), deps.assist);
      ack('error' in res ? { ok: false, error: res.error } : { ok: true, ...res });
    });
    socket.on('rtc:signal', (p) => {
      const r = room();
      if (!r || typeof p?.to !== 'string') return;
      const target = r.players.get(p.to);
      if (target?.socketId) io.to(target.socketId).emit('rtc:signal', { from: pid(), data: p.data });
    });
    socket.on('disconnect', () => room()?.disconnect(socket.id));
  });
}
