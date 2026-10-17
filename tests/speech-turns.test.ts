import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room, type GameSocket } from '../server/game/room';
import { TabletopEngine } from '../server/game/engines/tabletop';
import type { BotIO } from '../server/game/engines/types';
import { BaseBot } from '../server/game/bots/common';
import type { ChatMessage } from '../shared/protocol';
import { speechDuration } from '../shared/speech';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function simulation() {
  const heard = { guide: vi.fn(), builder: vi.fn() };
  const bots = new Map<string, BotIO>();
  vi.spyOn(TabletopEngine.prototype, 'createBot').mockImplementation((io) => {
    bots.set(io.role, io);
    return { onMissionStart: vi.fn(), onChat: heard[io.role], onFx: vi.fn(), dispose: vi.fn() };
  });
  const chat: ChatMessage[] = [];
  const target = { emit: (event: string, payload: unknown) => { if (event === 'chat') chat.push(payload as ChatMessage); }, except: () => target };
  const room = new Room('TEST', { to: () => target } as unknown as ConstructorParameters<typeof Room>[1], { saveReplay: async () => {} });
  const socket = (id: string) => ({ id, data: {}, join: vi.fn(), emit: vi.fn() }) as unknown as GameSocket;
  const host = room.addPlayer({ name: 'Host' }, socket('host'));
  room.updateSettings(host.id, { mode: 'sim', durationSec: 240 });
  const viewer = room.addPlayer({ name: 'Audience', spectate: true }, socket('audience'));
  room.start(host.id);
  await vi.advanceTimersByTimeAsync(3000);
  return { room, host, viewer, bots, heard, chat };
}

