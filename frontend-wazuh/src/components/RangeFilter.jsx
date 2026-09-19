import React from "react";
import { Clock, ChevronDown } from "lucide-react";

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
    <div className={`soc-range-filter flex min-w-0 shrink-0 items-center ${className}`}>
      <div
        className={`flex items-center gap-1 rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-2 h-8 ${
          dimmed ? "opacity-50" : ""
        }`}
      >
        <Clock className="h-3 w-3 text-purple-400 shrink-0" />
        <div className="flex items-center gap-0.5">
          {options.map((opt) => {
            const value = optionValue(opt);
            const label = optionLabel(opt);
            const active = rangeKey === value;
            return (
              <button
                key={value}
                onClick={() => onRangeChange(value)}
                className={`rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
                  active
                    ? "bg-purple-500/15 text-purple-400"
                    : "text-[var(--soc-text-muted)] hover:text-[var(--soc-text-primary)] hover:bg-[var(--soc-elevated)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
