import { useState } from 'react';
import { fmtDate } from '../utils';

const niceCeil = (v) => {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10;
  return m * p;
};
const barPath = (x, y, w, h, r) => {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
};

/**
 * Enquiries (bars, series 1) and Admissions (markers, series 2) on ONE shared count axis.
 * Hover any day for both numbers. Legend is outside the SVG; a table view is provided by the caller.
 */
export function ComboChart({ data, height = 230 }) {
  const [hover, setHover] = useState(null);
  const W = 760;
  const m = { l: 34, r: 8, t: 12, b: 26 };
  const iw = W - m.l - m.r;
  const ih = height - m.t - m.b;
  const max = niceCeil(Math.max(1, ...data.map((d) => Math.max(d.enquiries, d.admissions))));
  const band = iw / Math.max(1, data.length);
  const bw = Math.max(3, Math.min(26, band * 0.62));
  const x = (i) => m.l + band * i + band / 2;
  const y = (v) => m.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const step = Math.ceil(data.length / 8);
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="chart-wrap">
      <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Daily enquiries and admissions">
        <g className="grid">{ticks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />)}</g>
        {ticks.map((t) => <text key={`t${t}`} x={m.l - 6} y={y(t) + 4} textAnchor="end">{t}</text>)}
        {data.map((d, i) => d.enquiries > 0 && (
          <path key={d.date} d={barPath(x(i) - bw / 2, y(d.enquiries), bw, y(0) - y(d.enquiries), 4)} fill="var(--series-1)" opacity={hover === null || hover === i ? 1 : 0.55} />
        ))}
        {data.map((d, i) => d.admissions > 0 && <circle key={`c${d.date}`} cx={x(i)} cy={y(d.admissions)} r="5" fill="var(--series-2)" stroke="var(--surface)" strokeWidth="2" />)}
        {data.map((d, i) => i % step === 0 && <text key={`x${d.date}`} x={x(i)} y={height - 8} textAnchor="middle">{fmtDate(d.date, false)}</text>)}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={y(0)} stroke="var(--muted)" strokeDasharray="3 3" />}
        {data.map((d, i) => (
          <rect key={`h${d.date}`} x={m.l + band * i} y={m.t} width={band} height={ih} fill="transparent" tabIndex={0}
            aria-label={`${fmtDate(d.date)}: ${d.enquiries} enquiries, ${d.admissions} admissions`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
        ))}
      </svg>
      {h && (
        <div className="tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(Math.max(h.enquiries, h.admissions)) / height) * 100}%` }}>
          <b>{fmtDate(h.date)}</b><br />Enquiries: {h.enquiries}<br />Admissions: {h.admissions}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars with a visible value; single series => one colour. */
export function HBars({ rows, valueKey, labelKey, max, format = (v) => v }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r[valueKey]));
  return (
    <div>
      {rows.map((r) => (
        <div className="hbar" key={r[labelKey]}>
          <span className="small">{r[labelKey]}</span>
          <div className="track" title={`${r[labelKey]}: ${format(r[valueKey])}`}><div className="fill" style={{ width: `${(r[valueKey] / top) * 100}%` }} /></div>
          <b className="mono small">{format(r[valueKey])}</b>
        </div>
      ))}
    </div>
  );
}
