import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

const normalizeOption = (option) => {
  const isObject = option && typeof option === "object";
  return {
    value: isObject ? option.value : option,
    label: isObject ? option.label : option,
  };
};

export default function CombinedFilter({
  statusFilter, onStatusChange,
  userFilter, onUserChange, userOptions = [],
  agentFilter, onAgentChange, agentOptions = [],
  sessionFilter, onSessionChange, sessionOptions = [],
  onClearAll,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  const calcPosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownWidth = 280;
    const dropdownHeight = 380;
    const gap = 4;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;

    let top = spaceBelow < dropdownHeight + gap ? rect.top - dropdownHeight - gap : rect.bottom + gap;
    let left = spaceRight < dropdownWidth ? rect.right - dropdownWidth : rect.left;

    if (left < 8) left = 8;
    if (left + dropdownWidth > window.innerWidth - 8) left = window.innerWidth - dropdownWidth - 8;

    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    calcPosition();
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const handleReposition = () => { if (open) calcPosition(); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open, calcPosition]);

  const activeCount = [
    statusFilter !== "all",
    userFilter !== "all",
    agentFilter !== "all",
    sessionFilter !== "all",
  ].filter(Boolean).length;

  const Section = ({ label, value, allLabel, options, onChange }) => (
    <div className="px-3 py-2">
      <div className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => onChange("all")}
          className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
            value === "all"
              ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
              : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"
          }`}
        >
          {allLabel}
        </button>
        {options.map((opt) => {
          const { value: optVal, label: optLabel } = normalizeOption(opt);
          return (
            <button
              key={optVal}
              onClick={() => onChange(optVal)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                value === optVal
                  ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                  : "bg-[var(--soc-elevated)] text-[var(--soc-text-secondary)] border border-transparent hover:border-[var(--soc-border)]"
              }`}
            >
              {optLabel}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((c) => !c)}
        className="flex items-center gap-2 rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-2 pl-3 pr-2.5 text-[11px] text-[var(--soc-text-primary)] focus:outline-none focus:ring-1 focus:ring-orange-500/50 transition-colors hover:bg-[var(--soc-elevated)]"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--soc-text-muted)]" />
        <span className="font-medium">Filters</span>
        {activeCount > 0 && (
          <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-orange-500/20 text-orange-300 text-[9px] font-bold">
            {activeCount}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-[var(--soc-text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="fixed z-[9999] w-[280px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] shadow-2xl"
          style={{ top: coords.top, left: coords.left }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--soc-border)]">
            <span className="text-[10px] font-semibold text-[var(--soc-text-primary)]">Filter Options</span>
            {activeCount > 0 && (
              <button
                onClick={() => {
                  onStatusChange("all");
                  onUserChange("all");
                  onAgentChange("all");
                  onSessionChange("all");
                  if (onClearAll) onClearAll();
                }}
                className="text-[9px] font-semibold text-orange-400 hover:text-orange-300 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="divide-y divide-[var(--soc-border)] max-h-[360px] overflow-y-auto">
            <Section
              label="Status"
              value={statusFilter}
              allLabel="All statuses"
              options={[
                { value: "suspicious", label: "Suspicious" },
                { value: "normal", label: "Normal" },
              ]}
              onChange={onStatusChange}
            />
            <Section
              label="User"
              value={userFilter}
              allLabel="All users"
              options={userOptions}
              onChange={onUserChange}
            />
            <Section
              label="Agent"
              value={agentFilter}
              allLabel="All agents"
              options={agentOptions}
              onChange={onAgentChange}
            />
            <Section
              label="Session"
              value={sessionFilter}
              allLabel="All sessions"
              options={sessionOptions}
              onChange={onSessionChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
