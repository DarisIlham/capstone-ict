import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

const ThemeToggle = ({ className = "", compact = false }) => {
  const { isLightTheme, toggleTheme } = useTheme();
  const Icon = isLightTheme ? Moon : Sun;
  const nextThemeLabel = isLightTheme ? "Dark" : "Light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center justify-center gap-1.5 border border-[var(--soc-border)] bg-[var(--soc-card)] font-semibold text-[var(--soc-text-muted)] transition-colors hover:border-[var(--soc-border-strong)] hover:bg-[var(--soc-elevated)] hover:text-[var(--soc-text-primary)] ${
        compact
          ? "rounded-md px-2.5 py-1.5 text-[11px]"
          : "rounded-lg px-3 py-2 text-xs"
      } ${className}`}
      aria-label={`Enable ${nextThemeLabel.toLowerCase()} mode`}
      title={`Enable ${nextThemeLabel} Mode`}
    >
      <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      <span>{nextThemeLabel}</span>
    </button>
  );
};

export default ThemeToggle;
