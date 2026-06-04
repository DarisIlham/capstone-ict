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

// Fungsi internal (tidak perlu dieksport jika hanya dipakai di dalam file ini)
function buildMlMustClauses() {
  return [exactMatchClause("log_type", "webids_prediction")];
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

export async function getPredictionStats() {
  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      size: 0,
      track_total_hits: true,
      query: {
        bool: {
          must: buildMlMustClauses()
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
