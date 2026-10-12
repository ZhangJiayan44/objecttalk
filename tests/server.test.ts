import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/index';
import { parseUtterance } from '../shared/nlu';
import type { ChatMessage, ClientRoomState, ClientToServer, ServerToClient } from '../shared/protocol';
import { freeCells, resolvePlace, resolveRef, sceneEntities } from '../shared/spatial';

type Client = Socket<ServerToClient, ClientToServer>;

let server: Awaited<ReturnType<typeof startServer>>;
let url = '';
const sockets: Client[] = [];

beforeAll(async () => {
  server = await startServer({ port: 0, quiet: true, dataDir: mkdtempSync(path.join(os.tmpdir(), 'objecttalk-test-')) });
  url = `http://localhost:${server.port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.close());
  await server.close();
});

function client(): Client {
  const s: Client = connect(url, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
}

function waitForState(s: Client, pred: (st: ClientRoomState) => boolean, timeout = 20000): Promise<ClientRoomState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for state')), timeout);
    const on = (st: ClientRoomState) => {
      if (!pred(st)) return;
      clearTimeout(timer);
      s.off('room:state', on);
      resolve(st);
    };
    s.on('room:state', on);
  });
}

describe('realtime server', () => {
  it('serves health and info', async () => {
    const health = await (await fetch(`${url}/api/health`)).json();
    expect(health.ok).toBe(true);
    const info = await (await fetch(`${url}/api/info`)).json();
    expect(info.features).toHaveProperty('rodin');
    const items = await (await fetch(`${url}/api/items`)).json();
    expect(items.kinds.length).toBeGreaterThanOrEqual(6);
  });

  it('enforces the information gap on the wire in duo mode', async () => {
    const guide = client();
    const builder = client();
    const created = await guide.emitWithAck('room:create', { name: 'Gina', role: 'guide' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const joined = await builder.emitWithAck('room:join', { code: created.code, name: 'Bo', role: 'builder' });
    expect(joined.ok).toBe(true);
    const gState = waitForState(guide, (s) => s.phase === 'playing' && !!s.mission);
    const bState = waitForState(builder, (s) => s.phase === 'playing' && !!s.mission);
    const started = await guide.emitWithAck('game:start');
    expect(started).toEqual({ ok: true });
    const [g, b] = await Promise.all([gState, bState]);
    expect(g.yourRole).toBe('guide');
    expect(b.yourRole).toBe('builder');
    expect(g.mission?.targetId ?? g.mission?.itemId).toBeTruthy();
    expect(g.mission?.modelAnswer).toBeTruthy();
    expect(b.mission?.targetId).toBeUndefined();
    expect(b.mission?.itemId).toBeUndefined();
    expect(b.mission?.targetCell).toBeUndefined();
    expect(b.mission?.modelAnswer).toBeUndefined();
    guide.emit('room:leave');
    builder.emit('room:leave');
  }, 30000);

  it('completes a run with the AI guide by following only its words', async () => {
    const b = client();
    let state: ClientRoomState | null = null;
    b.on('room:state', (s) => (state = s));
    const created = await b.emitWithAck('room:create', { name: 'Bo', role: 'builder', settings: { mode: 'ai', aiRole: 'guide', difficulty: 'normal' } });
    expect(created.ok).toBe(true);
    b.on('chat', (m: ChatMessage) => {
      const st = state;
      if (m.role !== 'guide' || !st?.scene || !st.mission) return;
      const p = parseUtterance(m.text, { speaker: 'guide', listener: 'builder' });
      if (!p.target || p.target.deictic) return;
      const entities = sceneEntities(st.scene);
      const hits = resolveRef(p.target, entities, 'builder').filter((e) => !e.landmark);
      if (hits.length !== 1) return;
      const id = hits[0].id;
      if (st.mission.type === 'find') b.emit('act:pick', { objectId: id });
      else if (p.place) {
        const cells = resolvePlace(p.place, entities, freeCells(st.scene, id), 'builder', id);
        if (cells.length !== 1) return;
        b.emit('act:pick', { objectId: id });
        setTimeout(() => b.emit('act:place', { cell: cells[0] }), 150);
      }
    });
    const done = waitForState(b, (s) => s.phase === 'results' && !!s.results, 60000);
    b.emit('game:start');
    const final = await done;
    expect(final.results!.report.missionsDone).toBe(final.results!.report.missionsTotal);
    expect(final.mistakes).toBe(0);
    const replay = await fetch(`${url}/api/replays/${final.results!.replayId}`);
    expect(replay.ok).toBe(true);
    const body = await replay.json();
    expect(body.events.some((e: { type: string }) => e.type === 'success')).toBe(true);
  }, 70000);

  it('the AI builder carries out clear instructions from a human guide', async () => {
    const g = client();
    let lastMission = '';
    const created = await g.emitWithAck('room:create', { name: 'Gina', role: 'guide', settings: { mode: 'ai', aiRole: 'builder', difficulty: 'normal' } });
    expect(created.ok).toBe(true);
    g.on('room:state', (s) => {
      if (s.phase === 'playing' && s.mission?.modelAnswer && s.mission.id !== lastMission) {
        lastMission = s.mission.id;
        const text = s.mission.modelAnswer;
        setTimeout(() => g.emit('chat:send', { text, via: 'text' }), 300);
      }
    });
    const done = waitForState(g, (s) => s.phase === 'results' && !!s.results, 60000);
    g.emit('game:start');
    const final = await done;
    expect(final.results!.report.missionsDone).toBe(final.results!.report.missionsTotal);
    // Model answers are listener-centred, so the coach should rate them clear.
    const guideReviews = final.results!.report.reviews.filter((r) => r.role === 'guide');
    expect(guideReviews.length).toBeGreaterThan(0);
    expect(guideReviews.every((r) => r.verdict === 'clear')).toBe(true);
  }, 70000);
});
