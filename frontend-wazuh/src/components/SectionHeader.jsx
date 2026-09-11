export default function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  actionLabel,
  onAction,
  className = "",
}) {
  return (
    <div className={`flex items-center justify-between gap-4 ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700/50 shrink-0">
            <Icon className="h-4 w-4 text-slate-400" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white truncate">{title}</h2>
          {subtitle && (
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {action && (
        <div className="shrink-0">{action}</div>
      )}
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          className="shrink-0 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/80 border border-slate-700/50 rounded-lg hover:bg-slate-700/80 hover:text-white transition-colors flex items-center gap-1.5"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

