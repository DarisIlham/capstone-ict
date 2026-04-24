// services/fileScanService.js

// 1. Ganti require menjadi import dan wajib gunakan ekstensi .js
import es from "../config/elasticsearch.js";
import { elastic } from "../config/env.js";
import {
  unwrapEsResponse,
  getHits,
  getTotalHits,
  getField,
  exactMatchClause,
  buildOptionalExactFilter,
  buildContainsClause,
  parseBoolean,
  addDateRange,
  normalizePagination
} from "../utils/esHelpers.js";

// Fungsi pembantu internal (tidak perlu diekspor)
function buildFileScanMustClauses(status = "success") {
  const must = [exactMatchClause("log_type", "file_content_scan")];

  if (status === "success") {
    must.push(exactMatchClause("event_type", "file_content_scan"));
  } else if (status === "error") {
    must.push(exactMatchClause("event_type", "file_content_scan_error"));
  }

  return must;
}

function formatFileScan(hit) {
  const src = hit._source || {};

  return {
    id: hit._id,
    timestamp: getField(src, "@timestamp"),
    logType: getField(src, "log_type"),
    eventType: getField(src, "event_type"),
    scanner: getField(src, "scanner"),
    filePath: getField(src, "file_path"),
    fileName: getField(src, "file_name"),
    fileType: getField(src, "file_type"),
    fileSize: getField(src, "file_size"),
    sha256: getField(src, "sha256"),
    findingsCount: getField(src, "findings_count") ?? 0,
    matchedSourcesCount: getField(src, "matched_sources_count") ?? 0,
    matchedSources: getField(src, "matched_sources") || [],
    findings: getField(src, "findings") || [],
    extractedUrls: getField(src, "extracted_urls") || [],
    error: getField(src, "error")
  };
}

// 2. Tambahkan kata kunci 'export' di setiap fungsi utama
export async function listFileScans(query) {
  const { page, limit, from } = normalizePagination(query);
  const {
    status = "success",
    fileType,
    fileName,
    filePath,
    sha256,
    scanner,
    indicator,
    urlContains,
    hasFindings,
    start,
    end
  } = query;

  const must = buildFileScanMustClauses(status);

  const fileTypeFilter = buildOptionalExactFilter("file_type", fileType);
  const fileNameFilter = buildOptionalExactFilter("file_name", fileName);
  const filePathFilter = buildOptionalExactFilter("file_path", filePath);
  const sha256Filter = buildOptionalExactFilter("sha256", sha256);
  const scannerFilter = buildOptionalExactFilter("scanner", scanner);
  const indicatorFilter = buildOptionalExactFilter("findings.indicator", indicator);
  const urlContainsFilter = buildContainsClause("extracted_urls", urlContains);

  if (fileTypeFilter) must.push(fileTypeFilter);
  if (fileNameFilter) must.push(fileNameFilter);
  if (filePathFilter) must.push(filePathFilter);
  if (sha256Filter) must.push(sha256Filter);
  if (scannerFilter) must.push(scannerFilter);
  if (indicatorFilter) must.push(indicatorFilter);
  if (urlContainsFilter) must.push(urlContainsFilter);

  const parsedHasFindings = parseBoolean(hasFindings);
  if (parsedHasFindings === true) {
    must.push({
      range: {
        findings_count: { gt: 0 }
      }
    });
  } else if (parsedHasFindings === false) {
    must.push({
      term: {
        findings_count: 0
      }
    });
  }

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
    data: getHits(response).map(formatFileScan)
  };
}

export async function getLatestFileScan(query) {
  const status = query.status || "success";

  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      size: 1,
      sort: [{ "@timestamp": { order: "desc" } }],
      query: {
        bool: {
          must: buildFileScanMustClauses(status)
        }
      }
    })
  );

  const hit = getHits(response)[0];
  return hit ? formatFileScan(hit) : null;
}

export async function listSuspiciousFileScans(query) {
  const { page, limit, from } = normalizePagination(query);
  const { fileType, indicator, start, end } = query;

  const must = buildFileScanMustClauses("success");

  must.push({
    range: {
      findings_count: { gt: 0 }
    }
  });

  const fileTypeFilter = buildOptionalExactFilter("file_type", fileType);
  const indicatorFilter = buildOptionalExactFilter("findings.indicator", indicator);

  if (fileTypeFilter) must.push(fileTypeFilter);
  if (indicatorFilter) must.push(indicatorFilter);

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
    data: getHits(response).map(formatFileScan)
  };
}

export async function listFileScanErrors(query) {
  const { page, limit, from } = normalizePagination(query);
  const { scanner, filePath, start, end } = query;

  const must = buildFileScanMustClauses("error");

  const scannerFilter = buildOptionalExactFilter("scanner", scanner);
  const filePathFilter = buildOptionalExactFilter("file_path", filePath);

  if (scannerFilter) must.push(scannerFilter);
  if (filePathFilter) must.push(filePathFilter);

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
    data: getHits(response).map(formatFileScan)
  };
}

export async function getFileScanStats() {
  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      size: 0,
      track_total_hits: true,
      query: {
        bool: {
          must: [exactMatchClause("log_type", "file_content_scan")]
        }
      },
      aggs: {
        success_scans: {
          filter: {
            bool: {
              must: [exactMatchClause("event_type", "file_content_scan")]
            }
          },
          aggs: {
            by_file_type: {
              terms: {
                field: "file_type.keyword",
                size: 10
              }
            },
            suspicious_count: {
              filter: {
                range: {
                  findings_count: { gt: 0 }
                }
              }
            },
            clean_count: {
              filter: {
                term: {
                  findings_count: 0
                }
              }
            },
            avg_findings: {
              avg: {
                field: "findings_count"
              }
            },
            max_findings: {
              max: {
                field: "findings_count"
              }
            }
          }
        },
        error_scans: {
          filter: {
            bool: {
              must: [exactMatchClause("event_type", "file_content_scan_error")]
            }
          }
        }
      }
    })
  );

  const successAgg = response.aggregations?.success_scans;
  const errorAgg = response.aggregations?.error_scans;

  return {
    totalEvents: getTotalHits(response),
    totalSuccessScans: successAgg?.doc_count ?? 0,
    totalErrorScans: errorAgg?.doc_count ?? 0,
    suspiciousScans: successAgg?.suspicious_count?.doc_count ?? 0,
    cleanScans: successAgg?.clean_count?.doc_count ?? 0,
    averageFindings: successAgg?.avg_findings?.value ?? 0,
    maxFindings: successAgg?.max_findings?.value ?? 0,
    fileTypes: (successAgg?.by_file_type?.buckets || []).map((bucket) => ({
      fileType: bucket.key,
      count: bucket.doc_count
    }))
  };
}

export async function getFileScanTimeline(query) {
  const minutes = Math.max(parseInt(query.minutes || "60", 10), 1);

  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      size: 0,
      query: {
        bool: {
          must: [
            exactMatchClause("log_type", "file_content_scan"),
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
            success: {
              filter: {
                bool: {
                  must: [exactMatchClause("event_type", "file_content_scan")]
                }
              },
              aggs: {
                suspicious: {
                  filter: {
                    range: {
                      findings_count: { gt: 0 }
                    }
                  }
                }
              }
            },
            errors: {
              filter: {
                bool: {
                  must: [exactMatchClause("event_type", "file_content_scan_error")]
                }
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
    success: bucket.success?.doc_count ?? 0,
    suspicious: bucket.success?.suspicious?.doc_count ?? 0,
    errors: bucket.errors?.doc_count ?? 0
  }));
}

// 3. Hapus module.exports di akhir