function maskEmail(email) {
  const [local = "", domain = ""] = String(email || "").split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

export function auditLog({ action, outcome = "success", actor, target, ip, details } = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    outcome,
    actor: actor?.email ? maskEmail(actor.email) : actor?.id || undefined,
    target: target?.email ? maskEmail(target.email) : target?.id || target,
    ip: ip || undefined,
    details: details || undefined,
  };

  console.log("[audit]", JSON.stringify(entry));
}
