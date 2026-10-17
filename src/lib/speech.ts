import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Speech in the browser, no server round-trip:
 *  - useSpeechInput: speech-to-text with optional hands-free input (Web Speech API, en-US).
 *  - speak(): text-to-speech for the AI partner (speechSynthesis).
 * Both degrade gracefully: the chat box always works as a typed fallback.
 */

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

// Only one recognition session may own the microphone (English conversation / Chinese help).
let activeRecognition: SpeechRecognitionLike | null = null;
let playbackUntil = 0;

type Ctor = new () => SpeechRecognitionLike;

function recognitionCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechInputSupported = () => !!recognitionCtor();

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone blocked. Allow mic access, or type instead.',
  'service-not-allowed': 'Speech service not allowed here. Type instead.',
  network: 'Speech service unreachable on this network. Try Edge/Chrome with internet, or type instead.',
  'audio-capture': 'No microphone found.',
};

export function useSpeechInput(onFinal: (text: string) => void, lang = 'en-US', options: { handsFree?: boolean; enabled?: boolean } = {}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const finalText = useRef('');
  const blocked = useRef(false);
  const handsFree = useRef(options.handsFree ?? false);
  handsFree.current = options.handsFree ?? false;
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  const cancel = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    r.onend = null;
    r.onresult = null;
    r.onerror = null;
    r.abort();
    if (activeRecognition === r) activeRecognition = null;
    rec.current = null;
    finalText.current = '';
    setListening(false);
    setInterim('');
  }, []);

  const start = useCallback(() => {
    const C = recognitionCtor();
    if (!C || rec.current) return;
    activeRecognition?.abort();
    const r = new C();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    finalText.current = '';
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          if (handsFree.current) {
            const text = res[0].transcript.trim();
            if (text) onFinalRef.current(text);
          } else finalText.current += `${res[0].transcript} `;
        }
        else live += res[0].transcript;
      }
      setInterim(`${finalText.current}${live}`.trim());
    };
    r.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        blocked.current = true;
        setError(ERRORS[e.error] ?? `Speech error: ${e.error}`);
      }
    };
    r.onend = () => {
      const text = handsFree.current ? '' : (finalText.current || '').trim() || interimRef.current.trim();
      if (activeRecognition === r) activeRecognition = null;
      if (rec.current !== r) return;
      rec.current = null;
      setListening(false);
      setInterim('');
      if (text) onFinalRef.current(text);
    };
    try {
      rec.current = r;
      activeRecognition = r;
      r.start();
      setError(null);
      setListening(true);
    } catch {
      rec.current = null;
      if (activeRecognition === r) activeRecognition = null;
      blocked.current = true;
      setError('Could not start the microphone. Click the microphone to retry, or type instead.');
    }
  }, [lang]);

  const interimRef = useRef('');
  interimRef.current = interim;

  useEffect(() => {
    if (!options.handsFree) return;
    blocked.current = false;
    const tick = () => {
      const playback = Date.now() < playbackUntil || (typeof speechSynthesis !== 'undefined' && (speechSynthesis.speaking || speechSynthesis.pending));
      if (!options.enabled || document.hidden || playback) {
        cancel();
        return;
      }
      if (!blocked.current && !rec.current && !activeRecognition) start();
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => {
      window.clearInterval(timer);
      cancel();
    };
  }, [options.handsFree, options.enabled, start, cancel]);

  useEffect(() => () => {
    const r = rec.current;
    if (r) {
      r.onend = null;
      r.onresult = null;
      r.onerror = null;
      r.abort();
      if (activeRecognition === r) activeRecognition = null;
    }
  }, []);

  return { supported: speechInputSupported(), listening, interim, error, start, stop, clearError: () => setError(null) };
}

let voice: SpeechSynthesisVoice | null = null;

function englishVoice() {
  if (voice) return voice;
  const voices = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [];
  voice =
    voices.find((v) => /en-US/i.test(v.lang) && /(Aria|Jenny|Samantha|Google US English|Natural)/i.test(v.name)) ??
    voices.find((v) => /^en(-|_)/i.test(v.lang)) ??
    null;
  return voice;
}

let cancelCurrent: (() => void) | null = null;

export function speak(text: string, opts: { rate?: number; pitch?: number; onStart?(): void; onEnd?(): void; onError?(): void } = {}): () => void {
  let settled = false;
  const finish = (success: boolean) => {
    if (settled) return;
    settled = true;
    if (cancelCurrent === cancel) cancelCurrent = null;
    if (success) opts.onEnd?.();
    else opts.onError?.();
  };
  const cancel = () => finish(false);
  if (typeof speechSynthesis === 'undefined') {
    cancel();
    return () => {};
  }
  try {
    // Suspend hands-free input before partner playback can be recognized as player speech.
    activeRecognition?.abort();
    playbackUntil = Date.now() + 500;
    const u = new SpeechSynthesisUtterance(text.replace(/[()]/g, ''));
    u.lang = 'en-US';
    u.rate = opts.rate ?? 1.02;
    u.pitch = opts.pitch ?? 1;
    const v = englishVoice();
    if (v) u.voice = v;
    stopSpeaking();
    cancelCurrent = cancel;
    u.onend = () => finish(true);
    u.onerror = cancel;
    opts.onStart?.();
    speechSynthesis.speak(u);
  } catch {
    cancel();
  }
  return () => {
    if (cancelCurrent === cancel) stopSpeaking();
  };
}

export function stopSpeaking() {
  cancelCurrent?.();
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
