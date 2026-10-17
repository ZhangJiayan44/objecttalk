import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { speak, stopSpeaking } from '../src/lib/speech';

const utterances: FakeUtterance[] = [];
class FakeUtterance {
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

beforeEach(() => {
  utterances.length = 0;
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('speechSynthesis', { getVoices: () => [], cancel: vi.fn(), speak: (u: FakeUtterance) => utterances.push(u) });
});
afterEach(() => {
  stopSpeaking();
  vi.unstubAllGlobals();
});

describe('browser speech playback', () => {
  it('reports completion only after the utterance ends, once', () => {
    const onStart = vi.fn(), onEnd = vi.fn(), onError = vi.fn();
    speak('Go to the tea shop.', { onStart, onEnd, onError });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
    utterances[0].onend!();
    utterances[0].onend!();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('treats interruption or cancellation as unavailable, never as successful completion', () => {
    const onEnd = vi.fn(), onError = vi.fn();
    const cancel = speak('An unfinished instruction.', { onEnd, onError });
    speak('A replacement.');
    cancel();
    utterances[0].onend!();
    utterances[0].onerror!();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
    expect(utterances).toHaveLength(2);
  });

  it('reports missing speech support and synthesis failure', () => {
    const onError = vi.fn();
    vi.stubGlobal('speechSynthesis', undefined);
    speak('No voice here.', { onError });
    expect(onError).toHaveBeenCalledTimes(1);
    vi.stubGlobal('speechSynthesis', { getVoices: () => [], cancel: vi.fn(), speak: () => { throw new Error('unavailable'); } });
    speak('No service here.', { onError });
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
