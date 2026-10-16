import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientRoomState, FxEvent } from '../shared/protocol';
import { DEFAULT_SETTINGS } from '../shared/protocol';

const wire = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => void>() }));
vi.mock('socket.io-client', () => ({
  io: () => ({
    on: (event: string, fn: (...args: unknown[]) => void) => wire.handlers.set(event, fn),
    emit: vi.fn(), removeAllListeners: vi.fn(), close: vi.fn(),
  }),
}));
import { createGameClient } from '../src/lib/game-client';

beforeEach(() => {
  wire.handlers.clear();
  vi.stubGlobal('window', {});
});
afterEach(() => vi.unstubAllGlobals());

function state(phase: ClientRoomState['phase'], code = 'TEST') {
  wire.handlers.get('room:state')!({ phase, code, serverNow: Date.now(), settings: DEFAULT_SETTINGS });
}
function fx(type: FxEvent['type']) {
  wire.handlers.get('fx')!({ type, message: type === 'complete' ? 'All missions complete!' : undefined });
}

describe('round feedback lifecycle', () => {
  it('keeps the first round result and clears it before the next countdown', () => {
    const client = createGameClient({ persistIdentity: false });
    state('playing');
    fx('success');
    fx('complete');
    state('results');
    expect(client.store.getState().fx.at(-1)?.type).toBe('complete');
    state('lobby');
    expect(client.store.getState().fx).toEqual([]);
    state('countdown');
    expect(client.store.getState().fx).toEqual([]);
    state('playing');
    fx('mission');
    expect(client.store.getState().fx.map((e) => e.type)).toEqual(['mission']);
    client.dispose();
  });

  it('clears transient history when switching rooms or entering countdown directly', () => {
    const client = createGameClient({ persistIdentity: false });
    state('playing');
    fx('complete');
    state('countdown');
    expect(client.store.getState().fx).toEqual([]);
    fx('wrong');
    state('playing', 'NEXT');
    expect(client.store.getState().fx).toEqual([]);
    client.dispose();
  });

  it('preserves history delivered immediately before joining a room', () => {
    const client = createGameClient({ persistIdentity: false });
    state('playing');
    fx('complete');
    const history = [{ id: 'fresh', text: 'The new room history.' }];
    wire.handlers.get('chat:history')!(history);
    state('playing', 'NEXT');
    expect(client.store.getState().chat).toEqual(history);
    expect(client.store.getState().fx).toEqual([]);
    client.dispose();
  });
});
