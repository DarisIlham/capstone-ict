import React from "react";
import { getDateRangeError } from "../utils/dateRange";

export default function DateRangeFilter({
  value,
  onChange,
  disabled = false,
  className = "",
}) {
  const error = getDateRangeError(value);

  const updateField = (field, nextValue) => {
    const nextRange = {
      start: value?.start || "",
      end: value?.end || "",
      [field]: nextValue,
    };

    const startTime = new Date(nextRange.start).getTime();
    const endTime = new Date(nextRange.end).getTime();

    if (Number.isFinite(startTime) && Number.isFinite(endTime) && startTime > endTime) {
      if (field === "start") {
        nextRange.end = nextValue;
      } else {
        nextRange.start = nextValue;
      }
    }

    onChange(nextRange);
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex max-w-full items-center overflow-x-auto bg-[var(--soc-card)] rounded-lg p-0.5 border border-[var(--soc-border)]" style={{ scrollbarWidth: "none" }}>
        <label className="flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2 text-[9px] sm:text-[11px] text-slate-400 whitespace-nowrap">
          <span>From</span>
          <input
            type="datetime-local"
            value={value?.start || ""}
            max={value?.end || undefined}
            disabled={disabled}
            onChange={(event) => updateField("start", event.target.value)}
            className="rounded-md bg-transparent px-1 py-0.5 sm:py-1.5 text-[9px] sm:text-[11px] text-slate-300 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            style={{ maxWidth: "100%" }}
          />
        </label>
        <span className="text-[9px] sm:text-[11px] text-slate-600 select-none">-</span>
        <label className="flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2 text-[9px] sm:text-[11px] text-slate-400 whitespace-nowrap">
          <span>To</span>
          <input
            type="datetime-local"
            value={value?.end || ""}
            min={value?.start || undefined}
            disabled={disabled}
            onChange={(event) => updateField("end", event.target.value)}
            className="rounded-md bg-transparent px-1 py-0.5 sm:py-1.5 text-[9px] sm:text-[11px] text-slate-300 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            style={{ maxWidth: "100%" }}
          />
        </label>
      </div>
      {error && <div className="w-full text-[11px] text-red-300">{error}</div>}
    </div>
  );
}
