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
  normalizePagination,
  getHistogramInterval
} from "../utils/esHelpers.js";

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
    trafficDirection: getField(src, "webids.traffic_direction"),
    predictedLabel: getField(src, "ml.predicted_label"),
    confidence: getField(src, "ml.confidence"),
    modelName: getField(src, "ml.model_name"),
    modelVersion: getField(src, "ml.model_version"),
    logType: getField(src, "log_type")
  };
}

// 2. Gunakan 'export' di depan setiap fungsi utama
export async function listPredictions(query) {
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

  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      from,
      size: limit,
      track_total_hits: true,
      sort: [{ "@timestamp": { order: "desc" } }],
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

const ML_LABEL_AGG_FIELDS = ["ml.predicted_label.keyword", "ml.predicted_label"];

export async function getPredictionStats(query = {}) {
  const must = buildMlMustClauses();
  addDateRange(must, query.start, query.end);

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
  const { start, end } = query;

  let minutes = Math.max(parseInt(query.minutes || "60", 10), 1);
  if (start && end) {
    const durationMs = Math.max(new Date(end).getTime() - new Date(start).getTime(), 1);
    minutes = Math.max(Math.ceil(durationMs / 60000), 1);
  }

  const rangeClause = {};
  if (start) rangeClause.gte = start;
  if (end) rangeClause.lte = end;
  if (!start && !end) {
    rangeClause.gte = `now-${minutes}m`;
    rangeClause.lte = "now";
  }

  const runAgg = async (labelField) =>
    unwrapEsResponse(
      await es.search({
        index: elastic.index,
        size: 0,
        query: {
          bool: {
            must: [
              ...buildMlMustClauses(),
              {
                range: {
                  "@timestamp": rangeClause
                }
              }
            ]
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
