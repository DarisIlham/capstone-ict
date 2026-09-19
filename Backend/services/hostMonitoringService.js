// services/hostMonitoringService.js
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

// Build must clauses for host monitoring (agent metrics from Wazuh)
function buildHostMustClauses() {
  return [
    {
      bool: {
        should: [
          { exists: { field: "agent.name" } },
          { exists: { field: "host.name" } }
        ],
        minimum_should_match: 1
      }
    }
  ];
}

function resolveAgentName(src) {
  return getField(src, "agent.name")
    || getField(src, "host.name")
    || getField(src, "host.hostname")
    || getField(src, "agent.hostname")
    || "-";
}

function resolveAgentId(src) {
  return getField(src, "agent.id")
    || getField(src, "host.id")
    || getField(src, "agent_id")
    || "-";
}

/**
 * Get all monitored hosts with their latest metrics
 */
export async function listHosts(query) {
  const { start, end, status } = query;

  // Aggregate unique agents with their latest data
  const must = buildHostMustClauses();
  addDateRange(must, start, end);

  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      size: 0,
      track_total_hits: true,
      query: { bool: { must } },
      aggs: {
        by_agent: {
          terms: {
            field: "agent.name.keyword",
            size: 50
          },
          aggs: {
            latest_doc: {
              top_hits: {
                size: 1,
                sort: [{ "@timestamp": { order: "desc" } }],
                _source: [
                  "agent.name", "agent.id", "host.name", "host.os.name",
                  "host.os.version", "host.ip", "system.cpu.user",
                  "system.cpu.system", "system.cpu.total", "system.memory.used.pct",
                  "system.disk.read.bytes", "system.disk.write.bytes",
                  "system.network.in.bytes", "system.network.out.bytes",
                  "system.filesystem.used.pct", "host.uptime",
                  "@timestamp"
                ]
              }
            },
            latest_timestamp: {
              max: { field: "@timestamp" }
            }
          }
        },
        total_agents: {
          cardinality: { field: "agent.name.keyword" }
        }
      }
    })
  );

  const buckets = response.aggregations?.by_agent?.buckets || [];
  const totalHosts = response.aggregations?.total_agents?.value ?? buckets.length;

  const now = Date.now();
  const FIVE_MIN = 5 * 60 * 1000;

  const hosts = buckets.map((bucket) => {
    const hit = bucket.latest_doc?.hits?.hits?.[0];
    const src = hit?._source || {};
    const lastSeen = bucket.latest_timestamp?.value || 0;
    const isOnline = (now - lastSeen) < FIVE_MIN;

    const cpuTotal = getField(src, "system.cpu.total") ?? getField(src, "system.cpu.user");
    const memoryPct = getField(src, "system.memory.used.pct");
    const diskPct = getField(src, "system.filesystem.used.pct");

    const cpu = cpuTotal != null ? Math.round(Number(cpuTotal) * (cpuTotal > 1 ? 1 : 100)) : 0;
    const memory = memoryPct != null ? Math.round(Number(memoryPct) * (memoryPct > 1 ? 1 : 100)) : 0;
    const disk = diskPct != null ? Math.round(Number(diskPct) * (diskPct > 1 ? 1 : 100)) : 0;

    let statusLabel = "online";
    if (!isOnline) statusLabel = "offline";
    else if (cpu > 85 || memory > 85 || disk > 85) statusLabel = "warning";

    return {
      id: resolveAgentId(src) || bucket.key,
      name: resolveAgentName(src),
      ip: getField(src, "host.ip") || "-",
      os: getField(src, "host.os.name") || "-",
      status: statusLabel,
      cpu,
      memory,
      disk,
      uptime: getField(src, "host.uptime") || "-",
      lastSeen: new Date(lastSeen).toISOString(),
      alerts: 0
    };
  });

  const filtered = status && status !== "all"
    ? hosts.filter((h) => h.status === status)
    : hosts;

  return {
    hosts: filtered,
    total: totalHosts
  };
}

/**
 * Get KPI summary for host monitoring
 */
