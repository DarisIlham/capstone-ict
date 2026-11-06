export const SEARCH_AFTER_KEEP_ALIVE = process.env.ML_PIT_KEEP_ALIVE || "5m";

export const SEARCH_AFTER_SORT = [
  { "@timestamp": { order: "desc" } },
  { _shard_doc: { order: "asc" } }
];

export function parseSearchAfter(value) {
  if (value === undefined || value === null || value === "") return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("empty");
    return parsed;
  } catch {
    const error = new Error("Invalid search_after cursor");
    error.status = 400;
    throw error;
  }
}

export function isExpiredPointInTime(error) {
  return /point in time|search_context_missing|no search context/i.test(String(error?.message || ""));
}

export function createExpiredPointInTimeError() {
  const error = new Error("Pagination snapshot expired. Restart from the first page.");
  error.status = 409;
  return error;
}