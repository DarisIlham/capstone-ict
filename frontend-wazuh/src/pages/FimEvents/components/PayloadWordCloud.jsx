import React from "react";

const WORD_COLORS = ["#f472b6", "#38bdf8", "#4ade80", "#a78bfa", "#fb923c", "#34d399", "#f87171", "#facc15", "#60a5fa", "#e879f9"];

const PayloadWordCloud = ({ words, compact = false }) => {
  if (!words || words.length === 0) {
    return <div className="flex items-center justify-center h-full text-slate-600 text-xs">No payload data</div>;
  }

  const W = compact ? 520 : 620;
  const H = compact ? 180 : 200;
  const maxCount = words[0].count;
  const minCount = words[words.length - 1]?.count || 0;
  const range = Math.max(1, maxCount - minCount);
  const fontSize = (count) => Math.round((compact ? 9 : 11) + ((count - minCount) / range) * (compact ? 22 : 31));
  const estWidth = (text, fs) => text.length * fs * 0.6;
  const rects = [];
  const placed = [];

  const overlaps = (nx, ny, nw, nh) => {
    const pad = 4;
    return rects.some(
      (r) => nx - nw / 2 - pad < r.x + r.w / 2 && nx + nw / 2 + pad > r.x - r.w / 2 && ny - nh / 2 - pad < r.y + r.h / 2 && ny + nh / 2 + pad > r.y - r.h / 2
    );
  };

  for (let i = 0; i < words.length; i += 1) {
    const { text, count } = words[i];
    const fs = fontSize(count);
    const tw = estWidth(text, fs);
    const th = fs * 1.2;
    let placed_x = W / 2;
    let placed_y = H / 2;
    let found = false;

    for (let step = 0; step < 800; step += 1) {
      const angle = step * 0.35;
      const radius = step * 0.8;
      const cx = W / 2 + radius * Math.cos(angle);
      const cy = H / 2 + radius * Math.sin(angle) * 0.6;
      if (cx - tw / 2 > 2 && cx + tw / 2 < W - 2 && cy - th / 2 > 2 && cy + th / 2 < H - 2 && !overlaps(cx, cy, tw, th)) {
        placed_x = cx;
        placed_y = cy;
        found = true;
        break;
      }
    }

    if (found || i === 0) {
      rects.push({ x: placed_x, y: placed_y, w: tw, h: th });
      placed.push({ text, fs, color: WORD_COLORS[i % WORD_COLORS.length], opacity: 0.65 + ((count - minCount) / range) * 0.35, x: placed_x, y: placed_y, count });
    }
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ minHeight: 140 }}>
      <defs>
        <radialGradient id="wcGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" stopOpacity="0" />
          <stop offset="100%" stopColor="#020617" stopOpacity="0.6" />
        </radialGradient>
      </defs>
      <rect className="command-word-cloud-bg" width={W} height={H} fill="url(#wcGlow)" rx={8} />
      {placed.map((w) => (
        <text key={w.text} x={w.x} y={w.y} textAnchor="middle" dominantBaseline="middle" fontSize={w.fs} fontWeight={w.fs > 26 ? "800" : w.fs > 18 ? "700" : "500"} fill={w.color} opacity={w.opacity} style={{ cursor: "default", fontFamily: "monospace" }}>
          <title>{`${w.text}: ${w.count} occurrences`}</title>
          {w.text}
        </text>
      ))}
    </svg>
  );
};

export default PayloadWordCloud;
