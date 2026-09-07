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
      className={`inline-flex items-center justify-center gap-1.5 border border-slate-700/60 bg-slate-800/50 font-semibold text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-white ${
        compact
          ? "rounded-md px-2.5 py-1.5 text-[11px]"
          : "rounded-lg px-3 py-2 text-xs"
      } ${className}`}
      aria-label={`Aktifkan ${nextThemeLabel.toLowerCase()} mode`}
      title={`Aktifkan ${nextThemeLabel} Mode`}
    >
      <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      <span>{nextThemeLabel}</span>
    </button>
  );
};

export default ThemeToggle;
