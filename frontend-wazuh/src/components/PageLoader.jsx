export default function PageLoader({
  message = "Loading...",
  className = "",
  fullScreen = false,
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      className={`flex flex-col items-center justify-center gap-4 ${fullScreen ? "absolute inset-0 z-40" : "min-h-[60vh]"} ${className}`}
      style={{ backgroundColor: fullScreen ? "#0a0f2a" : "transparent" }}
    >
      {/* Animated rings */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 animate-ping" />
        <div className="absolute inset-0 rounded-full border-2 border-purple-500/30 animate-spin" style={{ animationDuration: "1.5s" }} />
        <div className="absolute inset-2 rounded-full border-2 border-pink-500/30 animate-spin" style={{ animationDuration: "2s", animationDirection: "reverse" }} />
        <div className="absolute inset-4 rounded-full border-2 border-purple-400/40 animate-spin" style={{ animationDuration: "1s" }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 animate-pulse" />
        </div>
      </div>

      {/* Loading text */}
      <span className="text-sm font-medium text-slate-300">{message}</span>
    </div>
  );
}
