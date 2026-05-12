// utils/esHelpers.js

export function unwrapEsResponse(response) {
  if (response && response.body) {
    return response.body;
  }
  return response;
}

export function getHits(response) {
  const data = unwrapEsResponse(response);
  return data?.hits?.hits || [];
}

export function getTotalHits(response) {
  const data = unwrapEsResponse(response);
  const total = data?.hits?.total;

  if (typeof total === "object") {
    return total.value || 0;
  }

  return total || 0;
}

export function getField(obj, path) {
  if (!obj) return null;

  if (Object.prototype.hasOwnProperty.call(obj, path)) {
    return obj[path];
  }

  const keys = path.split(".");
  let current = obj;

  for (const key of keys) {
    if (current == null || typeof current !== "object") {
      return null;
    }
    current = current[key];
  }

  return current ?? null;
}

export function exactMatchClause(field, value) {
  return {
    bool: {
      should: [
        { term: { [`${field}.keyword`]: value } },
        { term: { [field]: value } }
      ],
      minimum_should_match: 1
    }
  };
}

export function buildOptionalExactFilter(field, value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return exactMatchClause(field, value);
}

// Fungsi internal (tidak perlu dieksport jika hanya dipakai di sini)
function escapeWildcard(value = "") {
  return String(value).replace(/([\\*?])/g, "\\$1");
}

export function buildContainsClause(field, value) {
  if (!value || !String(value).trim()) {
    return null;
  }

  const trimmed = String(value).trim();
  const safe = escapeWildcard(trimmed);

  return {
    bool: {
      should: [
        {
          wildcard: {
            [`${field}.keyword`]: {
              value: `*${safe}*`,
              case_insensitive: true
            }
          }
        },
        {
          match_phrase: {
            [field]: trimmed
          }
        }
      ],
      minimum_should_match: 1
    }
  };
}

export function parseBoolean(value) {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return null;
}

export function addDateRange(must, start, end) {
  if (!start && !end) return;

  const range = {};
  if (start) range.gte = start;
  if (end) range.lte = end;

  must.push({
    range: {
      "@timestamp": range
    }
  });
}

export function normalizePagination(query = {}, options = {}) {
  const maxLimit = Math.max(parseInt(options.maxLimit || "100", 10), 1);
  const page = Math.max(parseInt(query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || "20", 10), 1), maxLimit);
  const from = (page - 1) * limit;

  return { page, limit, from };
}
