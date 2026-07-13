import React from 'react';
import { TOP_SOURCE_IPS_COLORS, formatDetailedTimestamp } from './utils';

export default function TopSourceIpsCard({ sourceIps }) {
  if (!sourceIps || sourceIps.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No source IP data</div>;
  }

  const peakCount = Math.max(...sourceIps.map((ip) => ip.count), 1);

  return (
    <div className="flex flex-col gap-2.5">
      {sourceIps.map((ip, idx) => {
        const accent = TOP_SOURCE_IPS_COLORS[idx % TOP_SOURCE_IPS_COLORS.length];
        const fillWidth = Math.max(10, Math.round((ip.count / peakCount) * 100));

        return (
          <div key={ip.label} className="rounded-xl border border-slate-800/40 bg-slate-800/30 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black"
                  style={{ backgroundColor: `${accent}1f`, color: accent }}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{ip.label}</div>
                  <div className="text-[11px] text-slate-400">
                    Last seen {formatDetailedTimestamp(ip.lastSeen)}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-black" style={{ color: accent }}>{ip.count}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">events</div>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel-muted-strong">
              <div
                className="h-full rounded-full"
                style={{ width: `${fillWidth}%`, background: accent }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
