import React from "react";

export function Donut({ items, size = 120, stroke = 12, centerLabelTop, centerLabelBottom, centerFontTop, centerFontBottom }) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const fontTop = centerFontTop ?? Math.max(11, Math.round(size * 0.09));
  const fontBottom = centerFontBottom ?? Math.max(8, Math.round(size * 0.06));
  const topY = -Math.round(fontTop / 2);
  const bottomY = Math.round(fontBottom * 1.1);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${size / 2} ${size / 2})`}>
        <circle r={r} fill="transparent" stroke="var(--chart-grid)" strokeWidth={stroke} />
        {items.map((item, index) => {
          const currentOffset = items
            .slice(0, index)
            .reduce((acc, previous) => acc + (previous.value / total) * c, 0);
          const dash = (item.value / total) * c;
          const strokeDashoffset = -currentOffset;

          return (
            <circle
              key={item.label}
              r={r}
              fill="transparent"
              stroke={item.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90)"
              strokeLinecap="butt"
            >
              <title>{`${item.label}: ${item.value}`}</title>
            </circle>
          );
        })}
        <text y={topY} textAnchor="middle" fontSize={fontTop} fill="var(--chart-label-strong)" fontWeight="700">
          {centerLabelTop}
        </text>
        <text y={bottomY} textAnchor="middle" fontSize={fontBottom} fill="var(--chart-label)">
          {centerLabelBottom}
        </text>
      </g>
    </svg>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-row flex-wrap gap-3 items-center justify-center text-xs">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: item.color }} />
          <span className="truncate max-w-[160px] leading-snug" title={item.label}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default Donut;
