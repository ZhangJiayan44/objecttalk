import { useState } from 'react';

/**
 * Single-series bar chart for clarity scores (0-100). One series, so no
 * legend: the card title names it. Thin bars with rounded data-ends anchored
 * to the baseline, a 2px gap between bars, recessive gridlines, and a hover
 * tooltip per bar with a hit area larger than the mark.
 */
export function ScoreBars({ values, labels, height = 140, color = 'var(--color-cta)' }: { values: number[]; labels?: string[]; height?: number; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 320;
  const pad = { l: 26, r: 6, t: 8, b: 18 };
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const n = Math.max(values.length, 1);
  const slot = innerW / n;
  const barW = Math.min(26, slot - 2);
  const y = (v: number) => pad.t + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={`Clarity scores: ${values.join(', ')}`}>
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={w - pad.r} y1={y(g)} y2={y(g)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(g) + 3.5} textAnchor="end" fontSize="9" fill="var(--color-muted)" fontWeight={700}>
              {g}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const x = pad.l + i * slot + (slot - barW) / 2;
          const top = y(v);
          const h = Math.max(2, pad.t + innerH - top);
          const r = Math.min(4, barW / 2, h);
          // Rounded only at the data end; square at the baseline.
          const d = `M${x},${pad.t + innerH} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + barW - r},${top} Q${x + barW},${top} ${x + barW},${top + r} L${x + barW},${pad.t + innerH} Z`;
          return (
            <g key={i}>
              <path d={d} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={innerH + pad.b} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} tabIndex={0} />
              {labels && (n <= 10 || i % 2 === 0) && (
                <text x={pad.l + i * slot + slot / 2} y={height - 4} textAnchor="middle" fontSize="9" fill="var(--color-muted)" fontWeight={700}>
                  {labels[i]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-xl border-2 border-ink bg-white px-2 py-1 text-xs font-bold whitespace-nowrap text-ink shadow-[2px_2px_0_#2d3748]"
          style={{ left: `${((pad.l + hover * slot + slot / 2) / w) * 100}%`, top: `${(y(values[hover]) / height) * 100}%` }}
        >
          {labels?.[hover] ? `${labels[hover]}: ` : ''}clarity {values[hover]}
        </div>
      )}
    </div>
  );
}
