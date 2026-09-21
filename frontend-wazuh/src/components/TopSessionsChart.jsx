import React, { useCallback, useEffect, useRef, useState } from "react";
import { adaptiveLeftGutter } from "../utils/chartAxis";

const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

// Top Sessions with the Threat Classification (dashboard CategoryLineChart)
// design concept: Total header row, smooth multi-color categorical line,
// solid gridlines, bottom legend, hover tooltip — fed by top-sessions data.
export default function TopSessionsChart({ items, color = "#F97316", totalLabel = "sessions", showTotal = true, showLegend = true }) {
  const [selected, setSelected] = useState(null);
  const plotRef = useRef(null);
  const [size, setSize] = useState({ width: 300, height: 180 });

  const sync = useCallback(() => {
    const el = plotRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      setSize((p) =>
        Math.abs(p.width - r.width) < 1 && Math.abs(p.height - r.height) < 1
          ? p
          : { width: r.width, height: r.height }
      );
    }
  }, []);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return undefined;
    sync();
    const raf = requestAnimationFrame(sync);
    const ob = new ResizeObserver(sync);
    ob.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      cancelAnimationFrame(raf);
      ob.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [sync, items]);

  if (!items || items.length === 0) {
    return (
      <div className="flex min-h-16 w-full min-w-0 max-w-full flex-col items-center justify-center px-2 py-8 text-center">
        <p className="text-[10px] font-medium text-[var(--soc-text-secondary)]">No session data</p>
        <p className="mt-0.5 text-[9px] text-[var(--soc-text-muted)]">No session activity.</p>
      </div>
    );
  }

  const sorted = [...items].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const total = sorted.reduce((s, it) => s + (it.value ?? 0), 0) || 0;
  const maxV = Math.max(1, ...sorted.map((d) => d.value ?? 0));
  const width = Math.max(size.width, 120);
  const height = Math.max(size.height, 120);
  const basePad = width < 500
    ? { l: 16, r: 12, t: 6, b: 22 }
    : width < 768
      ? { l: 24, r: 18, t: 8, b: 26 }
      : width < 1000
        ? { l: 32, r: 24, t: 8, b: 28 }
        : { l: 40, r: 40, t: 10, b: 32 };
  const axisFontSize = width < 500 ? 7 : width < 1000 ? 8 : 9;
  const xLabelFontSize = width < 500 ? 7 : width < 1000 ? 8 : 9;
  const xLabelOffset = width < 500 ? 12 : width < 1000 ? 14 : 16;
  const gridVals = [0, 1, 2, 3].map((i) => Math.round(((i / 3) * maxV * 10)) / 10);
  const pad = { ...basePad, l: adaptiveLeftGutter(gridVals, basePad.l, 12, `500 ${axisFontSize}px sans-serif`) };
  const innerW = Math.max(width - pad.l - pad.r, 40);
  const innerH = Math.max(height - pad.t - pad.b, 40);
  const step = sorted.length > 1 ? innerW / (sorted.length - 1) : innerW;
  const xFor = (i) => pad.l + i * step;
  const yFor = (v) => pad.t + innerH - ((v ?? 0) / maxV) * innerH;

  const points = sorted.map((it, i) => ({
    x: xFor(i),
    y: yFor(it.value),
    label: String(it.label ?? "-"),
    full: String(it.fullLabel ?? it.label ?? "-"),
    sub: String(it.sub ?? ""),
    value: it.value ?? 0,
    color: it.color || color,
    index: i,
  }));

  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const cx = (a.x + b.x) / 2;
    segments.push({
      d: `M ${a.x} ${a.y} C ${cx} ${a.y}, ${cx} ${b.y}, ${b.x} ${b.y}`,
      color: b.color,
      key: `${a.label}-${b.label}-${i}`,
    });
  }

  const gridSteps = 4;
  const gridLines = [];
  for (let i = 0; i < gridSteps; i++) {
    const ratio = i / (gridSteps - 1);
    gridLines.push({
      value: Math.round(ratio * maxV),
      y: pad.t + innerH - ratio * innerH,
    });
  }

  const maxXLabels = width < 360 ? (points.length > 3 ? 2 : points.length) : width < 500 ? 4 : points.length;
  const xLabelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, maxXLabels)));
  const fmt = (v) => new Intl.NumberFormat("en-US").format(v ?? 0);

  return (
    <div
      className="hm-top-sessions relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden box-border"
      style={{ maxWidth: "100%", contain: "layout paint" }}
      onMouseLeave={() => setSelected(null)}
    >
      {showTotal && (
        <div className="mb-1 flex min-w-0 items-center justify-between gap-2 px-1 shrink-0">
          <span className="shrink-0 text-[11px] font-semibold uppercase text-[var(--soc-text-muted)]">Total</span>
          <span className="min-w-0 truncate text-sm font-bold text-[var(--soc-text-primary)]">
            {fmt(total)}{" "}
            <span className="text-xs font-normal text-[var(--soc-text-muted)]">{totalLabel}</span>
          </span>
        </div>
      )}
      <div ref={plotRef} className="hm-top-sessions-plot relative block min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block h-full w-full overflow-hidden">
          {gridLines.map((g, idx) => (
            <g key={`grid-${idx}`}>
              <line x1={pad.l} y1={g.y} x2={pad.l + innerW} y2={g.y} stroke="var(--soc-border)" strokeWidth="1.5" opacity={g.y === pad.t || g.y === pad.t + innerH ? "1" : "0.5"} />
              <text x={pad.l - 4} y={g.y + 3} textAnchor="end" fontSize={axisFontSize} fill="var(--soc-text-muted)" fontWeight="500">{g.value}</text>
            </g>
          ))}
          <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + innerH} stroke="var(--soc-border)" strokeWidth="1.5" opacity="0.6" />
          <line x1={pad.l} y1={pad.t + innerH} x2={pad.l + innerW} y2={pad.t + innerH} stroke="var(--soc-border)" strokeWidth="1.5" opacity="0.6" />
          {segments.map((s) => (
            <path key={s.key} d={s.d} stroke={s.color} strokeWidth="3" fill="none" opacity="0.9" />
          ))}
          {points.map((p) => {
            const isSel = selected?.index === p.index;
            const isFirst = p.index === 0;
            const isLast = p.index === points.length - 1;
            const showXLabel = xLabelEvery === 1 || p.index % xLabelEvery === 0 || isLast;
            const halfLabel = Math.ceil(p.label.length * 5.4 / 2) + 3;
            const labelX = clamp(p.x, halfLabel + 2, Math.max(halfLabel + 2, width - halfLabel - 2));
            return (
              <g key={`${p.label}-${p.index}`}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isSel ? 6 : 9}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setSelected(p)}
                  onMouseLeave={() => setSelected(null)}
                  onClick={() => setSelected(isSel ? null : p)}
                />
                <circle cx={p.x} cy={p.y} r={isSel ? 5 : 3.5} fill={p.color} stroke="var(--soc-bg)" strokeWidth="1.5" opacity="0.95" className="pointer-events-none" />
                {showXLabel && (
                  <text
                    x={isFirst ? pad.l : isLast ? pad.l + innerW : labelX}
                    y={pad.t + innerH + xLabelOffset}
                    textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
                    fontSize={xLabelFontSize}
                    fill="var(--soc-text-muted)"
                    fontWeight="500"
                  >
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {selected && (() => {
          // Keep the tooltip fully inside the plot: flip below the point
          // when there is not enough room above (plot is overflow-hidden).
          const estH = 72;
          const half = 112;
          const left = clamp(selected.x, half + 4, Math.max(half + 4, width - half - 4));
          const placeBelow = selected.y < estH + 16;
          const top = placeBelow ? selected.y + 14 : selected.y - 12;
          return (
            <div
              className="pointer-events-none absolute z-20 min-w-[110px] max-w-[180px] overflow-hidden rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-2 text-xs shadow-xl"
              style={{
                left: `${left}px`,
                top: `${top}px`,
                transform: placeBelow ? "translateX(-50%)" : "translate(-50%, -100%)",
              }}
            >
              <div className="break-words font-semibold text-slate-300" title={selected.full}>{selected.full}</div>
              {selected.sub && <div className="mt-0.5 break-words text-slate-500">{selected.sub}</div>}
              <div className="mt-1 text-slate-500">{fmt(selected.value)} {totalLabel}</div>
            </div>
          );
        })()}
      </div>
      {showLegend && (
        <div className="chart-legend mt-1 flex w-full min-w-0 max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 overflow-hidden px-1 shrink-0">
          {points.map((p) => (
            <div key={`${p.label}-${p.index}`} className="flex min-w-0 max-w-full items-center gap-1.5 text-[11px] text-slate-400">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="min-w-0 max-w-[110px] truncate" title={p.full}>{p.label}</span>
              <span className="shrink-0 font-mono text-slate-500">{fmt(p.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
