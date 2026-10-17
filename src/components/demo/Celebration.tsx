import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import confettiSource from 'canvas-confetti/dist/confetti.browser.js?raw';

/** Official canvas-confetti Realistic Look preset; a private frame realm lets
 * the library follow pause, seek and export without changing the website's RAF. */
export function Celebration({ time }: { time: number }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(time);
  latest.current = time;
  const [ready, setReady] = useState(false);
  const html = useMemo(
    () => `<!doctype html><html><head><style>html,body{margin:0;overflow:hidden;background:transparent}canvas{display:block;width:1600px;height:714px}</style></head><body><canvas id="celebration" width="1600" height="714"></canvas><script>
    const queue = new Map(); let id = 0, stamp = 0, step = -1, seed = 7349;
    window.requestAnimationFrame = cb => { queue.set(++id, cb); return id; };
    window.cancelAnimationFrame = key => queue.delete(key);
    Math.random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  </script><script>${confettiSource.replace(/<\/script/gi, '<\\/script')}</script><script>
    const fire = confetti.create(document.getElementById('celebration'), { resize: false, useWorker: false });
    const colors = ['#f6a99c', '#83c8df', '#ffd166', '#9b7bf2', '#22c55e', '#f8e4bf'];
    function burst(count) {
      for (const side of [0, 1]) {
        const defaults = { origin: { x: side ? 1.02 : -0.02, y: 0.98 }, angle: side ? 118 : 62, colors, ticks: 310, gravity: 0.82, scalar: 1.1, drift: side ? -0.15 : 0.15 };
        const shot = (ratio, options) => fire({ ...defaults, ...options, particleCount: Math.floor(count * ratio) });
        shot(0.25, { spread: 26, startVelocity: 61 });
        shot(0.20, { spread: 60, startVelocity: 53 });
        shot(0.35, { spread: 100, startVelocity: 49, decay: 0.94, scalar: 0.85 });
        shot(0.10, { spread: 120, startVelocity: 30, decay: 0.93, scalar: 1.35 });
        shot(0.10, { spread: 120, startVelocity: 52 });
      }
    }
    window.seekCelebration = seconds => {
      const target = Math.max(0, Math.floor(seconds * 60));
      if (target < step) { fire.reset(); queue.clear(); seed = 7349; step = -1; }
      while (step < target) {
        step++; stamp += 1000 / 60;
        if (step === 33) burst(110);
        if (step === 84) burst(65);
        const pending = [...queue.values()]; queue.clear();
        pending.forEach(cb => cb(stamp));
      }
    };
  </script></body></html>`,
    [],
  );
  const seek = () => {
    const target = frame.current?.contentWindow as (Window & { seekCelebration?: (t: number) => void }) | null;
    target?.seekCelebration?.(Math.max(0, latest.current));
  };
  useLayoutEffect(seek, [time]);
  return (
    <iframe
      ref={frame}
      className="film-celebration"
      title="Celebration"
      aria-hidden="true"
      tabIndex={-1}
      data-effect-ready={ready}
      srcDoc={html}
      onLoad={() => {
        seek();
        setReady(true);
      }}
    />
  );
}
