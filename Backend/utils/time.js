export function isValidDateValue(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim();
  if (!s) return false;
  if (/^\d{10}$/.test(s)) return true;
  if (/^\d{13}$/.test(s)) return true;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

export function toISOStringSafe(v) {
  const s = String(v).trim();
  if (/^\d{13}$/.test(s)) return new Date(Number(s)).toISOString();
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toISOString();
  const d = new Date(s);
  return d.toISOString();
}

export function buildTimeRange(start, end) {
  const range = {};
  if (isValidDateValue(start)) range.gte = toISOStringSafe(start);
  if (isValidDateValue(end)) range.lte = toISOStringSafe(end);
  return Object.keys(range).length ? { range: { "@timestamp": range } } : null;
}

export function buildPresetRange(rangeKey) {
  const end = new Date();
  const start = new Date(end);

  switch (String(rangeKey || "").trim()) {
    case "1h":
      start.setHours(start.getHours() - 1);
      break;
    case "24h":
      start.setHours(start.getHours() - 24);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
    default:
      start.setDate(start.getDate() - 30);
      break;
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
