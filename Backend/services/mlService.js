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
  buildKeywordContainsClause,
  addDateRange,
  normalizePagination,
  getHistogramInterval
} from "../utils/esHelpers.js";

// ============ DUMMY DATA REMOVED ============

// Fungsi internal (tidak perlu dieksport jika hanya dipakai di dalam file ini)
function buildMlMustClauses() {
  return [exactMatchClause("log_type", "webids_prediction")];
}

function firstMeaningfulField(src, paths = []) {
  for (const path of paths) {
    const value = getField(src, path);
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (!normalized || normalized === "-") continue;
    return normalized;
  }
  return null;
}

function resolveMlAgent(src) {
  // agent.hostname di mapping hanyalah ALIAS ke agent.name (tidak ada di _source),
  // jadi baca langsung agent.name, dengan fallback ke host.*
  return firstMeaningfulField(src, ["agent.name", "host.hostname", "host.name", "hostname"]) || "-";
}

function resolveMlUser(src) {
  // Dokumen webids_prediction tidak memiliki identitas user,
  // jadi kolom User tidak ditampilkan di UI (hanya Agent).
  return "-";
}

function formatPrediction(hit) {
  const src = hit._source || {};

  return {
    id: hit._id,
    timestamp: getField(src, "@timestamp"),
    agent: resolveMlAgent(src),
    user: resolveMlUser(src),
    dataset: getField(src, "event.dataset"),
    kind: getField(src, "event.kind"),
    zeekUid: getField(src, "zeek.uid"),
    sourceIp: getField(src, "source.ip"),
    destinationIp: getField(src, "destination.ip"),
    service: getField(src, "network.service"),
    httpUri: firstMeaningfulField(src, ["http.uri", "url.original"]) || null,
    httpPostBody: firstMeaningfulField(src, ["http.post_body"]) || null,
    trafficDirection: getField(src, "webids.traffic_direction"),
    predictedLabel: getField(src, "ml.predicted_label"),
    confidence: getField(src, "ml.confidence"),
    modelName: getField(src, "ml.model_name"),
    modelVersion: getField(src, "ml.model_version"),
    logType: getField(src, "log_type")
  };
}

const ML_SORT = [{ "@timestamp": { order: "desc" } }];
const ML_CURSOR_SORT = [
  { "@timestamp": { order: "desc" } },
  { "_shard_doc": { order: "asc" } }
];
const ML_PIT_KEEP_ALIVE = process.env.ML_PIT_KEEP_ALIVE || "5m";

