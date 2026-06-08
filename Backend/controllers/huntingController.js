import { postToIndexer } from "../indexer.js";
import { buildTimeRange } from "../utils/time.js";

export async function handleHuntingRequest(req, res) {
  try {
    const {
      agent_id,
      agent_name,
      manager_name,
      group,
      rule_id,
      level_gte,
      level_lte,
      start,
      end,
      q,
      desc,
      page = 1,
      size = 100,
      sort = "desc",
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNum = Math.min(Math.max(parseInt(size, 10) || 50, 1), 500);
    const fromNum = (pageNum - 1) * sizeNum;

    const must = [];
    const filter = [];
    const should = [];

    const timeRange = buildTimeRange(start, end);
    if (timeRange) filter.push(timeRange);

    if (agent_id) filter.push({ term: { "agent.id": String(agent_id) } });
    if (agent_name) filter.push({ match: { "agent.name": String(agent_name) } });
    if (manager_name) filter.push({ match: { "manager.name": String(manager_name) } });
    if (group) filter.push({ match: { "rule.groups": String(group) } });

    if (rule_id) {
      should.push({ term: { "rule.id": rule_id } });
      should.push({ match: { "rule.id": String(rule_id) } });
    }

    const levelRange = {};
    if (level_gte !== undefined && level_gte !== "") levelRange.gte = Number(level_gte);
    if (level_lte !== undefined && level_lte !== "") levelRange.lte = Number(level_lte);
    if (Object.keys(levelRange).length) filter.push({ range: { "rule.level": levelRange } });

    if (desc && String(desc).trim()) {
      const raw = String(desc).trim();
      const shouldDesc = [];

      shouldDesc.push({
        multi_match: {
          query: raw,
          type: "best_fields",
          operator: "or",
          fuzziness: "AUTO",
          fields: ["rule.description^3"],
        },
      });

      shouldDesc.push(
        { prefix: { "rule.description": raw.toLowerCase() } },
        { prefix: { "rule.description.keyword": raw } }
      );

      const escForQS = raw.replace(/[+\-=&|<>!(){}\[\]^"~*?:\\/]/g, "\\$&");
      shouldDesc.push({
        query_string: {
          query: `${escForQS}*`,
          fields: ["rule.description"],
          default_operator: "and",
          lenient: true,
        },
      });

      shouldDesc.push(
        { wildcard: { "rule.description": { value: `*${raw}*`, case_insensitive: true } } },
        { wildcard: { "rule.description.keyword": { value: `*${raw}*`, case_insensitive: true } } }
      );

      must.push({ bool: { should: shouldDesc, minimum_should_match: 1 } });
    }

    if (q && String(q).trim()) {
      const qs = String(q).trim();
      must.push({
        simple_query_string: {
          query: qs,
          default_operator: "and",
          lenient: true,
          fields: [
            "rule.description^3",
            "full_log",
            "data.*",
            "agent.name",
            "agent.id",
            "manager.name",
            "rule.id",
            "rule.groups",
            "rule.mitre.*",
          ],
        },
      });
    }

    let boolQuery = { must, filter };
    if (should.length) {
      boolQuery.should = should;
      boolQuery.minimum_should_match = 1;
    }

    const queryPayload = {
      track_total_hits: true,
      query: must.length || filter.length || should.length ? { bool: boolQuery } : { match_all: {} },
      sort: [{ "@timestamp": { order: sort === "asc" ? "asc" : "desc" } }],
      from: fromNum,
      size: sizeNum,
    };

    const response = await postToIndexer(queryPayload);

    const hits = response?.data?.hits?.hits || [];
    const total =
      typeof response?.data?.hits?.total === "number"
        ? response.data.hits.total
        : response?.data?.hits?.total?.value || hits.length;

    const rows = hits.map((hit) => {
      const s = hit._source || {};
      return {
        id: hit._id,
        timestamp: s["@timestamp"],
        agentId: s.agent?.id || "-",
        agentName: s.agent?.name || "-",
        managerName: s.manager?.name || "-",
        ruleId: s.rule?.id ?? "-",
        ruleLevel: s.rule?.level ?? "-",
        ruleDescription: s.rule?.description || "-",
        groups: s.rule?.groups || [],
        location: s.location || s.decoder?.name || "-",
        fullLog: s.full_log || null,
      };
    });

    res.json({
      success: true,
      page: pageNum,
      size: sizeNum,
      total,
      data: rows,
      debug: { query: queryPayload },
    });
  } catch (error) {
    const detail = error?.response?.data || null;
    console.error(
      "Error /api/hunting:",
      error.message,
      detail ? JSON.stringify(detail).slice(0, 500) : ""
    );
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data hunting dari Indexer",
      error: error.message,
    });
  }
}
