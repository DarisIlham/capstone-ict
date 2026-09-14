import React from "react";
import { ChevronDown } from "lucide-react";

const DEFAULT_OPTIONS = [
  { label: "1h", value: "1h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
];

const optionValue = (opt) => (typeof opt === "string" ? opt : opt.value);
const optionLabel = (opt) => (typeof opt === "string" ? opt : opt.label);

export default function RangeFilter({
  rangeKey,
  onRangeChange,
  dimmed = false,
  options = DEFAULT_OPTIONS,
  className = "",
}) {
  return (
    <div className="soc-range-filter flex min-w-0 shrink-0 items-center">
      <div
        className={`hidden min-[640px]:flex min-h-0 items-center gap-0.5 rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] p-0.5 ${
          dimmed ? "opacity-50" : ""
        } ${className}`}
      >
        {options.map((opt) => {
          const value = optionValue(opt);
          const label = optionLabel(opt);
          const active = rangeKey === value;
          return (
            <button
              key={value}
              onClick={() => onRangeChange(value)}
              className={`rounded-md border border-transparent px-1.5 py-1 text-[9px] font-medium leading-none whitespace-nowrap transition-colors min-[700px]:px-2 min-[700px]:text-[10px] min-[900px]:px-2.5 min-[900px]:py-1 min-[900px]:text-[11px] ${
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
      <div
        className={`soc-range-compact relative flex h-6 items-center rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-1.5 min-[640px]:hidden ${
          dimmed ? "opacity-50" : ""
        } ${className}`}
      >
        <select
          value={rangeKey}
          onChange={(event) => onRangeChange(event.target.value)}
          aria-label="Time range"
          className="cursor-pointer appearance-none bg-transparent pr-3.5 text-[9px] font-medium text-[var(--soc-text-primary)] outline-none"
        >
          {options.map((opt) => (
            <option key={optionValue(opt)} value={optionValue(opt)}>
              {optionLabel(opt)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1 h-3 w-3 text-slate-500" />
      </div>
    </div>
  );
}