function parseSearchAfter(value) {
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

function buildConfidenceRangeClause(value) {
  if (!value || value === "all") return null;
  const [minPercent, maxPercent] = String(value).split("-").map(Number);
  if (!Number.isFinite(minPercent) || !Number.isFinite(maxPercent)) return null;
  return {
    range: {
      "ml.confidence": {
        gte: Math.max(minPercent, 0) / 100,
        lte: Math.min(maxPercent, 100) / 100
      }
    }
  };
}

// Pencarian IP: exact untuk IP lengkap, range untuk prefix (mis. "10.69").
function buildIpPrefixClause(field, raw) {
  const value = String(raw || "").trim();
  if (!/^\d{1,3}(\.\d{1,3}){0,3}$/.test(value)) return null;
  const parts = value.split(".").map(Number);
  if (parts.some((part) => part > 255)) return null;
  if (parts.length === 4) return { term: { [field]: value } };
  const remaining = 4 - parts.length;
  const start = [...parts, ...Array(remaining).fill(0)].join(".");
  const end = [...parts, ...Array(remaining).fill(255)].join(".");
  return { range: { [field]: { gte: start, lte: end } } };
}

function buildMlKeywordClause(q) {
  if (!q || !String(q).trim()) return null;
  const should = [
    buildKeywordContainsClause("agent.name", q),
    buildKeywordContainsClause("network.service", q),
    buildIpPrefixClause("source.ip", q),
    buildIpPrefixClause("destination.ip", q)
  ].filter(Boolean);
  if (!should.length) return null;
  return { bool: { should, minimum_should_match: 1 } };
}

function buildMlFilterMust(query = {}) {
  const { label, sourceIp, destinationIp, service, agent, confidenceRange, q, start, end } = query;
  const must = buildMlMustClauses();

  const labelFilter = buildOptionalExactFilter("ml.predicted_label", label);
  const sourceIpFilter = buildOptionalExactFilter("source.ip", sourceIp);
  const destinationIpFilter = buildOptionalExactFilter("destination.ip", destinationIp);
  const serviceFilter = buildOptionalExactFilter("network.service", service);
  const agentFilter = buildOptionalExactFilter("agent.name", agent);
  const confidenceFilter = buildConfidenceRangeClause(confidenceRange);
  const keywordFilter = buildMlKeywordClause(q);

  if (labelFilter) must.push(labelFilter);
  if (sourceIpFilter) must.push(sourceIpFilter);
  if (destinationIpFilter) must.push(destinationIpFilter);
  if (serviceFilter) must.push(serviceFilter);
  if (agentFilter) must.push(agentFilter);
  if (confidenceFilter) must.push(confidenceFilter);
  if (keywordFilter) must.push(keywordFilter);

  addDateRange(must, start, end);
  return must;
}

// 2. Gunakan 'export' di depan setiap fungsi utama
export async function listPredictions(query) {
  const maxLimit = Number(process.env.ML_MAX_LIMIT || 10000);
  const maxResultWindow = Number(process.env.ML_MAX_RESULT_WINDOW || 10000);
  const { page, limit, from } = normalizePagination(query, { maxLimit });
  const must = buildMlFilterMust(query);

  const cursorMode =
    query.cursor === "1" ||
    query.cursor === "true" ||
    Boolean(query.search_after);

  if (!cursorMode) {
    if (from + limit > maxResultWindow) {
      const error = new Error(`Requested result window exceeds ${maxResultWindow} documents`);
      error.status = 400;
      throw error;
    }

    const response = unwrapEsResponse(
      await es.search({
        index: elastic.index,
        from,
        size: limit,
        track_total_hits: true,
        sort: ML_SORT,
        query: {
          bool: { must }
        }
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
      data: getHits(response).map(formatPrediction),
      next_search_after: null,
      pit_id: null,
      has_more: false
    };
  }

  const searchAfter = parseSearchAfter(query.search_after);
  let pitId = query.pit_id ? String(query.pit_id) : null;

  if (searchAfter && !pitId) {
    const error = new Error("search_after requires a pit_id");
    error.status = 400;
    throw error;
  }

  if (!pitId) {
    const pit = unwrapEsResponse(
      await es.openPointInTime({
        index: elastic.index,
        keep_alive: ML_PIT_KEEP_ALIVE
      })
    );
    pitId = pit?.id || null;
    if (!pitId) {
      throw new Error("Failed to open pagination snapshot");
    }
  }

  const searchBody = {
    size: limit,
    track_total_hits: true,
    sort: ML_CURSOR_SORT,
    pit: { id: pitId, keep_alive: ML_PIT_KEEP_ALIVE },
    query: {
      bool: { must }
    }
  };
  if (searchAfter) searchBody.search_after = searchAfter;

  let response;
  try {
    response = unwrapEsResponse(await es.search(searchBody));
  } catch (err) {
    if (/point in time|search_context_missing|no search context/i.test(String(err?.message || ""))) {
      const error = new Error("Pagination snapshot expired. Restart from the first page.");
      error.status = 409;
      throw error;
    }
    throw err;
  }

  const hits = getHits(response);
  const total = getTotalHits(response);
  const lastSort = hits.length ? hits[hits.length - 1].sort : null;
  const hasMore = Boolean(lastSort) && page * limit < total;

  return {
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    },
    data: hits.map(formatPrediction),
    next_search_after: hasMore ? lastSort : null,
    pit_id: response.pit_id || pitId,
    has_more: hasMore
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

const ML_LABEL_AGG_FIELDS = ["ml.predicted_label.keyword", "ml.predicted_label"];

export async function getPredictionStats(query = {}) {
  const must = buildMlFilterMust(query);

  const runAgg = async (labelField) =>
    unwrapEsResponse(
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
              field: labelField,
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
          },
          top_agents: {
            terms: {
              field: "agent.name",
              size: 20
            }
          },
          top_source_ips: {
            terms: {
              field: "source.ip",
              size: 10
            }
          },
          top_destination_ips: {
            terms: {
              field: "destination.ip",
              size: 10
            }
          },
          top_services: {
            terms: {
              field: "network.service",
              size: 20
            }
          },
          unique_agents: {
            cardinality: {
              field: "agent.name"
            }
          },
          unique_source_ips: {
            cardinality: {
              field: "source.ip"
            }
          },
          unique_destination_ips: {
            cardinality: {
              field: "destination.ip"
            }
          }
        }
      })
    );

  let response = await runAgg(ML_LABEL_AGG_FIELDS[0]);
  let buckets = response.aggregations?.by_label?.buckets || [];

  if (!buckets.length && getTotalHits(response) > 0) {
    try {
      const retry = await runAgg(ML_LABEL_AGG_FIELDS[1]);
      const retryBuckets = retry.aggregations?.by_label?.buckets || [];
      if (retryBuckets.length) {
        response = retry;
        buckets = retryBuckets;
      }
    } catch {
      // Pertahankan hasil pertama bila field polos tidak bisa di-agregasi.
    }
  }

  const aggs = response.aggregations || {};
  const mapBuckets = (name, labelKey = "label") =>
    (aggs[name]?.buckets || []).map((bucket) => ({
      [labelKey]: bucket.key,
      count: bucket.doc_count
    }));

  return {
    totalPredictions: getTotalHits(response),
    overallAvgConfidence: aggs.overall_avg_confidence?.value ?? null,
    labels: buckets.map((bucket) => ({
      label: bucket.key,
      count: bucket.doc_count,
      avgConfidence: bucket.avg_confidence?.value ?? null
    })),
    topAgents: (aggs.top_agents?.buckets || []).map((bucket) => ({
      name: bucket.key,
      count: bucket.doc_count
    })),
    topSourceIps: mapBuckets("top_source_ips"),
    topDestinationIps: mapBuckets("top_destination_ips"),
    topServices: mapBuckets("top_services"),
    uniqueAgents: aggs.unique_agents?.value ?? 0,
    uniqueSourceIps: aggs.unique_source_ips?.value ?? 0,
    uniqueDestinationIps: aggs.unique_destination_ips?.value ?? 0
  };
}

