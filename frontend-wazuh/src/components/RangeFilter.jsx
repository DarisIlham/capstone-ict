import React from "react";

const DEFAULT_OPTIONS = [
  { label: "1h", value: "1h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
];

export default function RangeFilter({
  rangeKey,
  onRangeChange,
  dimmed = false,
  options = DEFAULT_OPTIONS,
  className = "",
}) {
  return (
    <div className="flex max-w-full items-center overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <div
        className={`flex bg-[var(--soc-card)] rounded-lg p-0.5 border border-[var(--soc-border)] ${
          dimmed ? "opacity-50" : ""
        } ${className}`}
      >
        {options.map((opt) => {
          const value = typeof opt === "string" ? opt : opt.value;
          const label = typeof opt === "string" ? opt : opt.label;
          const active = rangeKey === value;
          return (
            <button
              key={value}
              onClick={() => onRangeChange(value)}
              className={`px-1.5 sm:px-2.5 py-0.5 sm:py-1.5 text-[9px] sm:text-[11px] rounded-md font-medium whitespace-nowrap transition-colors ${
                active
                  ? "bg-sky-600/20 text-sky-400 border border-sky-600/30"
                  : "text-slate-500 hover:text-slate-300 border border-transparent"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
