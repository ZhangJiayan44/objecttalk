import { EyeOff, Maximize, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CHAPTERS, FILM_DURATION, chapterAt, clampTime } from '@/components/demo/timeline';
import { asset } from '@/lib/asset';
import { DemoClockContext, DemoPrewarmTimeContext, DemoQualityContext, warmNativeScenes } from '@/components/demo/NativeDemoScene';
import { ChapterContent, FilmLogo } from '@/components/demo/FilmScenes';
import { readGraphicsMode, type GraphicsMode } from '@/lib/graphics';
import { paintFilmMotion, TRANSITION_SECONDS } from '@/components/demo/motion';
import './demo.css';

declare global {
  interface Window {
    /** Only available with ?capture=1; used by scripts/record-demo.mjs. */
    __objectTalkDemo?: {
      seek: (seconds: number) => void;
      play: () => void;
      pause: () => void;
      ready: boolean;
      duration: number;
    };
  }
}
export default function Demo() {
  const query = useRef(new URLSearchParams(window.location.search));
  const capture = query.current.get('capture') === '1';
  const [clean, setClean] = useState(() => capture || query.current.get('record') === '1');
  const reduced = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches).current;
  const [time, setTime] = useState(() => clampTime(Number(query.current.get('time') ?? 0)));
  const [playing, setPlaying] = useState(() => query.current.get('paused') !== '1' && !reduced && !capture);
  const [ready, setReady] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [muted, setMuted] = useState(true);
  const [quality, setQuality] = useState<GraphicsMode>(() => {
    const requested = query.current.get('quality');
    if (requested === 'high' || requested === 'low' || requested === 'off' || requested === 'auto') return requested;
    try {
      const saved = localStorage.getItem('objecttalk:demo-quality');
      if (saved === 'high' || saved === 'low' || saved === 'off' || saved === 'auto') return saved;
    } catch {
      /* private mode */
    }
    const mode = readGraphicsMode();
    return mode === 'off' ? 'off' : 'low';
  });
  const [scale, setScale] = useState(1);
  const [controls, setControls] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const clock = useRef({ time, started: 0 });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chapter = chapterAt(time);
  const chapterIndex = CHAPTERS.indexOf(chapter);
  useLayoutEffect(() => {
    paintFilmMotion(stage.current, clock.current.time, reduced);
  });
  const seek = useCallback((seconds: number) => {
    const next = clampTime(seconds);
    clock.current.time = next;
    clock.current.started = performance.now();
    setTime(next);
    if (audio.current) audio.current.currentTime = next;
  }, []);
  const showControls = useCallback(() => {
    if (clean) return;
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 2400);
  }, [clean]);
  useEffect(() => {
    warmNativeScenes();
    let live = true;
    Promise.all([document.fonts.ready])
      .then(() => {
        if (live) setReady(true);
      })
      .catch(() => {
        if (live) setReady(true);
      });
    const resize = () => setScale(Math.min(window.innerWidth / 1600, window.innerHeight / 900));
    resize();
    window.addEventListener('resize', resize);
    const previousTitle = document.title;
    document.title = 'ObjectTalk — Demo';
    if (!capture && !document.fullscreenElement && navigator.userActivation?.isActive)
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    return () => {
      live = false;
      window.removeEventListener('resize', resize);
      document.title = previousTitle;
      clearTimeout(hideTimer.current);
    };
  }, [capture]);
  useEffect(() => {
    clock.current.started = performance.now();
    let frame: number;
    let last = performance.now();
    let committed = 0;
    const tick = (now: number) => {
      // A hidden next chapter may warm without stopping the current chapter.
      const pending = !!stage.current?.querySelector(prepared
        ? '[data-film-layer="active"] [data-native-ready="false"], [data-film-layer="active"] [data-effect-ready="false"]'
        : '[data-native-ready="false"], [data-effect-ready="false"]');
      if (ready && !prepared && !pending) setPrepared(true);
      if (pending && audio.current && !audio.current.paused) audio.current.pause();
      if (ready && prepared && playing && !pending) {
        let next = clampTime(clock.current.time + (now - last) / 1000);
        const currentChapter = chapterAt(clock.current.time);
        if (next >= currentChapter.end && stage.current?.querySelector('[data-film-layer="preload"] [data-native-ready="false"], [data-film-layer="preload"] [data-effect-ready="false"]')) {
          // If a cold device needs longer, hold the outgoing shot before the
          // slide starts; never freeze a half-completed transition.
          next = currentChapter.end - 0.0001;
        }
        clock.current.time = next;
        const interval = 1000 / (quality === 'off' ? 30 : 60);
        if (now - committed >= interval - 0.5 || next === FILM_DURATION) {
          setTime(next);
          // Preserve the fractional remainder. Resetting to `now` accumulates
          // RAF rounding error and produces irregular 33/50ms frame spacing.
          committed += Math.max(1, Math.floor((now - committed + 0.5) / interval)) * interval;
        }
        if (audio.current && !audio.current.muted && audio.current.paused) {
          audio.current.currentTime = next;
          void audio.current.play().catch(() => setMuted(true));
        }
        if (next === FILM_DURATION) {
          setPlaying(false);
          return;
        }
      }
      paintFilmMotion(stage.current, clock.current.time, reduced);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, ready, prepared, quality, reduced]);
  useEffect(() => {
    if (!audio.current) return;
    audio.current.muted = muted;
    if (playing && ready && !muted) {
      audio.current.currentTime = time;
      void audio.current.play().catch(() => setMuted(true));
    } else audio.current.pause();
    // RAF is authoritative; resync audio only when transport changes or the user seeks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, muted, ready]);
  useEffect(() => {
    if (capture)
      window.__objectTalkDemo = {
        seek,
        play: () => setPlaying(true),
        pause: () => setPlaying(false),
        ready: ready && prepared,
        duration: FILM_DURATION,
      };
    return () => {
      if (capture) delete window.__objectTalkDemo;
    };
  }, [capture, seek, ready, prepared]);
  const toggle = useCallback(() => {
    if (clock.current.time >= FILM_DURATION) seek(0);
    setPlaying((p) => !p);
  }, [seek]);
  const fullscreen = useCallback(() => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,button,select') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
        showControls();
      }
      if (e.key.toLowerCase() === 'r') {
        seek(0);
        setPlaying(true);
      }
      if (e.key.toLowerCase() === 'm') setMuted((m) => !m);
      if (e.key.toLowerCase() === 'h' && !capture) {
        setClean((hidden) => !hidden);
        setControls(clean);
        (document.activeElement as HTMLElement | null)?.blur();
      }
      if (e.key.toLowerCase() === 'f') fullscreen();
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        seek(time + (e.key === 'ArrowRight' ? 5 : -5));
        showControls();
      }
    };
    document.addEventListener('keydown', key);
    const visibility = () => {
      if (document.hidden && !capture) setPlaying(false);
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [toggle, seek, fullscreen, showControls, time, capture]);
  return (
    <DemoQualityContext.Provider value={quality}>
    <DemoClockContext.Provider value={clock}>
      <main
        className={`demo-cinema ${capture ? 'is-capture' : ''} ${clean ? 'is-clean' : ''} ${playing ? 'is-playing' : 'is-paused'} ${reduced ? 'is-reduced' : ''}`}
        aria-label="ObjectTalk 48-second animated demo"
        onPointerMove={showControls}
        onPointerDown={showControls}
      >
        <audio ref={audio} src={asset('/demo/score.mp3')} preload="auto" />
        <div
          ref={stage}
          className="film-stage"
          style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
          data-chapter={chapter.id}
          data-time={time.toFixed(3)}
        >
          <div className="film-brand">
            <FilmLogo />
            <span>ENGLISH, IN PLAY.</span>
          </div>
          <div className="film-chapter-label">
            <span>0{chapterIndex + 1}</span><i />{chapter.label}
          </div>
          {!ready ? (
            <div className="film-loading">
              <FilmLogo large />
              <p>Setting the scene…</p>
            </div>
          ) : (
            <>
              {CHAPTERS.map((c, i) => {
                const active = i === chapterIndex;
                const previous = !reduced && i === chapterIndex - 1 && time < chapter.start + TRANSITION_SECONDS;
                // Prepare all nine native canvases before playback, including
                // coach and outro. Retain frozen past shots for this short film:
                // no shader compilation or context disposal interrupts a pan.
                const preload = i > chapterIndex;
                const parked = !active && !previous && !preload;
                // Warm fully entered content: opacity:0 / visibility:hidden
                // lets browsers defer the first real canvas composition.
                const sceneTime = active ? time : previous || parked ? c.end - 0.001 : c.start + 2;
                return (
                  <div key={c.id} className="film-chapter-layer"
                    data-film-layer={active ? 'active' : previous ? 'previous' : preload ? 'preload' : 'parked'}
                    data-boundary={previous ? chapter.start : c.start}
                    data-scene={c.id} data-transition={['cut', 'slats', 'iris', 'slats', 'lift', 'brand'][previous ? chapterIndex : i]} aria-hidden={!active}>
                    <DemoPrewarmTimeContext.Provider value={preload ? c.start : undefined}>
                      <ChapterContent id={c.id} time={sceneTime} reduced={reduced} />
                    </DemoPrewarmTimeContext.Provider>
                    <div className="film-caption">{c.caption}</div>
                  </div>
                );
              })}
            </>
          )}
          {ready && prepared && <div className="film-transition" aria-hidden="true">
            {CHAPTERS.filter(c => c.id === 'partners' || c.id === 'worlds' || c.id === 'coach').map(c => <div key={c.id}>
              {[0, 1, 2].map(i => <i key={i} data-transition-slat={i} data-start={c.start} />)}
            </div>)}
          </div>}
          {ready && !prepared && <div className="film-loading"><FilmLogo large /><p>Preparing the worlds…</p></div>}
        </div>
        {!clean && (
          <div
            className={`film-controls ${controls || !playing ? 'visible' : ''}`}
            onPointerMove={(e) => {
              e.stopPropagation();
              showControls();
            }}
            onFocus={showControls}
          >
            <button
              onClick={toggle}
              aria-label={playing ? 'Pause demo' : time >= FILM_DURATION ? 'Replay demo' : 'Play demo'}
            >
              {playing ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button
              onClick={() => {
                seek(0);
                setPlaying(true);
              }}
              aria-label="Replay from beginning"
            >
              <RotateCcw size={19} />
            </button>
            <span className="film-time">
              {String(Math.floor(time)).padStart(2, '0')} / {FILM_DURATION}s
            </span>
            <input
              aria-label="Demo timeline"
              type="range"
              min={0}
              max={FILM_DURATION}
              step={0.1}
              value={time}
              onChange={(e) => seek(Number(e.target.value))}
            />
            <button onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Enable soundtrack' : 'Mute soundtrack'}>
              {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <select
              aria-label="Demo rendering quality"
              value={quality}
              onChange={(e) => {
                const next = e.target.value as GraphicsMode;
                setQuality(next);
                try {
                  localStorage.setItem('objecttalk:demo-quality', next);
                } catch {
                  /* private mode */
                }
              }}
            >
              <option value="low">Smooth</option>
              <option value="off">Fast</option>
              <option value="auto">Auto</option>
              <option value="high">High</option>
            </select>
            <button onClick={fullscreen} aria-label="Enter fullscreen">
              <Maximize size={20} />
            </button>
            <button onClick={() => { setClean(true); setControls(false); }} aria-label="Hide controls for recording (H)" title="Hide controls for recording · H to restore">
              <EyeOff size={20} />
            </button>
          </div>
        )}
        {!clean && reduced && !playing && time === 0 && (
          <button className="film-motion-start" onClick={toggle}>
            <Play size={18} /> Play the 48-second film
          </button>
        )}
      </main>
    </DemoClockContext.Provider>
    </DemoQualityContext.Provider>
  );
}