describe('AI speech turns', () => {
  it('waits for the host playback end even after the old 2.6s limit and the text estimate', async () => {
    const { room, host, bots, heard, chat } = await simulation();
    bots.get('guide')!.say('Go to the shop and buy two small soy milks, then return to the entrance gate.');
    const line = chat.at(-1)!;
    room.playback(host.id, line.id, 'started');
    await vi.advanceTimersByTimeAsync(speechDuration(line.text) + 5000);
    expect(heard.builder).not.toHaveBeenCalled();
    room.playback(host.id, line.id, 'ended');
    expect(heard.builder).toHaveBeenCalledExactlyOnceWith(line);
    room.playback(host.id, line.id, 'ended');
    expect(heard.builder).toHaveBeenCalledTimes(1);
    room.dispose();
  });

  it('serializes AI lines and ignores spectator or stale playback receipts', async () => {
    const { room, host, viewer, bots, heard, chat } = await simulation();
    bots.get('guide')!.say('Pick up the small rocket beside the lamp.');
    const first = chat.at(-1)!;
    bots.get('builder')!.say('Which side of the lamp?');
    expect(chat).toHaveLength(1);
    room.playback(viewer.id, first.id, 'started');
    room.playback(viewer.id, first.id, 'ended');
    room.playback(host.id, first.id, 'ended');
    expect(heard.builder).not.toHaveBeenCalled();
    room.playback(host.id, first.id, 'started');
    room.playback(host.id, first.id, 'ended');
    expect(chat).toHaveLength(2);
    room.playback(host.id, first.id, 'ended');
    expect(heard.guide).not.toHaveBeenCalled();
    const second = chat.at(-1)!;
    room.playback(host.id, second.id, 'started');
    room.playback(host.id, second.id, 'ended');
    expect(heard.guide).toHaveBeenCalledExactlyOnceWith(second);
    room.dispose();
  });

  it('uses full sentence duration when muted or synthesis fails, and recovers a stalled player', async () => {
    const { room, host, bots, heard, chat } = await simulation();
    const long = 'Please go straight along the main street until you reach the shop with red lanterns, then turn left and buy two small soy milks before coming back to meet me at the entrance gate.';
    bots.get('guide')!.say(long);
    await vi.advanceTimersByTimeAsync(2600);
    expect(heard.builder).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(speechDuration(long) - 2600);
    expect(heard.builder).toHaveBeenCalledTimes(1);
    bots.get('guide')!.say(long);
    room.playback(host.id, chat.at(-1)!.id, 'started');
    room.playback(host.id, chat.at(-1)!.id, 'unavailable');
    await vi.advanceTimersByTimeAsync(speechDuration(long));
    expect(heard.builder).toHaveBeenCalledTimes(2);
    bots.get('guide')!.say('A stalled browser must eventually recover.');
    room.playback(host.id, chat.at(-1)!.id, 'started');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(heard.builder).toHaveBeenCalledTimes(3);
    room.dispose();
  });

  it('cancels old speech and pending lines when the round finishes', async () => {
    const { room, host, bots, heard, chat } = await simulation();
    await vi.advanceTimersByTimeAsync(239_000);
    bots.get('guide')!.say('Pick up the small rocket.');
    const old = chat.at(-1)!;
    room.playback(host.id, old.id, 'started');
    bots.get('builder')!.say('An obsolete reply.');
    await vi.advanceTimersByTimeAsync(1000);
    expect(room.phase).toBe('results');
    expect(heard.builder).not.toHaveBeenCalled();
    expect(chat).toHaveLength(1);
    room.again(host.id);
    expect(room.stateFor(host).completed).toEqual([]);
    room.start(host.id);
    await vi.advanceTimersByTimeAsync(3000);
    bots.get('guide')!.say('A new round instruction.');
    const current = chat.at(-1)!;
    room.playback(host.id, current.id, 'started');
    heard.builder.mockClear();
    room.playback(host.id, old.id, 'ended');
    expect(heard.builder).not.toHaveBeenCalled();
    room.playback(host.id, current.id, 'ended');
    expect(heard.builder).toHaveBeenCalledExactlyOnceWith(current);
    room.dispose();
  });

  it('drops an unfinished instruction when its mission has already been solved', async () => {
    const { room, host, bots, heard, chat } = await simulation();
    bots.get('guide')!.say('An instruction from the first mission.');
    const old = chat.at(-1)!;
    room.playback(host.id, old.id, 'started');
    const mission = room.stateFor(host).mission!;
    const builder = bots.get('builder')!;
    if (mission.type === 'find') room.pick(builder.id, mission.targetId!);
    else { room.pick(builder.id, mission.itemId!); room.place(builder.id, mission.targetCell!); }
    await vi.advanceTimersByTimeAsync(1600);
    expect(room.stateFor(host).mission?.id).not.toBe(mission.id);
    room.playback(host.id, old.id, 'ended');
    expect(heard.builder).not.toHaveBeenCalled();
    bots.get('guide')!.say('The new mission instruction.');
    const current = chat.at(-1)!;
    room.playback(host.id, current.id, 'started');
    room.playback(host.id, current.id, 'ended');
    expect(heard.builder).toHaveBeenCalledExactlyOnceWith(current);
    room.dispose();
  });

  it('defers scheduled actions while listening and allows a deferred action to be cancelled', async () => {
    let listening = true;
    const action = vi.fn();
    class Listener extends BaseBot {
      onMissionStart() {}
      onChat() {}
      onFx() {}
      schedule() { return this.later(500, action); }
      stop(timer: ReturnType<Listener['schedule']>) { this.cancel(timer); }
    }
    const bot = new Listener({ listening: () => listening } as BotIO);
    const timer = bot.schedule();
    await vi.advanceTimersByTimeAsync(5000);
    expect(action).not.toHaveBeenCalled();
    bot.stop(timer);
    listening = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(action).not.toHaveBeenCalled();
    bot.schedule();
    listening = true;
    await vi.advanceTimersByTimeAsync(2000);
    listening = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(action).toHaveBeenCalledTimes(1);
    bot.dispose();
  });
});
