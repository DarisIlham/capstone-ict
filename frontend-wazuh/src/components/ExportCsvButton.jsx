import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

const ACCENT_STYLES = {
  orange: {
    ring: "focus:ring-orange-500/50",
    idle: "hover:border-orange-500/40 hover:text-orange-300",
    label: "text-orange-300",
  },
  emerald: {
    ring: "focus:ring-emerald-500/50",
    idle: "hover:border-emerald-500/40 hover:text-emerald-300",
    label: "text-emerald-300",
  },
  red: {
    ring: "focus:ring-red-500/50",
    idle: "hover:border-red-500/40 hover:text-red-300",
    label: "text-red-300",
  },
  sky: {
    ring: "focus:ring-sky-500/50",
    idle: "hover:border-sky-500/40 hover:text-sky-300",
    label: "text-sky-300",
  },
  violet: {
    ring: "focus:ring-violet-500/50",
    idle: "hover:border-violet-500/40 hover:text-violet-300",
    label: "text-violet-300",
  },
};

export default function ExportCsvButton({
  onClick,
  accent = "sky",
  label = "Export CSV",
  disabled = false,
  className = "",
}) {
  const [exporting, setExporting] = useState(false);
  const style = ACCENT_STYLES[accent] || ACCENT_STYLES.sky;

  const handleClick = async () => {
    if (exporting || disabled) return;
    setExporting(true);
    try {
      await onClick();
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={exporting || disabled}
      title="Export data pada periode tanggal yang dipilih (CSV)"
      className={`flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--soc-border)] bg-[var(--soc-card)] px-2.5 py-2 text-[11px] font-medium text-slate-300 transition-colors focus:outline-none focus:ring-1 ${style.ring} ${
        exporting ? "opacity-60 cursor-wait" : style.idle
      } ${className}`}
    >
      {exporting ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : (
        <Download className={`h-3.5 w-3.5 shrink-0 ${style.label}`} />
      )}
      <span>{exporting ? "Exporting\u2026" : label}</span>
    </button>
  );
}