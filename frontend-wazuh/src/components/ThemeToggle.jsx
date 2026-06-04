import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

const ThemeToggle = ({ className = "" }) => {
  const { isLightTheme, toggleTheme } = useTheme();
  const Icon = isLightTheme ? Moon : Sun;
  const nextThemeLabel = isLightTheme ? "Dark" : "Light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700/60 bg-slate-800/50 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-white ${className}`}
      aria-label={`Aktifkan ${nextThemeLabel.toLowerCase()} mode`}
      title={`Aktifkan ${nextThemeLabel} Mode`}
    >
      <Icon className="h-4 w-4" />
      <span>{nextThemeLabel}</span>
    </button>
  );
};

export default ThemeToggle;
