import { Captions, CaptionsOff, Ear, Eye, Keyboard, Mic, MicOff, Send, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { hasChinese } from '@shared/lifeline';
import type { ChatMessage } from '@shared/protocol';
import { Kbd, Tip } from '@/components/ui';
import { useGame, useGameClient } from '@/lib/game-client';
import { speak, useSpeechInput } from '@/lib/speech';

/** Voice-first communication: an open microphone, optional typing, and unchanged captions. */

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

const ttsAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

function readPref(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* private mode */
  }
}

export function useCommsPrefs() {
  const [captions, setCaptions] = useState(() => readPref('objecttalk:captions', !ttsAvailable()));
  const [transcript, setTranscript] = useState(false);
  const [voiceOut, setVoiceOut] = useState(() => readPref('objecttalk:tts', true));
  return {
    captions,
    transcript,
    voiceOut,
    toggleCaptions: () =>
      setCaptions((c) => {
        writePref('objecttalk:captions', !c);
        return !c;
      }),
    toggleTranscript: () => setTranscript((t) => !t),
    setTranscript,
    toggleVoiceOut: () =>
      setVoiceOut((v) => {
        writePref('objecttalk:tts', !v);
        return !v;
      }),
  };
}

export type CommsPrefs = ReturnType<typeof useCommsPrefs>;

/** Partner lines get read aloud: AI always, humans unless you hear them live over the voice link. */
export function useReadAloud(enabled: boolean, liveVoice = false, allAI = false) {
  const client = useGameClient();
  const phase = useGame((s) => s.state?.phase);
  useEffect(() => {
    if (!enabled || phase !== 'playing') return;
    let cancel: (() => void) | undefined;
    const read = (line: ChatMessage) => {
      const state = client.store.getState().state;
      if (!state || !line.role || (allAI ? line.via !== 'ai' : line.playerId === state.you)) return;
      if (line.via !== 'ai' && liveVoice) return;
      const sync = state.settings.mode === 'sim' && state.players.some((p) => p.id === state.you && p.isHost);
      const playback = (status: 'started' | 'ended' | 'unavailable') => {
        if (sync) client.socket.emit('chat:playback', { id: line.id, state: status });
      };
      cancel = speak(line.text, {
        pitch: line.role === 'guide' ? 1.12 : 0.92,
        onStart: () => playback('started'),
        onEnd: () => playback('ended'),
        onError: () => playback('unavailable'),
      });
    };
    // History is never narrated again when a view mounts or a new round starts.
    client.socket.on('chat', read);
    return () => {
      client.socket.off('chat', read);
      cancel?.();
    };
  }, [client, enabled, liveVoice, allAI, phase]);
}

