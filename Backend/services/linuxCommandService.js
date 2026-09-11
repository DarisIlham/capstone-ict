// services/linuxCommandService.js

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

// Fungsi pembantu internal (tidak perlu diekspor)
function buildLinuxCommandMustClauses() {
  return [exactMatchClause("log_type", "linux_commands")];
}

function buildSuspiciousCommandShouldClauses() {
  return [
    exactMatchClause("linux.command_name", "curl"),
    exactMatchClause("linux.command_name", "wget"),
    exactMatchClause("linux.command_name", "nc"),
    exactMatchClause("linux.command_name", "netcat"),
    exactMatchClause("linux.command_name", "ncat"),
    exactMatchClause("linux.command_name", "socat"),
    {
      wildcard: {
        "linux.command.keyword": {
          value: "*bash -c*",
          case_insensitive: true
        }
      }
    },
    {
      wildcard: {
        "linux.command.keyword": {
          value: "*sh -c*",
          case_insensitive: true
        }
      }
    },
    {
      wildcard: {
        "linux.command.keyword": {
          value: "*zsh -c*",
          case_insensitive: true
        }
      }
    },
    {
      wildcard: {
        "linux.command.keyword": {
          value: "*python -c*",
          case_insensitive: true
        }
      }
    },
    {
      wildcard: {
        "linux.command.keyword": {
          value: "*python3 -c*",
          case_insensitive: true
        }
      }
    },
    {
      wildcard: {
        "linux.command.keyword": {
          value: "*perl -e*",
          case_insensitive: true
        }
      }
    },
    {
      wildcard: {
        "linux.command.keyword": {
          value: "*php -r*",
          case_insensitive: true
        }
      }
    },
    {
      wildcard: {
        "linux.command.keyword": {
          value: "*base64 -d*",
          case_insensitive: true
        }
      }
    },
    {
      wildcard: {
        "linux.command.keyword": {
          value: "*chmod 777*",
          case_insensitive: true
        }
      }
    },
    {
      wildcard: {
        "linux.command.keyword": {
          value: "*rm -rf*",
          case_insensitive: true
        }
      }
    },
    {
      wildcard: {
        "linux.command.keyword": {
          value: "*history -c*",
          case_insensitive: true
        }
      }
    },
    {
      wildcard: {
        "linux.command.keyword": {
          value: "*unset HISTFILE*",
          case_insensitive: true
        }
      }
    }
  ];
}

function classifyLinuxCommand(command, commandName) {
  const cmd = String(command || "").trim();
  const name = String(commandName || "").trim().toLowerCase();

  if (!cmd) {
    return [];
  }

  const indicators = [];

  if (["curl", "wget"].includes(name)) {
    indicators.push("network_fetch");
  }

  if (["nc", "netcat", "ncat", "socat"].includes(name)) {
    indicators.push("remote_shell_tool");
  }

  if (/\b(bash|sh|zsh)\s+-c\b/i.test(cmd)) {
    indicators.push("shell_inline_exec");
  }

  if (/\bpython[0-9.]*\b.*\s-c\s/i.test(cmd)) {
    indicators.push("python_inline_exec");
  }

  if (/\bperl\b.*\s-e\s/i.test(cmd)) {
    indicators.push("perl_inline_exec");
  }

  if (/\bphp\b.*\s-r\s/i.test(cmd)) {
    indicators.push("php_inline_exec");
  }

  if (/\bbase64\b.*\s-d\b/i.test(cmd)) {
    indicators.push("base64_decode");
  }

  if (/\bchmod\s+777\b/i.test(cmd)) {
    indicators.push("permission_change_777");
  }

  if (/\brm\s+-rf\b/i.test(cmd)) {
    indicators.push("destructive_delete");
  }

  if (/\bhistory\s+-c\b/i.test(cmd) || /\bunset\s+HISTFILE\b/i.test(cmd)) {
    indicators.push("history_tampering");
  }

  return [...new Set(indicators)];
}

