import { Mic, MicOff, Send, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Role } from '@shared/types';
import { useGame, useGameClient } from '@/lib/game-client';
import { speak, useSpeechInput } from '@/lib/speech';
import { btn, Kbd, Tip } from '@/components/ui';

const QUICK: Record<Role, string[]> = {
  builder: ['Which one?', 'My left or your left?', 'Is it this one?', 'Can you say that again?', 'Got it!'],
  guide: ['Yes, that one!', 'No, the other one.', 'Closer to you.', 'Farther from you.', 'On YOUR left.', 'On YOUR right.'],
};

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

export function ChatDock({ compact = false, pttKey = true, tts = true }: { compact?: boolean; pttKey?: boolean; tts?: boolean }) {
  const client = useGameClient();
  const chat = useGame((s) => s.chat);
  const me = useGame((s) => s.state?.you);
  const role = useGame((s) => s.state?.yourRole ?? null);
  const playing = useGame((s) => s.state?.phase === 'playing');
  const [text, setText] = useState('');
  const [voiceOn, setVoiceOn] = useState(tts);
  const listRef = useRef<HTMLDivElement>(null);
  const spoken = useRef(new Set<string>());

  const speech = useSpeechInput((said) => client.actions.say(said, 'voice'));

  useEffect(() => {
    if (speech.error) {
      toast.error(speech.error);
      speech.clearError();
    }
  }, [speech.error, speech]);

  // Hold Space to talk (push-to-talk), like a walkie-talkie.
  useEffect(() => {
    if (!pttKey || !speech.supported) return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTyping(e.target)) return;
      e.preventDefault();
      speech.start();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping(e.target)) return;
      e.preventDefault();
      speech.stop();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [pttKey, speech]);

  // Read the AI partner's lines aloud so the player practises listening too.
  useEffect(() => {
    const last = chat[chat.length - 1];
    if (!last || spoken.current.has(last.id)) return;
    spoken.current.add(last.id);
    if (voiceOn && last.via === 'ai' && last.playerId !== me && Date.now() - last.at < 5000) speak(last.text);
  }, [chat, voiceOn, me]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length, speech.interim]);

  const send = (t: string, via: 'text' | 'quick' = 'text') => {
    const clean = t.trim();
    if (!clean) return;
    client.actions.say(clean, via);
    setText('');
  };

  const visible = chat.filter((m) => m.via !== 'system').slice(compact ? -4 : -40);

  return (
    <div className="clay-card flex w-full flex-col overflow-hidden bg-white/95 backdrop-blur">
      <div ref={listRef} className={`space-y-2 overflow-y-auto px-3 pt-3 ${compact ? 'max-h-32' : 'max-h-56'}`} aria-live="polite">
        {visible.length === 0 && <p className="py-2 text-center text-sm text-muted">Talk out loud, hold the mic, or type. Every line goes into your replay.</p>}
        {visible.map((m) => {
          const mine = m.playerId === me;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl border-2 border-ink px-3 py-1.5 text-sm leading-snug shadow-[2px_2px_0_#2d3748] ${
                  m.role === 'guide' ? 'bg-peach/70' : m.role === 'builder' ? 'bg-sky/70' : 'bg-lavender'
                }`}
              >
                <span className="mr-1 font-display text-xs font-semibold text-muted">
                  {m.via === 'ai' ? '🤖' : m.via === 'voice' ? '🎙️' : ''} {mine ? 'You' : m.name}
                </span>
                <span className="font-semibold">{m.text}</span>
              </div>
            </div>
          );
        })}
        {speech.listening && (
          <div className="flex justify-end">
            <div className="max-w-[85%] animate-pulse rounded-2xl border-2 border-dashed border-ink bg-mint/60 px-3 py-1.5 text-sm font-semibold">🎙️ {speech.interim || 'Listening…'}</div>
          </div>
        )}
      </div>

      {role && playing && (
        <div className="flex gap-1.5 overflow-x-auto px-3 pt-2 pb-1">
          {QUICK[role].map((q) => (
            <button key={q} onClick={() => send(q, 'quick')} className="shrink-0 rounded-full border-2 border-ink bg-cream px-2.5 py-0.5 text-xs font-bold whitespace-nowrap hover:bg-sun">
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-center gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        {speech.supported ? (
          <Tip label={<span>Hold to talk (or hold <Kbd>Space</Kbd>)</span>}>
            <button
              type="button"
              aria-label="Hold to talk"
              onPointerDown={(e) => {
                e.preventDefault();
                speech.start();
              }}
              onPointerUp={() => speech.stop()}
              onPointerLeave={() => speech.listening && speech.stop()}
              className={btn(speech.listening ? 'danger' : 'sun', 'sm', '!px-2.5 !py-2 touch-none')}
            >
              {speech.listening ? <MicOff size={18} strokeWidth={3} /> : <Mic size={18} strokeWidth={3} />}
            </button>
          </Tip>
        ) : (
          <Tip label="Voice input needs Chrome or Edge. Typing works everywhere!">
            <span className={btn('white', 'sm', '!px-2.5 !py-2 opacity-50')}>
              <MicOff size={18} strokeWidth={3} />
            </span>
          </Tip>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={role === 'guide' ? 'e.g. "the rocket next to the lamp, on your left"' : 'e.g. "Which one? My left or your left?"'}
          className="input-clay !rounded-xl !py-2 text-sm"
          maxLength={300}
          aria-label="Message"
        />
        <button type="submit" className={btn('primary', 'sm', '!px-2.5 !py-2')} aria-label="Send">
          <Send size={18} strokeWidth={3} />
        </button>
        {tts && (
          <Tip label={voiceOn ? 'Mute AI voice' : 'Read AI lines aloud'}>
            <button type="button" onClick={() => setVoiceOn((v) => !v)} className={btn('white', 'sm', '!px-2.5 !py-2')} aria-label="Toggle AI voice">
              {voiceOn ? <Volume2 size={18} strokeWidth={3} /> : <VolumeX size={18} strokeWidth={3} />}
            </button>
          </Tip>
        )}
      </form>
    </div>
  );
}
