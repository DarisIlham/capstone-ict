import React from "react";

const Donut = ({ items, size = 140, stroke = 14, centerLabelTop, centerLabelBottom, centerFontTop, centerFontBottom, compact = false }) => {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const fontTop = centerFontTop ?? (compact ? 10 : Math.max(11, Math.round(size * 0.09)));
  const fontBottom = centerFontBottom ?? (compact ? 7 : Math.max(8, Math.round(size * 0.06)));
  const topY = compact ? -1 : -Math.round(fontTop / 2);
  const bottomY = compact ? 10 : Math.round(fontBottom * 1.1);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <g transform={`translate(${size / 2} ${size / 2})`}>
        <circle r={r} fill="transparent" stroke="#1e293b" strokeWidth={stroke} />
        {items.map((it, idx) => {
          const currentOffset = items.slice(0, idx).reduce((acc, prev) => acc + (prev.value / total) * c, 0);
          const dash = (it.value / total) * c;
          return (
            <circle
              key={it.label}
              r={r}
              fill="transparent"
              stroke={it.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-currentOffset}
              transform="rotate(-90)"
              strokeLinecap="butt"
            >
              <title>{`${it.label}: ${it.value}`}</title>
            </circle>
          );
        })}
        <text y={topY} textAnchor="middle" fontSize={fontTop} fill="#f1f5f9" fontWeight="700">
          {centerLabelTop}
        </text>
        <text y={bottomY} textAnchor="middle" fontSize={fontBottom} fill="#64748b">
          {centerLabelBottom}
        </text>
      </g>
    </svg>
  );
};

export default Donut;
