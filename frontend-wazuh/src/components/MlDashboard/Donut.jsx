import React from "react";

export function Donut({ items, size = 120, stroke = 12, centerLabelTop, centerLabelBottom }) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

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
        <text y={-3} textAnchor="middle" fontSize="11" fill="var(--chart-label-strong)" fontWeight="700">
          {centerLabelTop}
        </text>
        <text y={10} textAnchor="middle" fontSize="8" fill="var(--chart-label)">
          {centerLabelBottom}
        </text>
      </g>
    </svg>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: item.color }} />
          <span className="max-w-[160px] break-all leading-snug" title={item.label}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default Donut;
