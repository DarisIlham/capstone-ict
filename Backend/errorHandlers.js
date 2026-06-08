export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: "Endpoint not found" });
}

export function globalErrorHandler(err, req, res, next) {
  console.error("🔥 Server Error:", err.stack || err.message || err);
  res.status(err.statusCode || 500).json({ success: false, message: err.message || "Internal server error" });
}
