// services/mlService.js

// 1. Ganti require menjadi import dan tambahkan ekstensi .js
// Pastikan file config/elasticsearch dan config/env juga sudah menggunakan 'export'
import es from "../config/elasticsearch.js"; 
import { elastic } from "../config/env.js";
import {
  unwrapEsResponse,
  getHits,
  getTotalHits,
  getField,
  exactMatchClause,
  buildOptionalExactFilter,
  addDateRange,
  normalizePagination
} from "../utils/esHelpers.js";

const ML_PREDICTIONS_PIT_KEEP_ALIVE = "2m";
const ML_PREDICTIONS_CURSOR_SORT = [
  { "@timestamp": { order: "desc", unmapped_type: "date" } },
  { _shard_doc: "desc" }
];

// Fungsi internal (tidak perlu dieksport jika hanya dipakai di dalam file ini)
function buildMlMustClauses() {
  return [exactMatchClause("log_type", "webids_prediction")];
}

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeCursor(cursor) {
  if (!cursor) return null;

  try {
    const padded = String(cursor).replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="), "base64").toString("utf8");
    const parsed = JSON.parse(json);

    if (parsed && typeof parsed === "object" && parsed.pitId && Array.isArray(parsed.sort)) {
      return {
        pitId: parsed.pitId,
        sort: parsed.sort,
        offset: Math.max(Number(parsed.offset || 0), 0)
      };
    }
  } catch {
    // Fall through to the explicit API error below.
  }

  const error = new Error("Invalid ML pagination cursor");
  error.statusCode = 400;
  throw error;
}

function shouldUseCursorPagination(query = {}) {
  return Boolean(
    query.cursor ||
    query.cursorMode === true ||
    query.cursorMode === "true" ||
    query.searchAfter === true ||
    query.searchAfter === "true"
  );
}

function getFirstField(source, paths) {
  for (const path of paths) {
    const value = getField(source, path);
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return null;
}

function resolvePredictionHostname(source) {
  return getFirstField(source, [
    "agent.hostname",
    "host.hostname",
    "host.name",
    "agent_hostname",
    "agent.name",
    "hostname"
  ]);
}

async function openPredictionsPit() {
  const response = unwrapEsResponse(
    await es.openPointInTime({
      index: elastic.index,
      keep_alive: ML_PREDICTIONS_PIT_KEEP_ALIVE
    })
  );

  return response?.id;
}

async function closePredictionsPit(pitId) {
  if (!pitId) return;

  try {
    await es.closePointInTime({ id: pitId });
  } catch (error) {
    console.warn("Failed to close ML predictions PIT:", error.message);
  }
}

function formatPrediction(hit) {
  const src = hit._source || {};

  return {
    id: hit._id,
    timestamp: getField(src, "@timestamp"),
    dataset: getField(src, "event.dataset"),
    kind: getField(src, "event.kind"),
    zeekUid: getField(src, "zeek.uid"),
    sourceIp: getField(src, "source.ip"),
    hostname: resolvePredictionHostname(src),
    destinationIp: getField(src, "destination.ip"),
    service: getField(src, "network.service"),
    trafficDirection: getField(src, "webids.traffic_direction"),
    predictedLabel: getField(src, "ml.predicted_label"),
    confidence: getField(src, "ml.confidence"),
    modelName: getField(src, "ml.model_name"),
    modelVersion: getField(src, "ml.model_version"),
    logType: getField(src, "log_type")
  };
}

// 2. Gunakan 'export' di depan setiap fungsi utama
export async function listPredictions(query = {}) {
  // Use maxLimit: 0 to indicate "no cap" so callers can request larger result windows.
  const { page, limit, from } = normalizePagination(query, { maxLimit: 0 });
  const { label, sourceIp, destinationIp, service, start, end } = query;

  const must = buildMlMustClauses();

  const labelFilter = buildOptionalExactFilter("ml.predicted_label", label);
  const sourceIpFilter = buildOptionalExactFilter("source.ip", sourceIp);
  const destinationIpFilter = buildOptionalExactFilter("destination.ip", destinationIp);
  const serviceFilter = buildOptionalExactFilter("network.service", service);

  if (labelFilter) must.push(labelFilter);
  if (sourceIpFilter) must.push(sourceIpFilter);
  if (destinationIpFilter) must.push(destinationIpFilter);
  if (serviceFilter) must.push(serviceFilter);

  addDateRange(must, start, end);

  const esQuery = {
    bool: { must }
  };

  if (shouldUseCursorPagination(query)) {
    const cursorState = decodeCursor(query.cursor);
    let pitId = cursorState?.pitId || null;

    if (!pitId) {
      pitId = await openPredictionsPit();
    }

    if (!pitId) {
      const error = new Error("Unable to open ML predictions pagination cursor");
      error.statusCode = 500;
      throw error;
    }

    try {
      const searchBody = {
        size: limit,
        track_total_hits: true,
        pit: {
          id: pitId,
          keep_alive: ML_PREDICTIONS_PIT_KEEP_ALIVE
        },
        sort: ML_PREDICTIONS_CURSOR_SORT,
        query: esQuery
      };

      if (cursorState?.sort) {
        searchBody.search_after = cursorState.sort;
      }

      const response = unwrapEsResponse(await es.search(searchBody));
      const hits = getHits(response);
      const total = getTotalHits(response);
      const offsetBefore = cursorState?.offset || 0;
      const loaded = offsetBefore + hits.length;
      const nextPitId = response?.pit_id || pitId;
      const lastHit = hits[hits.length - 1];
      const hasMore = hits.length > 0 && loaded < total && Array.isArray(lastHit?.sort);
      const nextCursor = hasMore
        ? encodeCursor({ pitId: nextPitId, sort: lastHit.sort, offset: loaded })
        : null;

      if (!hasMore) {
        await closePredictionsPit(nextPitId);
      }

      return {
        pagination: {
          mode: "cursor",
          page: Math.floor(offsetBefore / limit) + 1,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          loaded,
          hasMore,
          nextCursor
        },
        data: hits.map(formatPrediction)
      };
    } catch (error) {
      await closePredictionsPit(pitId);
      throw error;
    }
  }

  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      from,
      size: limit,
      track_total_hits: true,
      sort: [{ "@timestamp": { order: "desc" } }],
      query: esQuery
    })
  );

  const total = getTotalHits(response);

  return {
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    },
    data: getHits(response).map(formatPrediction)
  };
}

