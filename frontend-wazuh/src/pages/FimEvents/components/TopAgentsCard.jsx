import React from "react";
import { formatDetailedTimestamp } from "../utils";

const TOP_AGENT_COLORS = ["#34d399", "#38bdf8", "#fbbf24", "#f97316", "#a78bfa"];

const TopAgentsCard = ({ agents }) => {
  if (!agents || agents.length === 0) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-600">No agent data</div>;
  }

  const peakCount = Math.max(...agents.map((agent) => agent.count), 1);

  return (
    <div className="flex flex-col gap-2.5">
      {agents.map((agent, idx) => {
        const accent = TOP_AGENT_COLORS[idx % TOP_AGENT_COLORS.length];
        const fillWidth = Math.max(10, Math.round((agent.count / peakCount) * 100));

        return (
          <div key={agent.name} className="rounded-xl border border-slate-700/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black"
                  style={{ backgroundColor: `${accent}1f`, color: accent }}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-100">{agent.name}</div>
                  <div className="text-[11px] text-slate-500">Last seen {formatDetailedTimestamp(agent.lastSeen)}</div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-black" style={{ color: accent }}>{agent.count}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">events</div>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full" style={{ width: `${fillWidth}%`, background: accent }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TopAgentsCard;
