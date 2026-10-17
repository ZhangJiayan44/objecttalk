import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { speak, useSpeechInput } from '../src/lib/speech';

class FakeRecognition extends EventTarget {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn(() => this.onend?.());
  constructor() { super(); FakeRecognition.instances.push(this); }
  result(text: string, final = true) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal: final, 0: { transcript: text } }] });
  }
}

let trees: ReactTestRenderer[];
let testTime = Date.parse('2030-01-01');
let playback: { speaking: boolean; pending: boolean; speak: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; getVoices: () => never[] };

function mountSpeech(onFinal = vi.fn(), enabled = true, handsFree = true, lang = 'en-US') {
  let speech!: ReturnType<typeof useSpeechInput>;
  function Probe({ active }: { active: boolean }) {
    speech = useSpeechInput(onFinal, lang, { handsFree, enabled: active });
    return null;
  }
  let tree!: ReactTestRenderer;
  act(() => { tree = create(createElement(Probe, { active: enabled })); });
  trees.push(tree);
  return {
    onFinal,
    get speech() { return speech; },
    enable(active: boolean) { act(() => tree.update(createElement(Probe, { active }))); },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // Keep the synthetic date beyond any cooldown left by a previous playback test.
  testTime += 10_000;
  vi.setSystemTime(testTime);
  trees = [];
  FakeRecognition.instances = [];
  playback = { speaking: false, pending: false, speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] };
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition, setInterval, clearInterval });
  vi.stubGlobal('document', { hidden: false });
  vi.stubGlobal('speechSynthesis', playback);
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
});

afterEach(() => {
  act(() => trees.forEach((tree) => tree.unmount()));
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('hands-free microphone', () => {
  it('opens automatically and sends final sentences without waiting for the mic to close', () => {
    const app = mountSpeech();
    const rec = FakeRecognition.instances[0];
    expect(rec.start).toHaveBeenCalledOnce();
    act(() => rec.result('Could I have two coffees?', false));
    expect(app.onFinal).not.toHaveBeenCalled();
    act(() => rec.result('Could I have two coffees?'));
    expect(app.onFinal).toHaveBeenCalledExactlyOnceWith('Could I have two coffees?');
    act(() => rec.onend?.());
    expect(app.onFinal).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(250); });
    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it('mutes immediately, drops unfinished words, and resumes only after unmuting', () => {
    const app = mountSpeech();
    const rec = FakeRecognition.instances[0];
    act(() => rec.result('Unfinished sentence', false));
    app.enable(false);
    expect(rec.abort).toHaveBeenCalledOnce();
    expect(app.speech.listening).toBe(false);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(app.onFinal).not.toHaveBeenCalled();
    app.enable(true);
    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it('does not repeatedly prompt after permission denial and allows an explicit retry', () => {
    const app = mountSpeech();
    act(() => {
      FakeRecognition.instances[0].onerror?.({ error: 'not-allowed' });
      FakeRecognition.instances[0].onend?.();
      vi.advanceTimersByTime(2000);
    });
    expect(app.speech.error).toContain('Microphone blocked');
    expect(FakeRecognition.instances).toHaveLength(1);
    app.enable(false);
    app.enable(true);
    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it('pauses during partner playback and resumes when it ends', () => {
    mountSpeech();
    act(() => {
      speak('What would you like?');
      playback.speaking = true;
      vi.advanceTimersByTime(1000);
    });
    expect(FakeRecognition.instances[0].abort).toHaveBeenCalled();
    expect(FakeRecognition.instances).toHaveLength(1);
    act(() => {
      playback.speaking = false;
      vi.advanceTimersByTime(250);
    });
    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it('lets Chinese help own the mic without an English recognition session interrupting it', () => {
    const english = mountSpeech();
    const chinese = mountSpeech(vi.fn(), false, false, 'zh-CN');
    act(() => chinese.speech.start());
    const zhRec = FakeRecognition.instances[1];
    expect(zhRec.lang).toBe('zh-CN');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(FakeRecognition.instances).toHaveLength(2);
    act(() => { zhRec.result('two coffees'); chinese.speech.stop(); });
    expect(chinese.onFinal).toHaveBeenCalledExactlyOnceWith('two coffees');
    expect(english.onFinal).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(250); });
    expect(FakeRecognition.instances).toHaveLength(3);
  });
});
