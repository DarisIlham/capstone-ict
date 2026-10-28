const DEFAULT_LIMIT = 10;

export function getTopFilterValues(
  items,
  getValue,
  getCount = () => 1,
  selectedValue = "all",
  limit = DEFAULT_LIMIT
) {
  const counts = new Map();

  for (const item of items || []) {
    const value = String(getValue(item) ?? "").trim();
    if (!value || value === "-") continue;

    const count = Number(getCount(item)) || 0;
    counts.set(value, (counts.get(value) || 0) + count);
  }

  const ranked = Array.from(counts.entries()).sort(
    ([valueA, countA], [valueB, countB]) =>
      countB - countA || valueA.localeCompare(valueB)
  );
  const selected = String(selectedValue ?? "").trim();

  if (selected && selected !== "all" && !counts.has(selected)) {
    return [selected, ...ranked.slice(0, Math.max(limit - 1, 0)).map(([value]) => value)];
  }

  return ranked.slice(0, limit).map(([value]) => value);
}