function formatLinuxCommand(hit) {
  const src = hit._source || {};
  const command = getField(src, "linux.command");
  const commandName = getField(src, "linux.command_name");
  const indicators = classifyLinuxCommand(command, commandName);
  const agentName = getField(src, "agent.name") || getField(src, "host.name") || "-";

  return {
    id: hit._id,
    timestamp: getField(src, "@timestamp"),
    logType: getField(src, "log_type"),
    user: getField(src, "linux.user"),
    session: getField(src, "linux.session"),
    command,
    commandName,
    agentName,
    hostName: getField(src, "host.name"),
    hostIp: getField(src, "host.ip"),
    message: getField(src, "message"),
    logFilePath: getField(src, "log.file.path"),
    suspicious: indicators.length > 0,
    riskIndicators: indicators
  };
}

// 2. Tambahkan kata kunci 'export' di setiap fungsi utama
export async function listLinuxCommands(query) {
  const { page, limit, from } = normalizePagination(query);
  const {
    user,
    agentName,
    commandName,
    session,
    hostName,
    contains,
    suspicious,
    start,
    end
  } = query;

  const must = buildLinuxCommandMustClauses();
  const mustNot = [];

  const userFilter = buildOptionalExactFilter("linux.user", user);
  const agentNameFilter = buildOptionalExactFilter("agent.name", agentName);
  const commandNameFilter = buildOptionalExactFilter("linux.command_name", commandName);
  const sessionFilter = buildOptionalExactFilter("linux.session", session);
  const hostNameFilter = buildOptionalExactFilter("host.name", hostName);
  const containsFilter = buildContainsClause("linux.command", contains);

  if (userFilter) must.push(userFilter);
  if (agentNameFilter) {
    must.push(agentNameFilter);
  } else if (hostNameFilter) {
    must.push(hostNameFilter);
  }
  if (commandNameFilter) must.push(commandNameFilter);
  if (sessionFilter) must.push(sessionFilter);
  if (containsFilter) must.push(containsFilter);

  addDateRange(must, start, end);

  const suspiciousShould = buildSuspiciousCommandShouldClauses();
  const parsedSuspicious = parseBoolean(suspicious);

  let should = [];
  let minimumShouldMatch = 0;

  if (parsedSuspicious === true) {
    should = suspiciousShould;
    minimumShouldMatch = 1;
  } else if (parsedSuspicious === false) {
    mustNot.push({
      bool: {
        should: suspiciousShould,
        minimum_should_match: 1
      }
    });
  }

  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      from,
      size: limit,
      track_total_hits: true,
      sort: [{ "@timestamp": { order: "desc" } }],
      query: {
        bool: {
          must,
          must_not: mustNot,
          should,
          minimum_should_match: minimumShouldMatch
        }
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
    data: getHits(response).map(formatLinuxCommand)
  };
}

export async function getLatestLinuxCommand(query) {
  const { user, suspicious } = query;

  const must = buildLinuxCommandMustClauses();
  const mustNot = [];

  const userFilter = buildOptionalExactFilter("linux.user", user);
  if (userFilter) must.push(userFilter);

  const suspiciousShould = buildSuspiciousCommandShouldClauses();
  const parsedSuspicious = parseBoolean(suspicious);

  let should = [];
  let minimumShouldMatch = 0;

  if (parsedSuspicious === true) {
    should = suspiciousShould;
    minimumShouldMatch = 1;
  } else if (parsedSuspicious === false) {
    mustNot.push({
      bool: {
        should: suspiciousShould,
        minimum_should_match: 1
      }
    });
  }

  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      size: 1,
      sort: [{ "@timestamp": { order: "desc" } }],
      query: {
        bool: {
          must,
          must_not: mustNot,
          should,
          minimum_should_match: minimumShouldMatch
        }
      }
    })
  );

  const hit = getHits(response)[0];
  return hit ? formatLinuxCommand(hit) : null;
}

