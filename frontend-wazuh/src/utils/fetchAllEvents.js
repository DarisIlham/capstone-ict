// Ambil SEMUA events dalam rentang waktu via search_after (tanpa batas jendela 10000).
// Rentang dibagi menjadi N slice waktu yang diambil PARALEL — tiap slice menjalankan
// chain search_after-nya sendiri — sehingga jauh lebih cepat daripada loop berurutan.
//
// fetchJson(url) harus me-resolve body JSON { data: [...], total_hits, next_search_after }.
async function fetchChain(fetchJson, baseUrl, { start, end, severity, pageSize }) {
  const rows = [];
  let total = 0;
  let first = true;
  let searchAfter = null;
  let previousCursor = null;
  const sev = severity && severity !== "all" ? `&severity=${encodeURIComponent(String(severity).toLowerCase())}` : "";
  for (;;) {
    const url =
      `${baseUrl}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` +
      `${sev}&size=${pageSize}` +
      (searchAfter ? `&search_after=${encodeURIComponent(JSON.stringify(searchAfter))}` : "");
    const body = await fetchJson(url);
    const batch = Array.isArray(body?.data) ? body.data : [];
    if (batch.length > 0) rows.push(...batch);
    if (first) {
      total = Number(body?.total_hits ?? batch.length);
      first = false;
    }
    const nextCursor = Array.isArray(body?.next_search_after) && body.next_search_after.length === 2
      ? body.next_search_after
      : null;
    const cursorKey = nextCursor ? JSON.stringify(nextCursor) : null;
    if (cursorKey && cursorKey === previousCursor) break;
    previousCursor = cursorKey;
    searchAfter = nextCursor;
    if (!searchAfter || batch.length === 0) break;
  }
  return { rows, total };
}

export async function fetchAllEvents(fetchJson, {
  baseUrl,
  start,
  end,
  severity = null,
  slices = 8,
  pageSize = 2000,
  // onProgress(partialRows, doneSlices, totalSlices) — dipanggil tiap satu slice selesai,
  // agar UI bisa tampil progresif tanpa menunggu semua slice.
  onProgress = null,
}) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return fetchChain(fetchJson, baseUrl, { start, end, severity, pageSize }).then((r) => ({
      rows: r.rows,
      totalHits: r.total || r.rows.length,
    }));
  }
  const span = endMs - startMs;
  const mergeInto = (target, list) => {
    for (const e of list) {
      const key = e?.id ?? `${e?.timestamp}-${e?.agentName}-${e?.syscheckPath}`;
      if (!target.has(key)) target.set(key, e);
    }
  };
  const jobs = [];
  for (let i = 0; i < slices; i += 1) {
    jobs.push(
      fetchChain(fetchJson, baseUrl, {
        start: new Date(startMs + (span * i) / slices).toISOString(),
        end: new Date(startMs + (span * (i + 1)) / slices).toISOString(),
        severity,
        pageSize,
      }).then((r) => {
        if (typeof onProgress === "function") {
          try {
            onProgress(r.rows);
          } catch {
            // abaikan error callback progres agar fetch tidak gagal
          }
        }
        return r;
      })
    );
  }
  const results = await Promise.all(jobs);
  // Gabung + dedup (batas slice inklusif di kedua sisi) + urut terbaru dulu
  const seen = new Map();
  mergeInto(seen, results.flatMap((r) => r.rows));
  const rows = Array.from(seen.values()).sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
  const totalHits = results.reduce((s, r) => s + (Number(r.total) || 0), 0);
  return { rows, totalHits: totalHits || rows.length };
}
