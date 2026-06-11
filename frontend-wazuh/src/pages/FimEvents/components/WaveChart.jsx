import React, { useState } from "react";
import { clamp, formatBucketLabel, formatDetailedTimestamp } from "../utils";

const WaveChart = ({ data, color = "#10b981", height = 80, rangeKey, compact = false, activePointKey = null, onPointSelect = null }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const width = 800;
  const padding = { l: 28, r: 10, t: 8, b: 24 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;

  if (!data || data.length === 0) {
    return (
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="12" fill="#64748b">No data</text>
      </svg>
    );
  }

  const maxV = Math.max(1, ...data.map((d) => d.v));
  const pointSpacing = data.length ? innerW / (data.length - 1) : innerW;
  const defaultBucketMs = rangeKey === "1h" ? 300000 : rangeKey === "24h" ? 3600000 : rangeKey === "7d" ? 21600000 : 86400000;

  const gridSteps = 5;
  const gridLines = [];
  for (let i = 0; i < gridSteps; i += 1) {
    const ratio = i / (gridSteps - 1);
    const value = Math.round(ratio * maxV);
    const y = padding.t + innerH - ratio * innerH;
    gridLines.push({ value, y, ratio });
  }

  let pathD = "";
  for (let i = 0; i < data.length; i += 1) {
    const x = padding.l + i * pointSpacing;
    const y = padding.t + innerH - (data[i].v / maxV) * innerH;
    if (i === 0) {
      pathD += `M ${x} ${y}`;
    } else {
      const prevX = padding.l + (i - 1) * pointSpacing;
      const prevY = padding.t + innerH - (data[i - 1].v / maxV) * innerH;
      const controlX = (prevX + x) / 2;
      pathD += ` C ${controlX} ${prevY}, ${controlX} ${y}, ${x} ${y}`;
    }
  }

  const tickCount = clamp(Math.floor(innerW / (compact ? 260 : 160)), compact ? 2 : 3, compact ? 4 : 7);
  const tickEvery = Math.max(1, Math.floor(data.length / tickCount));

  return (
    <div className="relative" onMouseLeave={() => setSelectedPoint(null)}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block">
        {gridLines.map((gl) => (
          <g key={`grid-${gl.ratio}`}>
            <line x1={padding.l} y1={gl.y} x2={padding.l + innerW} y2={gl.y} stroke="#334155" strokeDasharray="2,2" opacity="0.5" />
            <text x={padding.l - 5} y={gl.y + 3} textAnchor="end" fontSize="8" fill="#64748b">{gl.value}</text>
          </g>
        ))}
        <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t + innerH} stroke="#334155" />
        <line x1={padding.l} y1={padding.t + innerH} x2={padding.l + innerW} y2={padding.t + innerH} stroke="#334155" />
        <path d={pathD} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <defs>
          <linearGradient id="fimWaveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.24" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${pathD} L ${padding.l + (data.length - 1) * pointSpacing} ${padding.t + innerH} L ${padding.l} ${padding.t + innerH} Z`} fill="url(#fimWaveGradient)" />
        {data.map((d, i) => {
          const x = padding.l + i * pointSpacing;
          const y = padding.t + innerH - (d.v / maxV) * innerH;
          const pointKey = String(d.t);
          const bucketMsForPoint = d.bucketMs || defaultBucketMs;
          const pointData = {
            index: i,
            x,
            y,
            key: pointKey,
            value: d.v,
            time: d.t,
            start: new Date(Number(d.t)).toISOString(),
            end: new Date(Number(d.t) + bucketMsForPoint - 1).toISOString(),
            bucketMs: bucketMsForPoint,
          };

          const isHovered = selectedPoint?.index === i;
          const isActive = activePointKey !== null && String(activePointKey) === pointKey;
          const isHighlighted = isHovered || isActive;

          return (
            <g key={`point-${pointKey}`}>
              {isActive && (
                <circle
                  cx={x}
                  cy={y}
                  r="7.5"
                  fill="transparent"
                  stroke="#34d399"
                  strokeWidth="1.5"
                  opacity="0.85"
                  className="pointer-events-none"
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={isHighlighted ? "7" : "10"}
                fill="transparent"
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`Filter events for ${formatDetailedTimestamp(pointData.start)}`}
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
                r={isHighlighted ? "5" : "3.5"}
                fill={isActive ? "#34d399" : color}
                stroke="#0f172a"
                strokeWidth="1.5"
                opacity="0.95"
                className="pointer-events-none"
              />
            </g>
          );
        })}
        {data.map((d, i) => {
          if (i % tickEvery !== 0) return null;
          const x = padding.l + i * pointSpacing;
          return (
            <g key={`tick-${d.t}`}>
              <line x1={x} y1={padding.t + innerH} x2={x} y2={padding.t + innerH + 3} stroke="#334155" />
              <text
                x={x}
                y={padding.t + innerH + 14}
                textAnchor={i === 0 ? "start" : i >= data.length - tickEvery ? "end" : "middle"}
                fontSize="8"
                fill="#64748b"
              >
                {formatBucketLabel(d.t, rangeKey)}
              </text>
            </g>
          );
        })}
      </svg>

      {selectedPoint && (
        <div
          className="pointer-events-none absolute z-10 min-w-[120px] max-w-[220px] rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${Math.min(Math.max((selectedPoint.x / width) * 100, 10), 82)}%`,
            top: `${Math.max(((selectedPoint.y - 40) / height) * 100, 6)}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="font-semibold text-white">{selectedPoint.value} events</div>
          <div className="mt-1 text-slate-400">{formatDetailedTimestamp(selectedPoint.time)}</div>
        </div>
      )}
    </div>
  );
};

export default WaveChart;