export function VoiceBar({ prefs, compact = false, pttKey = true, tts = true, liveVoice = false, micEnabled, onMicChange, speechPaused = false, controlsOpen, onToggleControls }: {
  prefs: CommsPrefs; compact?: boolean; pttKey?: boolean; tts?: boolean; liveVoice?: boolean;
  micEnabled: boolean; onMicChange(enabled: boolean): void; speechPaused?: boolean;
  controlsOpen: boolean; onToggleControls(): void;
}) {
  const client = useGameClient();
  const chat = useGame((s) => s.chat);
  const me = useGame((s) => s.state?.you);
  const role = useGame((s) => s.state?.yourRole ?? null);
  const playing = useGame((s) => s.state?.phase === 'playing');
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [reveal, setReveal] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useReadAloud(tts && prefs.voiceOut, liveVoice);

  const send = useCallback(
    (t: string, via: 'text' | 'quick' = 'text') => {
      const clean = t.trim();
      if (!clean) return;
      // Chinese never goes to the partner: it becomes a private lifeline (English back to you).
      if (hasChinese(clean)) {
        client.actions
          .assist(clean)
          .then((res) => {
            toast.success(`🛟 Say: “${res.en}”`, { duration: 9000 });
            speak(res.en, { rate: 0.9 });
          })
          .catch((err: Error) => toast.error(err.message));
        return;
      }
      client.actions.say(clean, via);
    },
    [client],
  );

  const speech = useSpeechInput((said) => (hasChinese(said) ? send(said) : client.actions.say(said, 'voice')), 'en-US', {
    handsFree: true,
    enabled: !compact && playing && !!role && micEnabled && !typing && !speechPaused,
  });
  useEffect(() => {
    if (speech.error) {
      toast.error(speech.error);
      onMicChange(false);
      speech.clearError();
    }
  }, [speech.error]);

  const openTyping = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    setTyping(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  // Shortcuts live beside their matching actions; no numbered quick phrases.
  useEffect(() => {
    if (!pttKey) return;
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.key === 'm' || e.key === 'M') && role) {
        e.preventDefault();
        onMicChange(!micEnabled);
      } else if (e.key === 'Enter' && role) {
        e.preventDefault();
        openTyping();
      } else if (e.key === 'c' || e.key === 'C') prefs.toggleCaptions();
      else if (e.key === 't' || e.key === 'T') prefs.toggleTranscript();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [pttKey, role, prefs, openTyping, micEnabled, onMicChange]);

  // The latest partner line (what you just heard).
  const lastPartner = useMemo(() => [...chat].reverse().find((m) => m.playerId !== me && m.role && m.via !== 'system'), [chat, me]);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!lastPartner) return;
    setFresh(true);
    const t = setTimeout(() => setFresh(false), 7000);
    return () => clearTimeout(t);
  }, [lastPartner?.id]);
  const showText = prefs.captions || reveal === lastPartner?.id;

  return (
    <div className="pointer-events-none flex w-full flex-col items-center gap-2">
      {/* What the partner just said: hear it again, or peek at the words */}
      {lastPartner && (fresh || showText) && (
        <div className="pointer-events-auto flex max-w-[min(42rem,calc(100vw-1rem))] animate-pop items-center gap-2 rounded-2xl border-[3px] border-ink bg-white/95 px-3 py-2 shadow-[4px_4px_0_#2d3748] backdrop-blur">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-ink ${lastPartner.role === 'guide' ? 'bg-peach' : 'bg-sky'} ${fresh ? 'animate-pulse' : ''}`}>
            {lastPartner.via === 'ai' ? '🤖' : '🗣️'}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-bold text-muted">{lastPartner.name}</div>
            {showText ? <div className="font-semibold leading-snug">{lastPartner.text}</div> : <div className="font-semibold text-muted italic">🔊 Listen… (captions off)</div>}
          </div>
          <div className="ml-auto flex shrink-0 gap-1">
            <Tip label="Hear it again">
              <button className="rounded-lg border-2 border-ink bg-sun p-1 hover:brightness-95" aria-label="Hear again" onClick={() => speak(lastPartner.text, { rate: 0.92 })}>
                <Ear size={16} strokeWidth={3} />
              </button>
            </Tip>
            {!prefs.captions && (
              <Tip label="Show the words (this line only)">
                <button className="rounded-lg border-2 border-ink bg-white p-1 hover:bg-cream" aria-label="Show text" onClick={() => setReveal(reveal === lastPartner.id ? null : lastPartner.id)}>
                  <Eye size={16} strokeWidth={3} />
                </button>
              </Tip>
            )}
          </div>
        </div>
      )}

      {/* Your own words while the mic is on */}
      {speech.listening && speech.interim && (
        <div className="max-w-[min(40rem,calc(100vw-1rem))] rounded-2xl border-2 border-dashed border-ink bg-mint/80 px-3 py-1.5 text-sm font-semibold">🎙️ {speech.interim || 'Listening… speak now'}</div>
      )}

      {typing && (
        <form
          className="pointer-events-auto flex w-[min(34rem,calc(100vw-1rem))] items-center gap-2 rounded-2xl border-[3px] border-ink bg-white p-2 shadow-[4px_4px_0_#2d3748]"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
            setText('');
            setTyping(false);
          }}
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setTyping(false)}
            placeholder="Type, then Enter (Esc to close). Speaking is better practice!"
            className="input-clay !rounded-xl !py-1.5 text-sm"
            maxLength={300}
            aria-label="Message"
          />
          <button type="submit" className="btn-clay !rounded-xl bg-cta !px-2.5 !py-1.5 text-white" aria-label="Send">
            <Send size={16} strokeWidth={3} />
          </button>
          <button type="button" className="btn-clay !rounded-xl bg-white !px-2 !py-1.5" aria-label="Close" onClick={() => setTyping(false)}>
            <X size={16} strokeWidth={3} />
          </button>
        </form>
      )}

      {/* Four clear actions; secondary controls open in the side panel. */}
      {role && !compact && (
        <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-2xl border-[3px] border-ink bg-white/95 p-1.5 shadow-[4px_4px_0_#2d3748] backdrop-blur sm:gap-2">
          <button
            type="button"
            aria-label={micEnabled ? 'Mute microphone' : 'Enable microphone'}
            aria-pressed={micEnabled}
            disabled={!speech.supported && !liveVoice}
            onClick={() => onMicChange(!micEnabled)}
            title={speech.supported || liveVoice ? 'Microphone · M' : 'Voice input needs Chrome or Edge. Use Type instead.'}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-ink px-3 text-sm font-bold transition-colors disabled:opacity-50 ${micEnabled ? 'bg-mint hover:bg-mint/70' : 'bg-cream hover:bg-sun/40'}`}
          >
            {micEnabled ? <Mic size={19} strokeWidth={2.5} /> : <MicOff size={19} strokeWidth={2.5} />}
            <span>{micEnabled ? 'Mic on' : 'Mic off'}</span>
            <span className="hidden sm:inline"><Kbd>M</Kbd></span>
          </button>
          <button className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold hover:bg-cream" aria-label="Type a message" onClick={openTyping}>
            <Keyboard size={19} strokeWidth={2.5} /><span>Type</span><span className="hidden sm:inline"><Kbd>Enter</Kbd></span>
          </button>
          <button className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold ${prefs.captions ? 'bg-lavender' : 'hover:bg-cream'}`} aria-label="Toggle captions" aria-pressed={prefs.captions} onClick={prefs.toggleCaptions}>
            {prefs.captions ? <Captions size={19} strokeWidth={2.5} /> : <CaptionsOff size={19} strokeWidth={2.5} />}<span className="hidden sm:inline">Captions</span><span className="hidden sm:inline"><Kbd>C</Kbd></span>
          </button>
          <div className="h-6 w-px bg-line" />
          <button className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold ${controlsOpen ? 'bg-sky' : 'hover:bg-cream'}`} aria-label="Controls and tools" aria-expanded={controlsOpen} aria-controls="game-controls" onClick={onToggleControls}>
            <SlidersHorizontal size={19} strokeWidth={2.5} /><span className="hidden sm:inline">Controls</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** The full conversation, hidden by default (T). */
export function Transcript({ onClose, compact = false }: { onClose(): void; compact?: boolean }) {
  const chat = useGame((s) => s.chat);
  const me = useGame((s) => s.state?.you);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length]);
  const visible = chat.filter((m) => m.via !== 'system').slice(compact ? -6 : -60);
  return (
    <div className="clay-card flex w-full animate-pop flex-col overflow-hidden bg-white/95 backdrop-blur">
      <div className="flex items-center justify-between border-b-2 border-line px-3 py-2">
        <span className="font-display font-semibold">📜 Transcript</span>
        <button className="rounded-lg px-1 text-xs font-bold text-muted hover:text-ink" onClick={onClose} aria-label="Hide transcript">
          <Kbd>T</Kbd> hide ✕
        </button>
      </div>
      <div ref={listRef} className={`space-y-2 overflow-y-auto px-3 py-3 ${compact ? 'max-h-36' : 'max-h-[42vh]'}`} aria-live="polite">
        {visible.length === 0 && <p className="py-2 text-center text-sm text-muted">Nothing said yet. Speak with your mic on, or type a message.</p>}
        {visible.map((m) => {
          const mine = m.playerId === me;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`group max-w-[88%] rounded-2xl border-2 border-ink px-3 py-1.5 text-sm leading-snug shadow-[2px_2px_0_#2d3748] ${m.role === 'guide' ? 'bg-peach/70' : m.role === 'builder' ? 'bg-sky/70' : 'bg-lavender'}`}>
                <span className="mr-1 font-display text-xs font-semibold text-muted">
                  {m.via === 'ai' ? '🤖' : m.via === 'voice' ? '🎙️' : m.via === 'quick' ? '⚡' : ''} {mine ? 'You' : m.name}
                </span>
                <span className="font-semibold">{m.text}</span>
                <button className="ml-1 inline-flex align-middle text-muted opacity-60 hover:text-ink hover:opacity-100" aria-label="Hear again" onClick={() => speak(m.text, { rate: 0.92 })}>
                  <Ear size={13} strokeWidth={3} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
