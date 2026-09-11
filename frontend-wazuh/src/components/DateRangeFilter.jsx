import React from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { getDateRangeError } from "../utils/dateRange";

const shortDate = (dt) =>
  dt
    ? new Date(dt).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit",
      })
    : "--";

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
    <div className={`soc-date-filter flex min-w-0 flex-col gap-1 ${className}`}>
      <div className="soc-date-field-row hidden h-7 min-w-0 shrink items-center rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] p-0.5 min-[640px]:inline-flex min-[900px]:h-8">
        <label className="flex min-w-0 shrink items-center gap-1 px-1 text-[9px] text-slate-400 whitespace-nowrap min-[700px]:text-[10px] min-[900px]:gap-1.5 min-[900px]:text-[11px]">
          <span>From</span>
          <input
            type="datetime-local"
            value={value?.start || ""}
            max={value?.end || undefined}
            disabled={disabled}
            onChange={(event) => updateField("start", event.target.value)}
            className="soc-date-time-input w-fit min-w-0 shrink rounded-md bg-transparent px-0.5 py-0.5 text-[9px] text-slate-300 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 min-[700px]:text-[10px] min-[900px]:py-1 min-[900px]:text-[11px]"
          />
        </label>
        <span className="shrink-0 px-0.5 text-[9px] text-slate-600 select-none min-[700px]:text-[10px] min-[900px]:text-[11px]">-</span>
        <label className="flex min-w-0 shrink items-center gap-1 px-1 text-[9px] text-slate-400 whitespace-nowrap min-[700px]:text-[10px] min-[900px]:gap-1.5 min-[900px]:text-[11px]">
          <span>To</span>
          <input
            type="datetime-local"
            value={value?.end || ""}
            min={value?.start || undefined}
            disabled={disabled}
            onChange={(event) => updateField("end", event.target.value)}
            className="soc-date-time-input w-fit min-w-0 shrink rounded-md bg-transparent px-0.5 py-0.5 text-[9px] text-slate-300 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 min-[700px]:text-[10px] min-[900px]:py-1 min-[900px]:text-[11px]"
          />
        </label>
      </div>

      <details className="soc-date-compact group relative min-[640px]:hidden">
        <summary className="flex h-6 cursor-pointer list-none items-center gap-1 rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-1.5 text-[9px] font-medium text-[var(--soc-text-primary)] whitespace-nowrap select-none">
          <CalendarDays className="h-2.5 w-2.5 text-slate-500" />
          <span>
            {shortDate(value?.start)} - {shortDate(value?.end)}
          </span>
          <ChevronDown className="h-2 w-2 text-slate-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="absolute right-0 top-full z-40 mt-1 flex w-max max-w-[92vw] flex-col items-stretch gap-1 rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] p-1.5 shadow-xl">
          <label className="flex h-[22px] items-center gap-1 text-[8px] text-slate-400 whitespace-nowrap">
            <span>From</span>
            <input
              type="datetime-local"
              value={value?.start || ""}
              max={value?.end || undefined}
              disabled={disabled}
              onChange={(event) => updateField("start", event.target.value)}
              className="soc-date-time-input soc-date-time-input--from w-fit rounded-md bg-transparent px-0.5 py-0.5 text-[8px] text-slate-300 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
          <label className="flex h-[22px] items-center gap-1 text-[8px] text-slate-400 whitespace-nowrap">
            <span>To</span>
            <input
              type="datetime-local"
              value={value?.end || ""}
              min={value?.start || undefined}
              disabled={disabled}
              onChange={(event) => updateField("end", event.target.value)}
              className="soc-date-time-input soc-date-time-input--to w-fit rounded-md bg-transparent px-0.5 py-0.5 text-[8px] text-slate-300 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
        </div>
      </details>

      {error && <div className="w-full text-[11px] text-red-300">{error}</div>}
    </div>
  );
}

