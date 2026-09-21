// Shared helpers for chart y-axis gutters: measure the rendered label width
// so the left padding always fits the biggest tick value (no clipping).

let _ctx = null;

export function measureAxisLabelWidth(text, font = "500 10px sans-serif") {
  if (typeof document === "undefined") return String(text).length * 6;
  if (!_ctx) {
    const canvas = document.createElement("canvas");
    _ctx = canvas ? canvas.getContext("2d") : null;
  }
  if (!_ctx) return String(text).length * 6;
  _ctx.font = font;
  return Math.ceil(_ctx.measureText(String(text)).width);
}

// labels: array (or single) of rendered tick values.
// Returns a left gutter that fits the widest label plus `gap` px,
// never smaller than `base`.
export function adaptiveLeftGutter(labels, base = 28, gap = 12, font) {
  const list = Array.isArray(labels) ? labels : [labels];
  const w = Math.max(0, ...list.map((v) => measureAxisLabelWidth(v, font)));
  return Math.max(base, Math.ceil(w + gap));
}
