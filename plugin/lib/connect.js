"use strict";
/**
 * Self-contained "connect token" (v0.2). Encodes the relay URL together with a
 * join code so `npx choircode join <token>` needs no prior config. Format:
 *
 *   choir1_<base64url("<relayUrl>|<roomId>-<inviteId>")>
 *
 * Opaque on purpose (reads as a paste-only code, not a clickable URL). The bare
 * "<roomId>-<inviteId>" form still works for already-configured teammates.
 *
 * NOTE: this file is duplicated verbatim in cli/lib/connect.js — the host mints
 * tokens with this copy, the viewer reads them with the cli copy, so they MUST
 * stay byte-identical (guarded by cli/test/connect.test.mjs).
 */

const PREFIX = "choir1_";

function encodeConnect(relay, code) {
  const clean = String(relay || "").replace(/\/+$/, "");
  return PREFIX + Buffer.from(`${clean}|${code}`, "utf8").toString("base64url");
}

function decodeConnect(token) {
  if (typeof token !== "string" || !token.startsWith(PREFIX)) return null;
  let payload;
  try {
    payload = Buffer.from(token.slice(PREFIX.length), "base64url").toString("utf8");
  } catch {
    return null;
  }
  const sep = payload.indexOf("|");
  if (sep < 0) return null;
  const relay = payload.slice(0, sep);
  const code = payload.slice(sep + 1);
  if (!relay || !code) return null;
  const dash = code.indexOf("-");
  return {
    relay,
    code,
    roomId: dash >= 0 ? code.slice(0, dash) : code,
    inviteId: dash >= 0 ? code.slice(dash + 1) : "",
  };
}

module.exports = { encodeConnect, decodeConnect };
