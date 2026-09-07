const SEVERITY_CONFIG = {
  critical: {
    label: "Critical",
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/30",
    dot: "bg-red-400",
  },
  high: {
    label: "High",
    bg: "bg-orange-500/15",
    text: "text-orange-400",
    border: "border-orange-500/30",
    dot: "bg-orange-400",
  },
  medium: {
    label: "Medium",
    bg: "bg-yellow-500/15",
    text: "text-yellow-400",
    border: "border-yellow-500/30",
    dot: "bg-yellow-400",
  },
  warning: {
    label: "Warning",
    bg: "bg-yellow-500/15",
    text: "text-yellow-400",
    border: "border-yellow-500/30",
    dot: "bg-yellow-400",
  },
  low: {
    label: "Low",
    bg: "bg-emerald-500/15",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  info: {
    label: "Info",
    bg: "bg-sky-500/15",
    text: "text-sky-400",
    border: "border-sky-500/30",
    dot: "bg-sky-400",
  },
  success: {
    label: "Success",
    bg: "bg-emerald-500/15",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  error: {
    label: "Error",
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/30",
    dot: "bg-red-400",
  },
  suspicious: {
    label: "Suspicious",
    bg: "bg-orange-500/15",
    text: "text-orange-400",
    border: "border-orange-500/30",
    dot: "bg-orange-400",
  },
  normal: {
    label: "Normal",
    bg: "bg-slate-500/15",
    text: "text-slate-400",
    border: "border-slate-500/30",
    dot: "bg-slate-400",
  },
};

export default function SeverityBadge({ severity, size = "sm", showDot = true, className = "" }) {
  const key = String(severity || "").toLowerCase();
  const config = SEVERITY_CONFIG[key] || SEVERITY_CONFIG.normal;

  const sizeClasses = {
    xs: "px-1.5 py-0.5 text-[10px] gap-1",
    sm: "px-2 py-0.5 text-xs gap-1.5",
    md: "px-2.5 py-1 text-xs gap-1.5",
  };

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClasses[size] || sizeClasses.sm} ${className}`}
    >
      {showDot && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
      )}
      {config.label}
    </span>
  );
}
