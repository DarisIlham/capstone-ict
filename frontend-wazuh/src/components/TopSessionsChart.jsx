import React, { useCallback, useEffect, useRef, useState } from "react";

const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

function getTipPos(px, py, w, h) {
  const W = Math.max(w, 80);
  const H = Math.max(h, 80);
  const half = 72;
  const left = clamp(px, half + 4, Math.max(half + 4, W - half - 4));
  let top = py - 64;
  if (top < 4) top = py + 12;
  return { left, top: clamp(top, 4, Math.max(4, H - 60)) };
}

export default function TopSessionsChart({ items, color = "#F97316", totalLabel = "sessions", showTotal = true, showLegend = true }) {
  const [selected, setSelected] = useState(null);
  const containerRef = useRef(null);
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
  const total = sorted.reduce((s, it) => s + (it.value ?? 0), 0) || 1;
  const maxV = Math.max(1, ...sorted.map((d) => d.value ?? 0));
  const width = Math.max(size.width, 120);
  const height = Math.max(size.height, 120);
  const narrow = width < 480;
  const pad = narrow ? { l: 24, r: 8, t: 8, b: 28 } : { l: 28, r: 10, t: 8, b: 28 };
  const innerW = Math.max(width - pad.l - pad.r, 40);
  const innerH = Math.max(height - pad.t - pad.b, 40);
  const step = sorted.length > 1 ? innerW / (sorted.length - 1) : innerW;
  const xFor = (i) => pad.l + i * step;
  const yFor = (v) => pad.t + innerH - (v / maxV) * innerH * 0.92;

  const pts = sorted.map((it, i) => ({
    x: xFor(i),
    y: yFor(it.value ?? 0),
    label: String(it.label ?? "-"),
    full: String(it.fullLabel ?? it.label ?? "-"),
    value: it.value ?? 0,
    color: it.color || color,
    index: i,
  }));
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const cx = (a.x + b.x) / 2;
    segs.push({ d: `M ${a.x} ${a.y} C ${cx} ${a.y}, ${cx} ${b.y}, ${b.x} ${b.y}`, color: b.color, key: i });
  }
  const grids = [];
  for (let i = 0; i < 4; i++) {
    const ratio = i / 3;
    grids.push({ value: Math.round(ratio * maxV), y: pad.t + innerH - ratio * innerH });
  }

  return (
    <div
      ref={containerRef}
      className="hm-top-sessions relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden box-border"
      style={{ maxWidth: "100%", contain: "layout paint" }}
      onMouseLeave={() => setSelected(null)}
    >
      {showTotal && (
      <div className="mb-1 flex min-w-0 items-center justify-between gap-2 px-1 shrink-0">
        <span className="shrink-0 text-[11px] font-semibold uppercase text-slate-600">Total</span>
        <span className="min-w-0 truncate text-sm font-bold text-slate-300">
          {new Intl.NumberFormat("en-US").format(total)}{" "}
          <span className="text-xs font-normal text-slate-500">{totalLabel}</span>
        </span>
      </div>
      )}
      <div ref={plotRef} className="hm-top-sessions-plot relative block min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="block h-full w-full overflow-hidden">
          {grids.map((g, idx) => (
            <g key={idx}>
              <line x1={pad.l} y1={g.y} x2={pad.l + innerW} y2={g.y} stroke="var(--soc-border)" strokeWidth="1" opacity="0.5" />
              <text x={pad.l - 5} y={g.y + 3} textAnchor="end" fontSize="10" fill="var(--soc-text-muted)" fontWeight="500">{g.value}</text>
            </g>
          ))}
          <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + innerH} stroke="var(--soc-border)" strokeWidth="1.5" />
          <line x1={pad.l} y1={pad.t + innerH} x2={pad.l + innerW} y2={pad.t + innerH} stroke="var(--soc-border)" strokeWidth="1.5" />
          {segs.map((s) => (
            <path key={s.key} d={s.d} stroke={s.color} strokeWidth="2.5" fill="none" opacity="0.85" />
          ))}
          {pts.map((p) => {
            const isSel = selected?.index === p.index;
            const halfLabel = Math.ceil(p.label.length * 5.4 / 2) + 3;
            const lx = clamp(p.x, halfLabel + 2, Math.max(halfLabel + 2, width - halfLabel - 2));
            return (
              <g key={p.index}>
                <circle cx={p.x} cy={p.y} r={isSel ? 6 : 9} fill="transparent" className="cursor-pointer"
                  onMouseEnter={() => setSelected(p)}
                  onMouseLeave={() => setSelected(null)}
                  onClick={() => setSelected(isSel ? null : p)}
                />
                <circle cx={p.x} cy={p.y} r={isSel ? 5 : 3.5} fill={p.color} stroke="var(--soc-bg)" strokeWidth="1.5" opacity="0.95" className="pointer-events-none" />
                <text x={lx} y={pad.t + innerH + 18} textAnchor="middle" fontSize="10" fill="var(--soc-text-muted)" fontWeight="500">{p.label}</text>
              </g>
            );
          })}
        </svg>
        {selected && (() => {
          const pos = getTipPos(selected.x, selected.y, width, height);
          return (
            <div className="pointer-events-none absolute z-20 min-w-[110px] max-w-[180px] overflow-hidden rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-3 py-2 text-xs shadow-xl"
              style={{ left: `${pos.left}px`, top: `${pos.top}px`, transform: "translateX(-50%)" }}>
              <div className="break-words font-semibold text-slate-300" title={selected.full}>{selected.full}</div>
              <div className="mt-1 text-slate-500">{selected.value} {totalLabel}</div>
            </div>
          );
        })()}
      </div>
      {showLegend && (
      <div className="mt-1 flex w-full min-w-0 max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 overflow-hidden px-1 shrink-0">
        {pts.map((p) => (
          <div key={p.index} className="flex min-w-0 max-w-full items-center gap-1.5 text-[11px] text-slate-400">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="min-w-0 max-w-[110px] truncate" title={p.full}>{p.label}</span>
            <span className="shrink-0 font-mono text-slate-500">{new Intl.NumberFormat("en-US").format(p.value)}</span>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

