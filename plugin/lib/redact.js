"use strict";
/**
 * Client-side secret redaction. This runs on the HOST, inside the hook scripts,
 * BEFORE anything is sent to the relay — so raw secrets never leave the machine.
 * Deny-by-default on sensitive paths/commands, aggressive pattern scrubbing on
 * every outgoing string, and hard size caps. Zero dependencies on purpose.
 */

const MAX_FIELD = 8 * 1024; // cap any single field before egress

// Patterns applied to every outgoing string, in order (most specific first).
const SECRET_PATTERNS = [
  // PEM private key blocks
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, "[redacted key]"],
  // JWTs (three base64url segments)
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[redacted]"],
  // AWS access key id
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]"],
  // Provider-prefixed keys: sk-/rk-, ghp_/gho_/github_pat_, slack xox*
  [/\b(?:sk|rk)-[A-Za-z0-9]{16,}\b/g, "[redacted]"],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, "[redacted]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[redacted]"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[redacted]"],
  // Authorization: Bearer <token>
  [/Bearer\s+[A-Za-z0-9._\-]{16,}/g, "Bearer [redacted]"],
  // KEY=value / TOKEN: value style assignments (keep the name, drop the value)
  [
    /\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL)[A-Za-z0-9_]*)\s*([=:])\s*(?:"[^"]{4,}"|'[^']{4,}'|[^\s"']{4,})/gi,
    "$1$2[redacted]",
  ],
];

function scrubSecrets(text) {
  if (typeof text !== "string" || text.length === 0) return text;
  let out = text;
  for (const [re, replacement] of SECRET_PATTERNS) out = out.replace(re, replacement);
  return out;
}

// Paths whose contents should never be streamed.
const SENSITIVE_PATH = [
  /(^|\/|~)\.env(\.|$)/i,
  /\.ssh(\/|$)/i,
  /\.aws(\/|$)/i,
  /\.gnupg(\/|$)/i,
  /\bid_rsa\b/i,
  /\bid_ed25519\b/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.key$/i,
  /(^|\/)secrets?(\/|\.|$)/i,
  /(^|\/)credentials(\/|$|\.)/i,
  /\.git\/config$/i,
  /\.netrc$/i,
  /\.npmrc$/i,
  /\.pypirc$/i,
];

function isSensitivePath(p) {
  if (typeof p !== "string") return false;
  return SENSITIVE_PATH.some((re) => re.test(p));
}

// Commands that read secrets or dump the environment.
function sensitiveCommand(cmd) {
  if (typeof cmd !== "string") return false;
  if (/(^|\s|;|&|\|)(env|printenv|set)(\s|$|;)/i.test(cmd)) return true;
  return cmd.split(/[\s=:'"]+/).some((tok) => tok && isSensitivePath(tok));
}

function truncate(text, max = MAX_FIELD) {
  if (typeof text !== "string" || text.length <= max) return text;
  return text.slice(0, max) + ` …[truncated]`;
}

/**
 * Redact one event's payload before it leaves the host. Applies the generic
 * scrub+truncate to every string field, then deny-lists sensitive tool
 * commands/paths entirely.
 */
function redactEvent(kind, payload) {
  const out = {};
  for (const [k, v] of Object.entries(payload || {})) {
    out[k] = typeof v === "string" ? scrubSecrets(truncate(v)) : v;
  }
  if (kind === "tool_call" && typeof payload.summary === "string") {
    if (sensitiveCommand(payload.summary) || isSensitivePath(payload.summary)) {
      out.summary = "[redacted: sensitive command]";
    }
  }
  if (kind === "tool_result" && sensitiveCommand(String(payload.summary || ""))) {
    out.output = "[redacted: sensitive command output]";
  }
  return out;
}

module.exports = { scrubSecrets, isSensitivePath, sensitiveCommand, truncate, redactEvent, MAX_FIELD };