export async function listSuspiciousLinuxCommands(query) {
  const { page, limit, from } = normalizePagination(query);
  const { user, commandName, start, end } = query;

  const must = buildLinuxCommandMustClauses();

  const userFilter = buildOptionalExactFilter("linux.user", user);
  const commandNameFilter = buildOptionalExactFilter("linux.command_name", commandName);

  if (userFilter) must.push(userFilter);
  if (commandNameFilter) must.push(commandNameFilter);

  addDateRange(must, start, end);

  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      from,
      size: limit,
      track_total_hits: true,
      sort: [{ "@timestamp": { order: "desc" } }],
      query: {
        bool: {
          must,
          should: buildSuspiciousCommandShouldClauses(),
          minimum_should_match: 1
        }
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
    data: getHits(response).map(formatLinuxCommand)
  };
}

export async function getLinuxCommandStats(query) {
  const { start, end } = query;

  const must = buildLinuxCommandMustClauses();
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
        total_sessions: {
          cardinality: {
            field: "linux.session"
          }
        },
        total_users: {
          cardinality: {
            field: "linux.user.keyword"
          }
        },
        by_user: {
          terms: {
            field: "linux.user.keyword",
            size: 20
          }
        },
        by_agent: {
          terms: {
            field: "agent.name",
            size: 20
          }
        },
        by_command_name: {
          terms: {
            field: "linux.command_name.keyword",
            size: 20
          }
        },
        top_commands: {
          terms: {
            field: "linux.command.keyword",
            size: 10
          }
        },
        suspicious_count: {
          filter: {
            bool: {
              should: buildSuspiciousCommandShouldClauses(),
              minimum_should_match: 1
            }
          }
        }
      }
    })
  );

  return {
    totalCommands: getTotalHits(response),
    totalSessions: response.aggregations?.total_sessions?.value ?? 0,
    totalUsers: response.aggregations?.total_users?.value ?? 0,
    suspiciousCommands: response.aggregations?.suspicious_count?.doc_count ?? 0,
    users: (response.aggregations?.by_user?.buckets || []).map((bucket) => ({
      user: bucket.key,
      count: bucket.doc_count
    })),
    agents: (response.aggregations?.by_agent?.buckets || []).map((bucket) => ({
      agent: bucket.key,
      count: bucket.doc_count
    })),
    commandNames: (response.aggregations?.by_command_name?.buckets || []).map((bucket) => ({
      commandName: bucket.key,
      count: bucket.doc_count
    })),
    topCommands: (response.aggregations?.top_commands?.buckets || []).map((bucket) => ({
      command: bucket.key,
      count: bucket.doc_count
    }))
  };
}

export async function getLinuxCommandTimeline(query) {
  const { start, end, user } = query;

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
    ...buildLinuxCommandMustClauses(),
    {
      range: {
        "@timestamp": rangeClause
      }
    }
  ];

  const userFilter = buildOptionalExactFilter("linux.user", user);
  if (userFilter) must.push(userFilter);

  const response = unwrapEsResponse(
    await es.search({
      index: elastic.index,
      size: 0,
      query: {
        bool: { must }
      },
      aggs: {
        per_minute: {
          date_histogram: {
            field: "@timestamp",
            fixed_interval: getHistogramInterval(minutes),
            min_doc_count: 0
          },
          aggs: {
            suspicious: {
              filter: {
                bool: {
                  should: buildSuspiciousCommandShouldClauses(),
                  minimum_should_match: 1
                }
              }
            },
            by_command_name: {
              terms: {
                field: "linux.command_name.keyword",
                size: 10
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
    suspicious: bucket.suspicious?.doc_count ?? 0,
    commandNames: (bucket.by_command_name?.buckets || []).map((item) => ({
      commandName: item.key,
      count: item.doc_count
    }))
  }));
}

// 3. Hapus module.exports di akhir
