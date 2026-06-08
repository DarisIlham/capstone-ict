import React from "react";

const Legend = ({ items }) => (
  <div className="flex flex-col gap-1.5 w-full min-w-0">
    {items.map((it) => (
      <div key={it.label} className="flex items-center gap-0.5 text-xs text-slate-400">
        <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: it.color }} />
        <span className="truncate min-w-0 max-w-40">{it.label}</span>
        <span className="text-slate-500 tabular-nums shrink-0">{it.value}</span>
      </div>
    ))}
  </div>
);

export default Legend;
