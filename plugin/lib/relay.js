"use strict";
/**
 * Minimal HTTP client for the relay, used by the hook scripts. Uses the global
 * fetch (Node 18+). Short timeout and drop-don't-throw semantics: a slow or
 * unreachable relay must never block or crash the host's Claude Code session.
 */

async function request(method, url, { body, token, timeoutMs = 3000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, json: null, error: String(e) };
  } finally {
    clearTimeout(timer);
  }
}

const postJson = (url, body, opts = {}) => request("POST", url, { ...opts, body });
const getJson = (url, opts = {}) => request("GET", url, opts);

module.exports = { request, postJson, getJson };
