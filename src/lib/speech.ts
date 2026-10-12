import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Speech in the browser, no server round-trip:
 *  - useSpeechInput: push-to-talk speech-to-text (Web Speech API, en-US).
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

export function useSpeechInput(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const finalText = useRef('');
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const C = recognitionCtor();
    if (!C || rec.current) return;
    const r = new C();
    r.lang = 'en-US';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    finalText.current = '';
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += `${res[0].transcript} `;
        else live += res[0].transcript;
      }
      setInterim(`${finalText.current}${live}`.trim());
    };
    r.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') setError(ERRORS[e.error] ?? `Speech error: ${e.error}`);
    };
    r.onend = () => {
      const text = (finalText.current || '').trim() || interimRef.current.trim();
      rec.current = null;
      setListening(false);
      setInterim('');
      if (text) onFinalRef.current(text);
    };
    try {
      r.start();
      rec.current = r;
      setError(null);
      setListening(true);
    } catch {
      rec.current = null;
    }
  }, []);

  const interimRef = useRef('');
  interimRef.current = interim;

  useEffect(() => () => rec.current?.abort(), []);

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

export function speak(text: string, opts: { rate?: number; pitch?: number } = {}) {
  if (typeof speechSynthesis === 'undefined') return;
  try {
    const u = new SpeechSynthesisUtterance(text.replace(/[()]/g, ''));
    u.lang = 'en-US';
    u.rate = opts.rate ?? 1.02;
    u.pitch = opts.pitch ?? 1;
    const v = englishVoice();
    if (v) u.voice = v;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    /* TTS is a nice-to-have */
  }
}

export function stopSpeaking() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
