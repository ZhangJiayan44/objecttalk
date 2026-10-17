import { memo, type CSSProperties, type ReactNode } from 'react';

export type Pose2D = { x?: number; y?: number; s?: number; r?: number; o?: number; sx?: number; sy?: number };
export type MotionKey = Pose2D & { t: number; ease?: 'linear' | 'out' | 'smooth' | 'back' };
export const key = (t: number, pose: Pose2D, ease: MotionKey['ease'] = 'smooth'): MotionKey => ({ t, ...pose, ease });
export const reveal = (start: number, from: Pose2D = {}, duration = 0.42): MotionKey[] => [
  key(start, { y: 54, o: 0, s: 0.94, ...from }), key(start + duration, { y: 0, o: 1, s: 1, r: 0 }, 'out'),
];

/** One film clock drives live composition and frame-exact export. */
export function Motion({ children, keys, className = '', style, as: Tag = 'div', ...props }: {
  children?: ReactNode; keys: MotionKey[]; className?: string; style?: CSSProperties; as?: 'div' | 'span' | 'article';
  [key: `data-${string}`]: string | number | undefined;
}) {
  return <Tag {...props} className={className} style={style} data-motion={JSON.stringify(keys)}>{children}</Tag>;
}
export const Words = memo(function Words({ text, start, className = '', gap = 0.075 }: { text: string; start: number; className?: string; gap?: number }) {
  return <span className={`kinetic-words ${className}`} aria-label={text}>{text.split(' ').map((word, i) => (
    <span className="word-mask" key={`${word}-${i}`} aria-hidden="true"><Motion as="span" keys={reveal(start + i * gap, { y: 95, r: 6, s: 0.9 }, 0.38)}>{word}&nbsp;</Motion></span>
  ))}</span>;
});
export const Impact = memo(function Impact({ start, color = 'var(--color-sun)', className = '' }: { start: number; color?: string; className?: string }) {
  return <Motion className={`film-impact ${className}`} keys={[key(start, { s: 0.3, o: 0, r: -12 }), key(start + 0.13, { s: 0.75, o: 1, r: 0 }), key(start + 0.6, { s: 1.25, o: 0, r: 10 })]}>
    <svg viewBox="0 0 200 200" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round">{Array.from({ length: 12 }, (_, i) => {
      const a = i * Math.PI / 6;
      return <path key={i} d={`M${100 + Math.cos(a) * 65},${100 + Math.sin(a) * 65} L${100 + Math.cos(a) * 90},${100 + Math.sin(a) * 90}`} />;
    })}</svg>
  </Motion>;
});