export async function getHostStats(query) {
  const { start, end } = query;

  const must = buildHostMustClauses();
  addDateRange(must, start, end);

  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      size: 0,
      track_total_hits: true,
      query: { bool: { must } },
      aggs: {
        total_agents: {
          cardinality: { field: "agent.name.keyword" }
        },
        avg_cpu: {
          avg: { field: "system.cpu.total" }
        },
        avg_memory: {
          avg: { field: "system.memory.used.pct" }
        },
        avg_disk: {
          avg: { field: "system.filesystem.used.pct" }
        },
        by_status: {
          terms: { field: "agent.name.keyword", size: 50 },
          aggs: {
            latest_ts: { max: { field: "@timestamp" } }
          }
        }
      }
    })
  );

  const now = Date.now();
  const FIVE_MIN = 5 * 60 * 1000;
  const totalHosts = response.aggregations?.total_agents?.value ?? 0;
  const avgCpu = response.aggregations?.avg_cpu?.value;
  const avgMemory = response.aggregations?.avg_memory?.value;
  const avgDisk = response.aggregations?.avg_disk?.value;

  const statusBuckets = response.aggregations?.by_status?.buckets || [];
  let onlineHosts = 0;
  let warningHosts = 0;
  let offlineHosts = 0;

  statusBuckets.forEach((b) => {
    const lastSeen = b.latest_ts?.value || 0;
    if ((now - lastSeen) >= FIVE_MIN) {
      offlineHosts++;
    } else {
      onlineHosts++;
    }
  });

  return {
    totalHosts,
    onlineHosts,
    warningHosts,
    offlineHosts,
    avgCpu: avgCpu != null ? Math.round(avgCpu * (avgCpu > 1 ? 1 : 100)) : 0,
    avgMemory: avgMemory != null ? Math.round(avgMemory * (avgMemory > 1 ? 1 : 100)) : 0,
    avgDisk: avgDisk != null ? Math.round(avgDisk * (avgDisk > 1 ? 1 : 100)) : 0,
    totalAlerts: 0
  };
}

/**
 * Get CPU / Memory / Disk / Network timeline for all hosts
 */
export async function getHostTimeline(query) {
  const { start, end, metric = "cpu" } = query;

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

  const must = [
    ...buildHostMustClauses(),
    { range: { "@timestamp": rangeClause } }
  ];

  const fieldMap = {
    cpu: "system.cpu.total",
    memory: "system.memory.used.pct",
    disk: "system.filesystem.used.pct",
    network_in: "system.network.in.bytes",
    network_out: "system.network.out.bytes"
  };

  const field = fieldMap[metric] || fieldMap.cpu;

  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      size: 0,
      query: { bool: { must } },
      aggs: {
        per_minute: {
          date_histogram: {
            field: "@timestamp",
            fixed_interval: getHistogramInterval(minutes),
            min_doc_count: 0
          },
          aggs: {
            avg_metric: {
              avg: { field }
            }
          }
        }
      }
    })
  );

  const buckets = response.aggregations?.per_minute?.buckets || [];

  return buckets.map((bucket) => ({
    t: bucket.key,
    v: bucket.avg_metric?.value != null
      ? Math.round(bucket.avg_metric.value * (bucket.avg_metric.value > 1 ? 1 : 100))
      : 0
  }));
}

/**
 * Get top processes by resource usage
 */
export async function getTopProcesses(query) {
  const { start, end } = query;

  const must = [
    { exists: { field: "process.name" } }
  ];
  addDateRange(must, start, end);

  try {
    const response = unwrapEsResponse(
      await es.search({
        index: elastic.index,
        size: 0,
        query: { bool: { must } },
        aggs: {
          by_process: {
            terms: { field: "process.name.keyword", size: 10 },
            aggs: {
              avg_memory: {
                avg: { field: "system.process.memory.size" }
              }
            }
          }
        }
      })
    );

    const buckets = response.aggregations?.by_process?.buckets || [];
    return buckets.map((b) => ({
      label: b.key,
      value: b.avg_memory?.value ? Math.round(b.avg_memory.value / (1024 * 1024)) : 0,
      unit: " MB"
    }));
  } catch {
    return [];
  }
}

/**
 * Get top 5 most active agents
 */
