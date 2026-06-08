import { postToIndexer } from "../indexer.js";
import { buildTimeRange, buildPresetRange } from "../utils/time.js";
import { extractDomainsFromHit } from "../utils/domains.js";

function mapWazuhHit(hit) {
  const source = hit._source || {};
  const auditUser = source.syscheck?.audit?.login_user?.name;
  const fileOwner = source.syscheck?.uname_after || source.syscheck?.uname;
  const username = auditUser || fileOwner || "-";

  return {
    id: hit._id,
    timestamp: source.timestamp || source["@timestamp"] || "-",
    agentName: source.agent?.name || "-",
    username,
    syscheckPath:
      source.syscheck?.path ||
      source.data?.path ||
      source.location ||
      "-",
    syscheckEvent:
      source.syscheck?.event ||
      source.decoder?.name ||
      "-",
    ruleDescription: source.rule?.description || "-",
    ruleLevel: source.rule?.level ?? 0,
    ruleId: source.rule?.id ?? "-",
    fileDiff:
      source.syscheck?.diff ||
      source.full_log ||
      null,
  };
}

export async function handleEventsRequest(req, res) {
  try {
    const agent_id_param = req.params.agent_id;
    const agent_id = agent_id_param === "all" || !agent_id_param ? undefined : agent_id_param;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const size = Math.max(1, parseInt(req.query.size, 10) || 100);
    const from = (page - 1) * size;

    const rangeKey = String(req.query.range || "30d").trim();
    let { start, end } = req.query;

    if (!start && !end) {
      const preset = buildPresetRange(rangeKey);
      start = preset.start;
      end = preset.end;
    }

    const filter = [];
    if (agent_id) filter.push({ term: { "agent.id": String(agent_id) } });

    const timeRange = buildTimeRange(start, end);
    if (timeRange) filter.push(timeRange);

    console.log(
      `>>> FETCH: agent=${agent_id || "all"} page=${page} size=${size} range=${rangeKey} start=${start} end=${end}`
    );

    const requestBody = {
      track_total_hits: true,
      query: {
        bool: {
          must: [{ match: { "rule.groups": "syscheck" } }],
          should: [
            { term: { "rule.id": "100601" } },
            { match_phrase: { "rule.description": "[Judol Injection]" } },
            { term: { "location": "syscheck" } },
          ],
          minimum_should_match: 1,
          filter,
        },
      },
      sort: [{ "@timestamp": { order: "desc", unmapped_type: "date" } }],
      from,
      size,
    };

    const response = await postToIndexer(requestBody);

    const hitsObject = response?.data?.hits || {};
    const totalHits =
      typeof hitsObject.total === "object"
        ? hitsObject.total.value
        : Number(hitsObject.total || 0);

    const eventsData = (hitsObject.hits || []).map((hit) => mapWazuhHit(hit));

    return res.json({
      success: true,
      data: eventsData,
      total_hits: totalHits,
      current_page: page,
      total_pages: Math.ceil(totalHits / size) || 1,
      page_size: size,
      applied_range: { rangeKey, start, end },
    });
  } catch (error) {
    console.error("❌ API ERROR:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function handleDomainSummaryRequest(req, res) {
  try {
    const agent_id_param = req.params.agent_id;
    const agent_id = agent_id_param === "all" || !agent_id_param ? undefined : agent_id_param;
    const rangeKey = String(req.query.range || "30d").trim();
    const size = Math.min(Math.max(parseInt(req.query.size, 10) || 1000, 1), 5000);
    let { start, end } = req.query;

    if (!start && !end) {
      const preset = buildPresetRange(rangeKey);
      start = preset.start;
      end = preset.end;
    }

    const filter = [];
    if (agent_id) filter.push({ term: { "agent.id": String(agent_id) } });

    const timeRange = buildTimeRange(start, end);
    if (timeRange) filter.push(timeRange);

    const requestBody = {
      track_total_hits: false,
      query: {
        bool: {
          must: [{ match: { "rule.groups": "syscheck" } }],
          should: [
            { exists: { field: "url.domain" } },
            { exists: { field: "url.full" } },
            { exists: { field: "data.url" } },
            { exists: { field: "data.domain" } },
            { exists: { field: "http.host" } },
            { exists: { field: "destination.domain" } },
            { exists: { field: "dns.question.name" } },
            { exists: { field: "extracted_urls" } },
            { wildcard: { "full_log": { value: "*http*", case_insensitive: true } } },
            { wildcard: { "message": { value: "*http*", case_insensitive: true } } },
          ],
          minimum_should_match: 1,
          filter,
        },
      },
      sort: [{ "@timestamp": { order: "desc", unmapped_type: "date" } }],
      size,
      _source: [
        "@timestamp",
        "data.url",
        "data.domain",
        "data.hostname",
        "url.full",
        "url.original",
        "url.domain",
        "http.host",
        "destination.domain",
        "dns.question.name",
        "extracted_urls",
        "full_log",
        "message",
      ],
    };

    const response = await postToIndexer(requestBody);

    const hits = response?.data?.hits?.hits || [];
    const counts = new Map();

    hits.forEach((hit) => {
      extractDomainsFromHit(hit).forEach((domain) => {
        counts.set(domain, (counts.get(domain) || 0) + 1);
      });
    });

    const domains = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    return res.json({
      success: true,
      data: domains,
      total: domains.length,
      applied_range: { rangeKey, start, end },
    });
  } catch (error) {
    console.error("Domain summary error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}
