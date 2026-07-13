import React from "react";

const Legend = ({ items }) => (
  <div className="flex flex-row flex-wrap gap-x-4 gap-y-2 w-full justify-center">
    {items.map((it) => (
      <div key={it.label} className="flex items-center gap-1.5 text-base text-slate-400">
        <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: it.color }} />
        <span>{it.label}</span>
        <span className="text-slate-500 tabular-nums shrink-0">{it.value}</span>
      </div>
    ))}
  </div>
);

export default Legend;