export async function getTopAgents(query) {
  const { start, end } = query;

  const must = buildHostMustClauses();
  addDateRange(must, start, end);

  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      size: 0,
      query: { bool: { must } },
      aggs: {
        by_agent: {
          terms: { field: "agent.name.keyword", size: 5 },
          aggs: {
            doc_count: { value_count: { field: "@timestamp" } },
            os: {
              top_hits: {
                size: 1,
                _source: ["host.os.name", "host.ip"]
              }
            }
          }
        }
      }
    })
  );

  const buckets = response.aggregations?.by_agent?.buckets || [];
  return buckets.map((b) => {
    const hit = b.os?.hits?.hits?.[0]?._source || {};
    return {
      label: b.key,
      value: b.doc_count?.value ?? b.doc_count ?? 0,
      sub: `${getField(hit, "host.os.name") || "-"} · ${getField(hit, "host.ip") || "-"}`
    };
  });
}

/**
 * Get top 5 most active sessions (by event count, like AttackDashboard "Top Sessions")
 * Keeps labels short so the frontend chart never overflows its container.
 */
export async function getTopSessions(query) {
  const { start, end } = query;

  const must = buildHostMustClauses();
  must.push({ exists: { field: "linux.session" } });
  addDateRange(must, start, end);

  try {
    const response = unwrapEsResponse(
      await es.search({
        index: elastic.index,
        size: 0,
        query: { bool: { must } },
        aggs: {
          by_session: {
            terms: { field: "linux.session.keyword", size: 5 },
            aggs: {
              by_user: {
                terms: { field: "linux.user.keyword", size: 1 },
              },
              by_agent: {
                terms: { field: "agent.name.keyword", size: 1 },
              },
            },
          },
        },
      })
    );

    const CHART_COLORS = ["#F97316", "#A855F7", "#EC4899", "#3B82F6", "#10B981"];
    const buckets = response.aggregations?.by_session?.buckets || [];
    return buckets.map((b, i) => {
      const raw = String(b.key ?? "-");
      return {
        label: raw.length > 14 ? `${raw.slice(0, 12)}…` : raw,
        fullLabel: raw,
        value: b.doc_count ?? 0,
        color: CHART_COLORS[i % CHART_COLORS.length],
        sub: `${b.by_user?.buckets?.[0]?.key || "-"} · ${b.by_agent?.buckets?.[0]?.key || "-"}`,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Get recent alerts / warnings from host monitoring
 */
export async function getRecentAlerts(query) {
  const { start, end } = query;

  const must = [
    {
      bool: {
        should: [
          { range: { "system.cpu.total": { gte: 0.85 } } },
          { range: { "system.memory.used.pct": { gte: 0.85 } } },
          { range: { "system.filesystem.used.pct": { gte: 0.85 } } }
        ],
        minimum_should_match: 1
      }
    }
  ];
  addDateRange(must, start, end);

  try {
    const response = unwrapEsResponse(
      await es.search({
        index: elastic.index,
        size: 10,
        sort: [{ "@timestamp": { order: "desc" } }],
        query: { bool: { must } },
        _source: ["agent.name", "system.cpu.total", "system.memory.used.pct", "system.filesystem.used.pct", "@timestamp"]
      })
    );

    const hits = getHits(response);
    return hits.map((hit) => {
      const src = hit._source || {};
      const cpu = getField(src, "system.cpu.total");
      const mem = getField(src, "system.memory.used.pct");
      const disk = getField(src, "system.filesystem.used.pct");
      const agentName = getField(src, "agent.name") || "unknown";

      let message = "";
      let severity = "warning";

      if (cpu != null && Number(cpu) >= 0.85) {
        message = `CPU usage at ${Math.round(Number(cpu) * 100)}%`;
        severity = "high";
      } else if (mem != null && Number(mem) >= 0.85) {
        message = `Memory usage at ${Math.round(Number(mem) * 100)}%`;
        severity = "warning";
      } else if (disk != null && Number(disk) >= 0.85) {
        message = `Disk usage at ${Math.round(Number(disk) * 100)}%`;
        severity = "critical";
      }

      return {
        host: agentName,
        message,
        time: getField(src, "@timestamp"),
        severity
      };
    });
  } catch {
    return [];
  }
}
