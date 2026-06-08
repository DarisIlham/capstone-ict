import React, { useState } from "react";
import { clamp, formatBucketLabel, formatTimelineBucketLabel } from "./utils";

export default function WaveChart({ data, width = 1000, height = 320, rangeKey, onPointSelect, activePointKey }) {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const maxV = Math.max(1, ...data.map((d) => d.v));
  const padding = { l: 28, r: 10, t: 8, b: 36 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;
  const pointSpacing = data.length > 1 ? innerW / (data.length - 1) : 0;

  const gridLines = [];
  const seenValues = new Set();
  const gridSteps = 5;
  for (let i = 0; i < gridSteps; i++) {
    const ratio = i / (gridSteps - 1);
    let value = Math.round(ratio * maxV);
    if (seenValues.has(value)) {
      let offset = 1;
      while (seenValues.has(value + offset) && offset <= maxV) offset++;
      if (offset <= maxV) value = value + offset; else continue;
    }
    seenValues.add(value);
    const y = padding.t + innerH - ratio * innerH;
    gridLines.push({ value, y, ratio });
  }

  let pathD = "";
  for (let i = 0; i < data.length; i++) {
    const x = padding.l + i * pointSpacing;
    const y = padding.t + innerH - (data[i].v / maxV) * innerH;
    if (i === 0) pathD += `M ${x} ${y}`;
    else {
      const prevX = padding.l + (i - 1) * pointSpacing;
      const prevY = padding.t + innerH - (data[i - 1].v / maxV) * innerH;
      const controlX = (prevX + x) / 2;
      const controlY1 = prevY;
      const controlY2 = y;
      pathD += ` C ${controlX} ${controlY1}, ${controlX} ${controlY2}, ${x} ${y}`;
    }
  }

  const tickCount = clamp(Math.floor(innerW / 160), 3, 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));

  return (
    <div className="relative w-full overflow-visible" onMouseLeave={() => setSelectedPoint(null)}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block overflow-visible">
        {gridLines.map((grid, idx) => (
          <g key={`grid-${idx}`}>
            <line
              x1={padding.l}
              y1={grid.y}
              x2={padding.l + innerW}
              y2={grid.y}
              stroke="var(--chart-grid)"
              strokeWidth="1"
              opacity={grid.ratio === 0 || grid.ratio === 1 ? "1" : "0.5"}
            />
            <text
              x={padding.l - 5}
              y={grid.y + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--chart-label)"
              fontWeight="600"
            >
              {grid.value}
            </text>
          </g>
        ))}

        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="var(--chart-axis)" strokeWidth="1.5" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="var(--chart-axis)" strokeWidth="1.5" />

        <path d={pathD} stroke="#a78bfa" strokeWidth="2.5" fill="none" opacity="0.8" />

        <defs>
          <linearGradient id="waveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={pathD + ` L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`} fill="url(#waveGradient)" />

        {data.map((d, i) => {
          const x = padding.l + i * pointSpacing;
          const y = padding.t + innerH - (d.v / maxV) * innerH;
          const pointKey = d.key || d.start || d.time || d.t || `point-${i}`;
          const isSelected = selectedPoint?.index === i;
          const isActive = activePointKey === pointKey;
          const pointData = { index: i, key: pointKey, x, y, value: d.v, t: d.t, time: d.time || d.start || d.t, start: d.start || d.time || d.t, end: d.end || d.time || d.t, bucketMs: d.bucketMs };
          return (
            <g key={pointKey}>
              {isActive && (
                <circle cx={x} cy={y} r="7.5" fill="transparent" stroke="#a78bfa" strokeWidth="1.5" opacity="0.85" className="pointer-events-none" />
              )}
              <circle
                cx={x}
                cy={y}
                r="10"
                fill="transparent"
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`Select prediction data`}
                onClick={() => onPointSelect?.(pointData)}
                onMouseEnter={() => setSelectedPoint(pointData)}
                onMouseLeave={() => setSelectedPoint(null)}
                onFocus={() => setSelectedPoint(pointData)}
                onBlur={() => setSelectedPoint(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPointSelect?.(pointData);
                  }
                }}
              />
              <circle
                cx={x}
                cy={y}
                r={isActive ? "5" : isSelected ? "5" : "3.5"}
                fill="#a78bfa"
                stroke="var(--chart-point-stroke)"
                strokeWidth="1.5"
                opacity="0.95"
                className="pointer-events-none"
              />
            </g>
          );
        })}

        {data.map((d, i) => {
          if (i !== data.length - 1 && i % tickEvery !== 0) return null;
          const x = padding.l + i * pointSpacing;
          const tickKey = d.key || d.start || d.time || d.t || i;
          return (
            <g key={`tick-${tickKey}`}>
              <line x1={x} y1={padding.t + innerH} x2={x} y2={padding.t + innerH + 4} stroke="var(--chart-axis)" />
              <text
                x={x}
                y={padding.t + innerH + 16}
                textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                fontSize="8"
                fill="var(--chart-label)"
              >
                {formatBucketLabel(d.t, rangeKey)}
              </text>
            </g>
          );
        })}
      </svg>

      {selectedPoint && (
        <div
          className="app-tooltip pointer-events-none absolute z-10 min-w-[160px]"
          style={{ left: `${Math.min(Math.max((selectedPoint.x / width) * 100, 10), 82)}%`, top: `${Math.max(((selectedPoint.y - 48) / height) * 100, 4)}%`, transform: "translate(-50%, -100%)" }}
        >
          <div className="font-semibold text-popover-foreground">{selectedPoint.value} predictions</div>
          <div className="mt-1 text-muted-foreground">{formatTimelineBucketLabel(selectedPoint, rangeKey)}</div>
        </div>
      )}
    </div>
  );
}