export async function getPredictionTimeline(query) {
  const { start, end } = query;

  let minutes = Math.max(parseInt(query.minutes || "60", 10), 1);
  if (start && end) {
    const durationMs = Math.max(new Date(end).getTime() - new Date(start).getTime(), 1);
    minutes = Math.max(Math.ceil(durationMs / 60000), 1);
  }

  const rangeStart = start || `now-${minutes}m`;
  const rangeEnd = end || "now";
  const must = buildMlFilterMust({ ...query, start: rangeStart, end: rangeEnd });

  const runAgg = async (labelField) =>
    unwrapEsResponse(
      await es.search({
        index: elastic.index,
        size: 0,
        query: {
          bool: {
            must
          }
        },
        aggs: {
          per_minute: {
            date_histogram: {
              field: "@timestamp",
              fixed_interval: getHistogramInterval(minutes),
              min_doc_count: 0
            },
            aggs: {
              by_label: {
                terms: {
                  field: labelField,
                  size: 20
                }
              }
            }
          }
        }
      })
    );

  let response = await runAgg(ML_LABEL_AGG_FIELDS[0]);
  let buckets = response.aggregations?.per_minute?.buckets || [];
  const timelineTotal = buckets.reduce((sum, bucket) => sum + (bucket.doc_count || 0), 0);
  const hasAnyLabels = buckets.some((bucket) => (bucket.by_label?.buckets || []).length > 0);

  if (!hasAnyLabels && timelineTotal > 0) {
    try {
      const retry = await runAgg(ML_LABEL_AGG_FIELDS[1]);
      const retryBuckets = retry.aggregations?.per_minute?.buckets || [];
      if (retryBuckets.some((bucket) => (bucket.by_label?.buckets || []).length > 0)) {
        response = retry;
        buckets = retryBuckets;
      }
    } catch {
      // Pertahankan hasil pertama bila field polos tidak bisa di-agregasi.
    }
  }

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
