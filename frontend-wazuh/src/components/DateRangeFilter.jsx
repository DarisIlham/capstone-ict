import React, { useState, useRef, useEffect } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";

const shortDate = (dt) =>
  dt
    ? new Date(dt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "--";

export default function DateRangeFilter({ value, onChange, disabled = false, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayLabel = `${shortDate(value?.start)} - ${shortDate(value?.end)}`;

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-8 px-2 min-[420px]:px-3 rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] text-[9px] min-[420px]:text-[10px] font-medium text-[var(--soc-text-primary)] hover:border-purple-500/40 hover:bg-[var(--soc-elevated)] transition-all disabled:opacity-50"
      >
        <CalendarDays className="h-3 w-3 text-[var(--soc-accent)] theme-light:text-slate-800 shrink-0" />
        <span className="truncate max-w-[72px] min-[420px]:max-w-[120px]">{displayLabel}</span>
        <ChevronDown className={`h-3 w-3 text-[var(--soc-text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-[100] w-56 rounded-xl border border-[var(--soc-border)] shadow-2xl overflow-hidden bg-[var(--soc-elevated)]">
          <div className="p-3 space-y-3 bg-[var(--soc-elevated)]">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--soc-text-muted)] w-8">From</span>
              <input
                type="datetime-local"
                value={value?.start || ""}
                max={value?.end || undefined}
                disabled={disabled}
                onChange={(e) => {
                  const next = { start: e.target.value, end: value?.end || "" };
                  if (new Date(next.start) > new Date(next.end)) next.end = next.start;
                  onChange(next);
                }}
                className="soc-date-time-input soc-date-time-input--from flex-1 text-[10px] rounded-md border border-[var(--soc-border)] px-2 py-1.5 bg-[var(--soc-card)] text-[var(--soc-text-primary)] focus:border-purple-500/50 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--soc-text-muted)] w-8">To</span>
              <input
                type="datetime-local"
                value={value?.end || ""}
                min={value?.start || undefined}
                disabled={disabled}
                onChange={(e) => {
                  const next = { start: value?.start || "", end: e.target.value };
                  if (new Date(next.start) > new Date(next.end)) next.start = next.end;
                  onChange(next);
                }}
                className="soc-date-time-input soc-date-time-input--to flex-1 text-[10px] rounded-md border border-[var(--soc-border)] px-2 py-1.5 bg-[var(--soc-card)] text-[var(--soc-text-primary)] focus:border-purple-500/50 focus:outline-none"
              />
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-full py-1.5 text-[10px] font-medium rounded-lg text-purple-400 hover:bg-purple-500/20 transition-colors" style={{ backgroundColor: "rgba(139, 92, 246, 0.15)" }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
