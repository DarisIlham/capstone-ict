export default function PageLoader({
  message = "Loading...",
  size = "md",
  className = "",
  fullScreen = false,
}) {
  const spinnerSize =
    size === "sm"
      ? "h-8 w-8 border-2"
      : size === "lg"
        ? "h-12 w-12 border-b-2"
        : "h-10 w-10 border-b-2";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      className={`soc-page-loader ${fullScreen ? "soc-page-loader--fullscreen" : ""} ${className}`}
    >
      <div className="soc-page-loader-inner">
        <div
          className={`animate-spin rounded-full border-sky-400 ${spinnerSize}`}
        />
        {message && (
          <div className="soc-page-loader-text">{message}</div>
        )}
      </div>
    </div>
  );
}
