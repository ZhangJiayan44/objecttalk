import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room, type GameSocket } from '../server/game/room';
import type { ClientRoomState, Replay } from '../shared/protocol';

/**
 * AI vs AI: both seats are bots (sim mode). With fake timers a whole round
 * runs in milliseconds, so this checks that every level is winnable by the
 * rule brains alone, talking only through chat.
 */

type Emitted = { event: string; payload: unknown };

function fakeIo(log: Emitted[]) {
  const target = { emit: (event: string, payload: unknown) => log.push({ event, payload }), except: () => target };
  return { to: () => target } as unknown as ConstructorParameters<typeof Room>[1];
}

function fakeSocket(states: ClientRoomState[]): GameSocket {
  return { id: 'sock-1', data: {}, join: () => undefined, emit: (event: string, payload: unknown) => event === 'room:state' && states.push(payload as ClientRoomState) } as unknown as GameSocket;
}

async function simulate(level: string, difficulty: 'easy' | 'normal' | 'tricky' = 'normal', viewAs: 'guide' | 'builder' = 'guide') {
  const log: Emitted[] = [];
  const saved: Replay[] = [];
  const room = new Room('SIMU', fakeIo(log), { saveReplay: async (r) => void saved.push(r) });
  const states: ClientRoomState[] = [];
  const host = room.addPlayer({ name: 'Watcher', viewAs }, fakeSocket(states));
  room.updateSettings(host.id, { level, mode: 'sim', difficulty, durationSec: 240 });
  expect(room.start(host.id)).toBeNull();
  for (let i = 0; i < 260 && room.phase !== 'results'; i++) await vi.advanceTimersByTimeAsync(1000);
  await vi.advanceTimersByTimeAsync(50);
  const chat = log.filter((e) => e.event === 'chat').map((e) => e.payload as { name: string; text: string });
  // Only one human is in the room, so every state on the wire is the watcher's.
  states.push(...log.filter((e) => e.event === 'room:state').map((e) => e.payload as ClientRoomState));
  return { room, states, saved, chat, log };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AI vs AI simulation (rule brains)', () => {
  for (const level of ['study', 'cafe', 'city', 'bedroom']) {
    it(`finishes the ${level} level`, async () => {
      const { saved, chat } = await simulate(level);
      expect(saved).toHaveLength(1);
      const replay = saved[0];
      const done = replay.report.missionsDone;
      if (done < replay.report.missionsTotal) console.log(level, chat.map((c) => `${c.name}: ${c.text}`).join('\n'));
      expect(done).toBe(replay.report.missionsTotal);
      expect(replay.level).toBe(level);
      expect(replay.traces?.length).toBeGreaterThan(0);
    }, 60_000);
  }

  it('walking levels record a trail for the replay', async () => {
    const { saved } = await simulate('city');
    expect(saved[0].poses!.length).toBeGreaterThan(20);
    expect(saved[0].initialWorld?.kind).toBe('city');
  }, 60_000);

  it('a builder-view spectator never receives the secret', async () => {
    const { states } = await simulate('cafe', 'normal', 'builder');
    const playing = states.filter((s) => s.phase === 'playing' && s.mission);
    expect(playing.length).toBeGreaterThan(0);
    for (const s of playing) {
      expect(s.viewAs).toBe('builder');
      expect(s.mission?.order).toBeUndefined();
      expect(s.mission?.modelAnswer).toBeUndefined();
    }
  }, 60_000);

  it('the bedroom hides what is inside the closed toy box from the seeker', async () => {
    const { states } = await simulate('bedroom', 'tricky', 'builder');
    for (const s of states) {
      if (s.world?.kind !== 'bedroom') continue;
      if (!s.world.open.includes('toybox')) expect(s.world.items.some((i) => i.spot === 'toybox')).toBe(false);
    }
  }, 60_000);
});
