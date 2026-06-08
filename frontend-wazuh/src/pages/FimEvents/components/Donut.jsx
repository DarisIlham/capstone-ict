import React from "react";

const Donut = ({ items, size = 140, stroke = 14, centerLabelTop, centerLabelBottom, compact = false }) => {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <g transform={`translate(${size / 2} ${size / 2})`}>
        <circle r={r} fill="transparent" stroke="#1e293b" strokeWidth={stroke} />
        {items.map((it, idx) => {
          const currentOffset = items.slice(0, idx).reduce((acc, prev) => acc + (prev.value / total) * c, 0);
          const dash = (it.value / total) * c;
          const strokeDashoffset = -currentOffset;
          return (
            <circle
              key={it.label}
              r={r}
              fill="transparent"
              stroke={it.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90)"
              strokeLinecap="butt"
            >
              <title>{`${it.label}: ${it.value}`}</title>
            </circle>
          );
        })}
        <text y={compact ? -1 : -3} textAnchor="middle" fontSize={compact ? "10" : "12"} fill="#f1f5f9" fontWeight="700">{centerLabelTop}</text>
        <text y={compact ? 10 : 11} textAnchor="middle" fontSize={compact ? "7" : "8"} fill="#64748b">{centerLabelBottom}</text>
      </g>
    </svg>
  );
};

export default Donut;
