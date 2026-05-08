import { DEFACE_KEYWORDS, JUDOL_KEYWORDS } from "../constants/securityKeywords.js";

const PAGE_FETCH_TIMEOUT_MS = 12000;
const MAX_CRAWL_PAGES = 25;
const NON_HTML_EXTENSIONS = /\.(?:jpg|jpeg|png|gif|svg|webp|ico|pdf|zip|rar|7z|mp4|mp3|wav|css|js|xml|json)$/i;

function normalizeEndpoint(endpoint = "") {
  const trimmed = String(endpoint).trim();
  if (!trimmed) {
    throw new Error("Endpoint kosong");
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function extractTitle(html = "") {
  return (
    html
      .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() || "-"
  );
}

function extractDescription(html = "") {
  return (
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i
    )?.[1]?.trim() ||
    html.match(
      /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i
    )?.[1]?.trim() ||
    "-"
  );
}

function extractContext(text, keyword, maxContexts = 3) {
  const contexts = [];
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  let startIndex = 0;

  while (contexts.length < maxContexts) {
    const index = lowerText.indexOf(lowerKeyword, startIndex);
    if (index === -1) break;

    const start = Math.max(0, index - 70);
    const end = Math.min(text.length, index + keyword.length + 70);
    const context = text.slice(start, end).replace(/\s+/g, " ").trim();
    contexts.push(`...${context}...`);
    startIndex = index + keyword.length;
  }

  return contexts;
}

function scanContent(html, keywords, pageUrl) {
  const cleanText = String(html || "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  const lowerText = cleanText.toLowerCase();

  return keywords
    .map((keyword) => {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "gi");
      const matches = lowerText.match(regex);

      return {
        keyword,
        count: matches?.length || 0,
        context: matches?.length
          ? extractContext(cleanText, keyword).map((item) => `[${pageUrl}] ${item}`)
          : [],
      };
    })
    .filter((result) => result.count > 0)
    .sort((a, b) => b.count - a.count);
}

function getKeywordsByType(type = "all") {
  if (type === "judol") return JUDOL_KEYWORDS;
  if (type === "deface") return DEFACE_KEYWORDS;
  return [...JUDOL_KEYWORDS, ...DEFACE_KEYWORDS];
}

function normalizeCrawlUrl(rawUrl, origin) {
  try {
    const url = new URL(rawUrl, origin);
    url.hash = "";

    if (url.origin !== origin) return null;
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (NON_HTML_EXTENSIONS.test(url.pathname)) return null;

    const normalizedPath = url.pathname.endsWith("/") && url.pathname !== "/"
      ? url.pathname.slice(0, -1)
      : url.pathname;

    return `${url.origin}${normalizedPath}${url.search}`;
  } catch {
    return null;
  }
}

function extractInternalLinks(html, origin) {
  const links = new Set();
  const hrefRegex = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = String(match[1] || "").trim();
    if (!href) continue;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;

    const normalized = normalizeCrawlUrl(href, origin);
    if (normalized) {
      links.add(normalized);
    }
  }

  return Array.from(links);
}

