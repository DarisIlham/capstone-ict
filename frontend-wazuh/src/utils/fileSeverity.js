export const FILE_SEVERITY_ORDER = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
};

const NUMERIC_SEVERITY_RULES = [
  { min: 12, severity: "CRITICAL" },
  { min: 8, severity: "HIGH" },
  { min: 5, severity: "MEDIUM" },
  { min: 1, severity: "LOW" },
];

const NON_CODE_FILE_TYPES = new Set([
  "archive",
  "audio",
  "document",
  "image",
  "media",
  "pdf",
  "video",
]);

const CRITICAL_PATTERNS = [
  /combo/i,
  /web_?shell/i,
  /reverse_?shell/i,
  /meterpreter/i,
  /mimikatz/i,
  /ransom/i,
  /credential/i,
  /malware/i,
  /trojan/i,
  /dropper/i,
];

const HIGH_PATTERNS = [
  /eval/i,
  /exec/i,
  /shell/i,
  /php_?open_?tag/i,
  /file_get_contents_remote/i,
  /remote_?loader/i,
  /system\s*\(/i,
  /passthru/i,
  /proc_open/i,
  /popen/i,
  /assert\s*\(/i,
  /base64_decode/i,
  /powershell/i,
  /cmd\.exe/i,
  /curl_exec/i,
  /wget/i,
];

const MEDIUM_PATTERNS = [
  /remote_?url/i,
  /short_?url/i,
  /iframe/i,
  /script_?tag/i,
  /obfus/i,
  /encoded/i,
  /suspicious/i,
  /hacked\s+by/i,
  /defaced\s+by/i,
  /owned\s+by/i,
  /pwned/i,
  /security\s+breach/i,
  /slot/i,
  /togel/i,
  /casino/i,
  /judi/i,
  /gacor/i,
  /jackpot/i,
  /sbobet/i,
  /pragmatic/i,
  /rtp/i,
  /link\s+alternatif/i,
  /situs\s+slot/i,
];

const LOW_PATTERNS = [
  /url/i,
  /https?:\/\//i,
  /domain/i,
  /email/i,
  /metadata/i,
  /comment/i,
  /author/i,
  /copyright/i,
  /external_?link/i,
  /href/i,
  /keyword/i,
  /string/i,
];

function clampScore(score) {
  return Math.min(Math.max(score, FILE_SEVERITY_ORDER.INFO), FILE_SEVERITY_ORDER.CRITICAL);
}

function severityFromScore(score) {
  const normalized = clampScore(score);
  return Object.entries(FILE_SEVERITY_ORDER).find(([, value]) => value === normalized)?.[0] || "LOW";
}

function scoreFromSeverity(severity) {
  return FILE_SEVERITY_ORDER[severity] ?? FILE_SEVERITY_ORDER.LOW;
}

function getStringValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function joinSignalText(...values) {
  return values.map(getStringValue).filter(Boolean).join(" ");
}

function getNumericSeverity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  return NUMERIC_SEVERITY_RULES.find((rule) => numeric >= rule.min)?.severity || "INFO";
}

export function normalizeFileSeverity(value, fallback = "HIGH") {
  if (value === undefined || value === null || value === "") return fallback;

  const numericSeverity = getNumericSeverity(value);
  if (numericSeverity) return numericSeverity;

  const severity = String(value).trim().toUpperCase();
  return FILE_SEVERITY_ORDER[severity] !== undefined ? severity : fallback;
}

function getExplicitFindingSeverity(finding = {}) {
  return normalizeFileSeverity(
    finding.severity ?? finding.risk ?? finding.level ?? finding.ruleLevel ?? finding.rule_level,
    null
  );
}

function getExplicitFileSeverity(item = {}) {
  return normalizeFileSeverity(
    item.severity ?? item.risk ?? item.level ?? item.ruleLevel ?? item.rule_level,
    null
  );
}

function isNonCodeCarrier(item = {}) {
  const type = getStringValue(item.fileType || item.file_type).toLowerCase();
  const fileName = getStringValue(item.fileName || item.file_name || item.filePath || item.file_path).toLowerCase();

  if (NON_CODE_FILE_TYPES.has(type)) return true;
  return /\.(avif|bmp|gif|ico|jpe?g|mp3|mp4|pdf|png|svg|webp|zip)$/i.test(fileName);
}

function hasAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function findingsLooksExecutable(text) {
  return hasAnyPattern(text, HIGH_PATTERNS) || hasAnyPattern(text, CRITICAL_PATTERNS);
}

function looksLikeContentIndicator(finding = {}) {
  const typeText = joinSignalText(
    finding.type,
    finding.category,
    finding.source,
    finding.source_type,
    finding.sourceType,
    finding.field
  ).toLowerCase();

  return /content|keyword|indicator|pattern|scanner/.test(typeText);
}

function getFindingBaseScore(finding = {}, item = {}) {
  const text = joinSignalText(
    finding.name,
    finding.indicator,
    finding.pattern,
    finding.keyword,
    finding.type,
    finding.category,
    finding.source,
    finding.source_type,
    finding.field,
    finding.description,
    finding.desc,
    finding.message,
    finding.match,
    finding.value,
    finding.sample
  );

  const hasLowSignal = hasAnyPattern(text, LOW_PATTERNS);
  const hasMediumSignal = hasAnyPattern(text, MEDIUM_PATTERNS);
  const hasHighSignal = hasAnyPattern(text, HIGH_PATTERNS);
  const hasCriticalSignal = hasAnyPattern(text, CRITICAL_PATTERNS);

  let score =
    text && looksLikeContentIndicator(finding) && !hasLowSignal
      ? FILE_SEVERITY_ORDER.MEDIUM
      : FILE_SEVERITY_ORDER.LOW;

  if (hasMediumSignal) score = Math.max(score, FILE_SEVERITY_ORDER.MEDIUM);
  if (hasHighSignal) score = Math.max(score, FILE_SEVERITY_ORDER.HIGH);
  if (hasCriticalSignal) score = Math.max(score, FILE_SEVERITY_ORDER.CRITICAL);

  const matchCount = Number(finding.match_count ?? finding.matchCount ?? finding.count ?? 0);
  if (matchCount >= 10) score = FILE_SEVERITY_ORDER.CRITICAL;
  else if (matchCount >= 6) score = Math.max(score, FILE_SEVERITY_ORDER.HIGH);
  else if (matchCount >= 3) score += 1;

  const sourceType = getStringValue(finding.source_type || finding.sourceType).toLowerCase();
  if (
    sourceType === "metadata" &&
    isNonCodeCarrier(item) &&
    score >= FILE_SEVERITY_ORDER.MEDIUM &&
    findingsLooksExecutable(text)
  ) {
    score = Math.max(score, FILE_SEVERITY_ORDER.HIGH);
  }

  return clampScore(score);
}

export function inferFindingSeverity(finding = {}, item = {}) {
  const explicitSeverity = getExplicitFindingSeverity(finding);
  if (explicitSeverity) return explicitSeverity;

  return severityFromScore(getFindingBaseScore(finding, item));
}

function getFallbackScoreFromCount(findingsCount) {
  if (findingsCount >= 6) return FILE_SEVERITY_ORDER.CRITICAL;
  if (findingsCount >= 4) return FILE_SEVERITY_ORDER.HIGH;
  if (findingsCount >= 2) return FILE_SEVERITY_ORDER.MEDIUM;
  if (findingsCount >= 1) return FILE_SEVERITY_ORDER.LOW;
  return FILE_SEVERITY_ORDER.LOW;
}

export function inferFileSeverity(item = {}, normalizedFindings = null) {
  const explicitSeverity = getExplicitFileSeverity(item);
  if (explicitSeverity) return explicitSeverity;

  const findings = Array.isArray(normalizedFindings)
    ? normalizedFindings
    : Array.isArray(item.findings)
      ? item.findings
      : [];
  const findingsCount = Number(item.findingsCount ?? item.findings_count ?? findings.length ?? 0);
  const matchedSourcesCount = Number(item.matchedSourcesCount ?? item.matched_sources_count ?? 0);

  if (!findings.length) {
    return severityFromScore(getFallbackScoreFromCount(findingsCount));
  }

  let score = findings.reduce((max, finding) => {
    const severity = normalizeFileSeverity(
      finding?.severity ?? finding?.risk ?? finding?.level,
      inferFindingSeverity(finding, item)
    );
    return Math.max(max, scoreFromSeverity(severity));
  }, FILE_SEVERITY_ORDER.LOW);

  if (findingsCount >= 6) score = Math.max(score, FILE_SEVERITY_ORDER.CRITICAL);
  else if (findingsCount >= 4) score = Math.max(score, FILE_SEVERITY_ORDER.HIGH);
  else if (findingsCount >= 2) score = Math.max(score, FILE_SEVERITY_ORDER.MEDIUM);

  if (matchedSourcesCount >= 3) score += 1;

  return severityFromScore(score);
}
