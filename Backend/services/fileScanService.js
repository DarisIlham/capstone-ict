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
  normalizePagination,
  getHistogramInterval
} from "../utils/esHelpers.js";
import {
  SEARCH_AFTER_KEEP_ALIVE,
  SEARCH_AFTER_SORT,
  createExpiredPointInTimeError,
  isExpiredPointInTime,
  parseSearchAfter
} from "../utils/searchAfter.js";

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

function normalizeAgentValue(value) {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  if (!normalized || normalized === "-" || /^unknown agent$/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function getFirstMeaningfulField(source, paths = []) {
  for (const path of paths) {
    const value = normalizeAgentValue(getField(source, path));
    if (value) return value;
  }

  return null;
}

function resolveAgentId(source) {
  return getFirstMeaningfulField(source, [
    "agentId",
    "agent_id",
    "agent.id",
    "hostId",
    "host_id",
    "host.id"
  ]);
}

function resolveAgentName(source) {
  const label = getFirstMeaningfulField(source, [
    "agentName",
    "agent_name",
    "agent.name",
    "hostName",
    "host_name",
    "host.name",
    "host.hostname",
    "hostname",
    "data.hostname",
    "observer.hostname"
  ]);

  if (label) return label;

  const agentId = resolveAgentId(source);
  return agentId ? `Agent ${agentId}` : "Unknown agent";
}

const resolveAgentLabelScript = `
def s = params['_source'];
if (s == null) return 'Unknown agent';

if (s.containsKey('agentName') && s.agentName != null && !s.agentName.toString().trim().isEmpty()) return s.agentName;
if (s.containsKey('agent_name') && s.agent_name != null && !s.agent_name.toString().trim().isEmpty()) return s.agent_name;

if (s.containsKey('agent') && s.agent != null) {
  if (s.agent.containsKey('name') && s.agent.name != null && !s.agent.name.toString().trim().isEmpty()) return s.agent.name;
}

if (s.containsKey('hostName') && s.hostName != null && !s.hostName.toString().trim().isEmpty()) return s.hostName;
if (s.containsKey('host_name') && s.host_name != null && !s.host_name.toString().trim().isEmpty()) return s.host_name;

if (s.containsKey('host') && s.host != null) {
  if (s.host.containsKey('name') && s.host.name != null && !s.host.name.toString().trim().isEmpty()) return s.host.name;
  if (s.host.containsKey('hostname') && s.host.hostname != null && !s.host.hostname.toString().trim().isEmpty()) return s.host.hostname;
}

if (s.containsKey('hostname') && s.hostname != null && !s.hostname.toString().trim().isEmpty()) return s.hostname;
if (s.containsKey('data') && s.data != null && s.data.containsKey('hostname') && s.data.hostname != null && !s.data.hostname.toString().trim().isEmpty()) return s.data.hostname;
if (s.containsKey('observer') && s.observer != null && s.observer.containsKey('hostname') && s.observer.hostname != null && !s.observer.hostname.toString().trim().isEmpty()) return s.observer.hostname;

if (s.containsKey('agent') && s.agent != null && s.agent.containsKey('id') && s.agent.id != null && !s.agent.id.toString().trim().isEmpty()) return 'Agent ' + s.agent.id;
if (s.containsKey('agent_id') && s.agent_id != null && !s.agent_id.toString().trim().isEmpty()) return 'Agent ' + s.agent_id;
if (s.containsKey('host') && s.host != null && s.host.containsKey('id') && s.host.id != null && !s.host.id.toString().trim().isEmpty()) return 'Agent ' + s.host.id;
if (s.containsKey('host_id') && s.host_id != null && !s.host_id.toString().trim().isEmpty()) return 'Agent ' + s.host_id;

return 'Unknown agent';
`;

function formatFileScan(hit) {
  const src = hit._source || {};

  return {
    id: hit._id,
    timestamp: getField(src, "@timestamp"),
    agentId: resolveAgentId(src) || "-",
    agentName: resolveAgentName(src),
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

export async function listSuspiciousFileScans(query, options = {}) {
  const { page, limit, from } = normalizePagination(query, {
    maxLimit: options.maxLimit || 100
  });
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

  const cursorMode = query.cursor === "1" || query.cursor === "true" || Boolean(query.search_after);
  if (cursorMode) {
    const searchAfter = parseSearchAfter(query.search_after);
    let pitId = query.pit_id ? String(query.pit_id) : null;

    if (searchAfter && !pitId) {
      const error = new Error("search_after requires a pit_id");
      error.status = 400;
      throw error;
    }

    if (!pitId) {
      const pit = unwrapEsResponse(await es.openPointInTime({
        index: elastic.index,
        keep_alive: SEARCH_AFTER_KEEP_ALIVE
      }));
      pitId = pit?.id || null;
      if (!pitId) throw new Error("Failed to open pagination snapshot");
    }

    const searchBody = {
      size: limit,
      track_total_hits: true,
      sort: SEARCH_AFTER_SORT,
      pit: { id: pitId, keep_alive: SEARCH_AFTER_KEEP_ALIVE },
      query: { bool: { must } }
    };
    if (searchAfter) searchBody.search_after = searchAfter;

    let response;
    try {
      response = unwrapEsResponse(await es.search(searchBody));
    } catch (error) {
      if (isExpiredPointInTime(error)) throw createExpiredPointInTimeError();
      throw error;
    }

    const hits = getHits(response);
    const total = getTotalHits(response);
    const lastSort = hits.length ? hits[hits.length - 1].sort : null;
    const hasMore = Boolean(lastSort) && page * limit < total;

    return {
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      data: hits.map(formatFileScan),
      next_search_after: hasMore ? lastSort : null,
      pit_id: response.pit_id || pitId,
      has_more: hasMore
    };
  }

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

export async function getFileScanStats(query) {
  const { start, end } = query;

  const must = [exactMatchClause("log_type", "file_content_scan")];
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
            suspicious_severity_counts: {
              filter: {
                range: { findings_count: { gt: 0 } }
              },
              aggs: {
                critical: {
                  filter: exactMatchClause("findings.severity", "CRITICAL")
                },
                high: {
                  filter: {
                    bool: {
                      must_not: [exactMatchClause("findings.severity", "CRITICAL")],
                      should: [
                        exactMatchClause("findings.severity", "HIGH"),
                        { bool: { must_not: [
                          exactMatchClause("findings.severity", "CRITICAL"),
                          exactMatchClause("findings.severity", "HIGH"),
                          exactMatchClause("findings.severity", "MEDIUM"),
                          exactMatchClause("findings.severity", "LOW")
                        ] } }
                      ],
                      minimum_should_match: 1
                    }
                  }
                },
                medium: {
                  filter: {
                    bool: {
                      must_not: [
                        exactMatchClause("findings.severity", "CRITICAL"),
                        exactMatchClause("findings.severity", "HIGH")
                      ],
                      must: [exactMatchClause("findings.severity", "MEDIUM")]
                    }
                  }
                },
                low: {
                  filter: {
                    bool: {
                      must_not: [
                        exactMatchClause("findings.severity", "CRITICAL"),
                        exactMatchClause("findings.severity", "HIGH"),
                        exactMatchClause("findings.severity", "MEDIUM")
                      ],
                      must: [exactMatchClause("findings.severity", "LOW")]
                    }
                  }
                }
              }
            },
            suspicious_agents: {
              filter: {
                range: {
                  findings_count: { gt: 0 }
                }
              },
              aggs: {
                by_agent: {
                  terms: {
                    script: {
                      source: resolveAgentLabelScript,
                      lang: "painless"
                    },
                    size: 5
                  },
                  aggs: {
                    last_seen: { max: { field: "@timestamp" } }
                  }
                },
                unique_agents: {
                  cardinality: {
                    script: {
                      source: resolveAgentLabelScript,
                      lang: "painless"
                    }
                  }
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
  const suspiciousAgg = successAgg?.suspicious_agents;
  const suspiciousSeverityAgg = successAgg?.suspicious_severity_counts;

  // If aggregations did not produce useful agent names (mapping may lack keyword fields),
  // fallback to fetching hits and compute top agents from _source (same logic as formatFileScan).
  let topAgents = [];
  let uniqueAgents = 0;

  try {
    // Use the existing normalized suspicious listing to get agent names as seen in the UI
    const suspiciousList = await listSuspiciousFileScans(
      { limit: 10000, start, end },
      { maxLimit: 10000 }
    );
    const hits = suspiciousList?.data || [];
    const map = new Map();

    hits.forEach((item) => {
      const name = resolveAgentName(item);
      const ts = item.timestamp || null;
      const existing = map.get(name) || { name, count: 0, lastSeen: null };
      existing.count += 1;
      if (ts) {
        if (!existing.lastSeen || new Date(ts).getTime() > new Date(existing.lastSeen).getTime()) existing.lastSeen = ts;
      }
      map.set(name, existing);
    });

    uniqueAgents = map.size;
    topAgents = Array.from(map.values())
      .sort((a, b) => b.count - a.count || (new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime()))
      .slice(0, 5)
      .map((a) => ({ name: a.name || "Unknown agent", count: a.count || 0, lastSeen: a.lastSeen || null }));
  } catch (err) {
    console.error("getFileScanStats: failed to compute topAgents from hits:", err && err.message ? err.message : err);
    // fallback to aggregation results if hit-based computation fails
    const agentBuckets = suspiciousAgg?.by_agent?.buckets || [];
    topAgents = (agentBuckets || []).map((bucket) => ({
      name: bucket.key || "Unknown agent",
      count: bucket.doc_count || 0,
      lastSeen: bucket.last_seen?.value_as_string || null
    })).slice(0, 5);

    uniqueAgents = suspiciousAgg?.unique_agents?.value ?? 0;
  }

  return {
    totalEvents: getTotalHits(response),
    totalSuccessScans: successAgg?.doc_count ?? 0,
    totalErrorScans: errorAgg?.doc_count ?? 0,
    suspiciousScans: successAgg?.suspicious_count?.doc_count ?? 0,
    suspiciousSeverityCounts: {
      CRITICAL: suspiciousSeverityAgg?.critical?.doc_count ?? 0,
      HIGH: suspiciousSeverityAgg?.high?.doc_count ?? 0,
      MEDIUM: suspiciousSeverityAgg?.medium?.doc_count ?? 0,
      LOW: suspiciousSeverityAgg?.low?.doc_count ?? 0
    },
    cleanScans: successAgg?.clean_count?.doc_count ?? 0,
    averageFindings: successAgg?.avg_findings?.value ?? 0,
    maxFindings: successAgg?.max_findings?.value ?? 0,
    uniqueAgents,
    topAgents: topAgents,
    fileTypes: (successAgg?.by_file_type?.buckets || []).map((bucket) => ({ fileType: bucket.key, count: bucket.doc_count }))
  };
}

export async function getFileScanTimeline(query) {
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