async function fetchHtmlPage(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": "UNDIPSecurityHTMLFetcher/1.0 (+https://undip.ac.id)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const html = await response.text();
    return {
      url,
      finalUrl: response.url,
      httpStatus: response.status,
      ok: response.ok,
      html,
      pageTitle: extractTitle(html),
      metaDescription: extractDescription(html),
      htmlSize: html.length,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function mergeScanResults(pageResults) {
  const merged = new Map();

  pageResults.forEach((result) => {
    const current = merged.get(result.keyword) || {
      keyword: result.keyword,
      count: 0,
      context: [],
    };

    current.count += result.count;
    current.context = current.context.concat(result.context).slice(0, 8);
    merged.set(result.keyword, current);
  });

  return Array.from(merged.values()).sort((a, b) => b.count - a.count);
}

async function crawlDomain(startUrl, keywords) {
  const rootPage = await fetchHtmlPage(startUrl);
  const origin = new URL(rootPage.finalUrl || startUrl).origin;
  const rootUrl = normalizeCrawlUrl(rootPage.finalUrl || startUrl, origin) || startUrl;

  const visited = new Set();
  const queue = [rootUrl];
  const pages = [];
  const failures = [];
  let rootSnapshot = rootPage;

  while (queue.length > 0 && pages.length < MAX_CRAWL_PAGES) {
    const currentUrl = queue.shift();
    if (!currentUrl || visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    try {
      const page = currentUrl === rootUrl && pages.length === 0
        ? rootPage
        : await fetchHtmlPage(currentUrl);

      if (currentUrl === rootUrl) {
        rootSnapshot = page;
      }

      const finalNormalized =
        normalizeCrawlUrl(page.finalUrl || currentUrl, origin) || currentUrl;

      if (!visited.has(finalNormalized)) {
        visited.add(finalNormalized);
      }

      const pageResults = scanContent(page.html, keywords, page.finalUrl || currentUrl);
      pages.push({
        url: page.finalUrl || currentUrl,
        httpStatus: page.httpStatus,
        ok: page.ok,
        pageTitle: page.pageTitle,
        metaDescription: page.metaDescription,
        htmlSize: page.htmlSize,
        results: pageResults,
      });

      extractInternalLinks(page.html, origin).forEach((link) => {
        if (!visited.has(link) && !queue.includes(link) && queue.length + pages.length < MAX_CRAWL_PAGES * 3) {
          queue.push(link);
        }
      });
    } catch (error) {
      failures.push({
        url: currentUrl,
        error: error instanceof Error ? error.message : "HTML fetch failed",
      });
    }
  }

  return {
    rootPage: rootSnapshot,
    pages,
    failures,
    aggregatedResults: mergeScanResults(pages.flatMap((page) => page.results)),
  };
}

export async function scanEndpointHtml({ endpoint, type = "all" }) {
  const startedAt = Date.now();

  try {
    const url = normalizeEndpoint(endpoint);
    const crawlResult = await crawlDomain(url, getKeywordsByType(type));
    const totalMatches = crawlResult.aggregatedResults.reduce(
      (sum, item) => sum + item.count,
      0
    );

    let status = "safe";
    if (!crawlResult.rootPage.ok || crawlResult.failures.length > 0) status = "review";
    if (totalMatches > 0) status = totalMatches >= 5 ? "detected" : "review";

    return {
      endpoint,
      requestedUrl: url,
      finalUrl: crawlResult.rootPage.finalUrl,
      type,
      detected: totalMatches > 0,
      status,
      httpStatus: crawlResult.rootPage.httpStatus,
      ok: crawlResult.rootPage.ok,
      pageTitle: crawlResult.rootPage.pageTitle,
      metaDescription: crawlResult.rootPage.metaDescription,
      htmlSize: crawlResult.rootPage.htmlSize,
      responseTimeMs: Date.now() - startedAt,
      totalMatches,
      keywordsFound: crawlResult.aggregatedResults.length,
      results: crawlResult.aggregatedResults.slice(0, 20),
      scannedPagesCount: crawlResult.pages.length,
      failedPagesCount: crawlResult.failures.length,
      scannedPages: crawlResult.pages.map((page) => ({
        url: page.url,
        httpStatus: page.httpStatus,
        pageTitle: page.pageTitle,
        matches: page.results.reduce((sum, item) => sum + item.count, 0),
      })),
      crawlLimit: MAX_CRAWL_PAGES,
      scannedAt: new Date().toISOString(),
      method: "internal_domain_crawl",
    };
  } catch (error) {
    return {
      detected: false,
      status: "review",
      error: error instanceof Error ? error.message : "HTML fetch failed",
      responseTimeMs: Date.now() - startedAt,
      scannedAt: new Date().toISOString(),
      method: "direct_html_fetch",
    };
  }
}
