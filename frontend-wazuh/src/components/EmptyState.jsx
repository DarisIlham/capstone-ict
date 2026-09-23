import { AlertTriangle, Inbox, SearchX } from "lucide-react";

const VARIANTS = {
  empty: {
    icon: Inbox,
    title: "No data available",
    description: "There is no data to display at this time.",
  },
  error: {
    icon: AlertTriangle,
    title: "Something went wrong",
    description: "An error occurred while loading data.",
  },
  noResults: {
    icon: SearchX,
    title: "No results found",
    description: "Try adjusting your search or filters.",
  },
};

export default function EmptyState({
  variant = "empty",
  title,
  description,
  icon: CustomIcon,
  action,
  className = "",
}) {
  const defaults = VARIANTS[variant] || VARIANTS.empty;
  const Icon = CustomIcon || defaults.icon;

  return (
    <div className={`flex flex-col items-center justify-center py-8 sm:py-10 px-4 sm:px-6 text-center ${className}`}>
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800/50 border border-slate-700/50 mb-3">
        <Icon className="h-5 w-5 text-slate-500" />
      </div>
      <h3 className="text-sm font-semibold text-slate-300 mb-1">
        {title || defaults.title}
      </h3>
      <p className="text-xs text-slate-500 max-w-xs mb-4">
        {description || defaults.description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}

export function InlineEmptyState({
  title = "No data available",
  description = "No data for the selected time range.",
  className = "",
}) {
  return (
    <div className={`flex h-full min-h-16 flex-col items-center justify-center px-3 py-6 text-center ${className}`}>
      <p className="text-[10px] font-semibold text-[var(--soc-text-secondary)]">{title}</p>
      <p className="mt-0.5 text-[9px] text-[var(--soc-text-muted)]">{description}</p>
    </div>
  );
}
