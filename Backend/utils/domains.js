export function normalizeDomainCandidate(value) {
  if (!value) return null;

  let domain = String(value).trim().toLowerCase();
  if (!domain) return null;

  domain = domain
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/^\/\//, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");

  if (!domain || domain === "localhost") return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) return null;

  return domain;
}

export function extractDomainsFromText(input) {
  const text = String(input || "");
  if (!text) return [];

  const domains = new Set();
  const matches = text.match(
    /\b(?:https?:\/\/|wss?:\/\/|ftp:\/\/|www\.)[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/[^\s"'<>]*)?/gi
  ) || [];

  matches.forEach((match) => {
    const normalized = normalizeDomainCandidate(match);
    if (normalized) domains.add(normalized);
  });

  return Array.from(domains);
}

export function collectDomainCandidates(source) {
  return [
    source?.data?.url,
    source?.data?.domain,
    source?.data?.hostname,
    source?.url?.full,
    source?.url?.original,
    source?.url?.domain,
    source?.http?.host,
    source?.destination?.domain,
    source?.dns?.question?.name,
    source?.extracted_urls,
    source?.full_log,
    source?.message,
  ];
}

export function extractDomainsFromHit(hit) {
  const source = hit?._source || {};
  const candidates = collectDomainCandidates(source);
  const domains = new Set();

  candidates.forEach((candidate) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => {
        const normalized = normalizeDomainCandidate(item);
        if (normalized) domains.add(normalized);

        extractDomainsFromText(item).forEach((domain) => domains.add(domain));
      });
      return;
    }

    const normalized = normalizeDomainCandidate(candidate);
    if (normalized) domains.add(normalized);

    extractDomainsFromText(candidate).forEach((domain) => domains.add(domain));
  });

  return Array.from(domains);
}