export async function getLatestPrediction() {
  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      size: 1,
      sort: [{ "@timestamp": { order: "desc" } }],
      query: {
        bool: {
          must: buildMlMustClauses()
        }
      }
    })
  );

  const hit = getHits(response)[0];
  return hit ? formatPrediction(hit) : null;
}

export async function getPredictionStats(query = {}) {
  const { start, end } = query;
  const must = buildMlMustClauses();
  addDateRange(must, start, end);

  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      size: 0,
      track_total_hits: true,
      query: {
        bool: {
          must
        }
      },
      aggs: {
        by_label: {
          terms: {
            field: "ml.predicted_label.keyword",
            size: 20
          },
          aggs: {
            avg_confidence: {
              avg: {
                field: "ml.confidence"
              }
            }
          }
        },
        overall_avg_confidence: {
          avg: {
            field: "ml.confidence"
          }
        }
      }
    })
  );

  const buckets = response.aggregations?.by_label?.buckets || [];

  return {
    totalPredictions: getTotalHits(response),
    overallAvgConfidence: response.aggregations?.overall_avg_confidence?.value ?? null,
    labels: buckets.map((bucket) => ({
      label: bucket.key,
      count: bucket.doc_count,
      avgConfidence: bucket.avg_confidence?.value ?? null
    }))
  };
}

export async function getPredictionTimeline(query) {
  const minutes = Math.max(parseInt(query.minutes || "60", 10), 1);

  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      size: 0,
      query: {
        bool: {
          must: [
            ...buildMlMustClauses(),
            {
              range: {
                "@timestamp": {
                  gte: `now-${minutes}m`,
                  lte: "now"
                }
              }
            }
          ]
        }
      },
      aggs: {
        per_minute: {
          date_histogram: {
            field: "@timestamp",
            fixed_interval: "1m",
            min_doc_count: 0
          },
          aggs: {
            by_label: {
              terms: {
                field: "ml.predicted_label.keyword",
                size: 20
              }
            }
          }
        }
      }
    })
  );

  const buckets = response.aggregations?.per_minute?.buckets || [];

  return buckets.map((bucket) => ({
    timestamp: bucket.key_as_string,
    total: bucket.doc_count,
    labels: (bucket.by_label?.buckets || []).map((item) => ({
      label: item.key,
      count: item.doc_count
    }))
  }));
}

// 3. Hapus module.exports karena sudah menggunakan kata kunci 'export' di atas
