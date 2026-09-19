import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const ACCENT_STYLES = {
  orange: {
    focusRing: "focus:ring-orange-500/50",
    selected: "bg-orange-500/15 text-orange-300",
  },
  emerald: {
    focusRing: "focus:ring-emerald-500/50",
    selected: "bg-emerald-500/15 text-emerald-300",
  },
  red: {
    focusRing: "focus:ring-red-500/50",
    selected: "bg-red-500/15 text-red-300",
  },
  sky: {
    focusRing: "focus:ring-sky-500/50",
    selected: "bg-sky-500/15 text-sky-300",
  },
  violet: {
    focusRing: "focus:ring-violet-500/50",
    selected: "bg-violet-500/15 text-violet-300",
  },
};

export default function FilterSelect({
  value,
  onChange,
  options = [],
  allLabel,
  accent = "orange",
  borderless = false,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const accentStyle = ACCENT_STYLES[accent] || ACCENT_STYLES.orange;

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectOption = (option) => {
    setOpen(false);
    onChange(option);
  };

  const normalizeOption = (option) => {
    const isObject = option && typeof option === "object";
    return {
      value: isObject ? option.value : option,
      label: isObject ? option.label : option,
    };
  };

  const selectedLabel =
    value === "all"
      ? allLabel
      : (options
          .map(normalizeOption)
          .find((option) => option.value === value) || { label: String(value) }).label;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2 appearance-none ${borderless ? "rounded-none" : "rounded-lg border border-[var(--soc-border)]"} bg-[var(--soc-card)] py-2 pl-3 pr-2 text-[11px] text-slate-100 focus:outline-none focus:ring-1 ${accentStyle.focusRing}`}
      >
        <span className="max-w-[140px] truncate">{selectedLabel}</span>
        <ChevronDown className="pointer-events-none h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 min-w-[180px] max-w-[280px] rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] py-1 shadow-xl"
        >
          <button
            type="button"
            role="option"
            aria-selected={value === "all"}
            onClick={() => selectOption("all")}
            className={`block w-full truncate px-3 py-1.5 text-left text-[11px] transition-colors ${value === "all"
                ? accentStyle.selected
                : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              }`}
          >
            {allLabel}
          </button>
          <div className="max-h-[240px] overflow-y-auto">
            {options.map((option) => {
              const { value: optionValue, label: optionLabel } = normalizeOption(option);
              return (
                <button
                  key={optionValue}
                  type="button"
                  role="option"
                  aria-selected={value === optionValue}
                  title={optionLabel}
                  onClick={() => selectOption(optionValue)}
                  className={`block w-full truncate px-3 py-1.5 text-left text-[11px] transition-colors ${value === optionValue
                      ? accentStyle.selected
                      : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                    }`}
                >
                  {optionLabel}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}