"use strict";
/**
 * Host-side config resolution for the plugin's hook scripts. Precedence:
 * environment variables > ~/.config/choir/config.json. Also manages the
 * per-session token cache so most hooks avoid a network round-trip.
 * Zero dependencies.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

function stripSlash(u) {
  return typeof u === "string" ? u.replace(/\/+$/, "") : u;
}

function resolveConfig(env, fileConfig) {
  env = env || {};
  fileConfig = fileConfig || {};
  const relayUrl = env.CHOIR_RELAY_URL || fileConfig.relayUrl || null;
  const teamKey = env.CHOIR_TEAM_KEY || fileConfig.teamKey || null;
  const name = env.CHOIR_NAME || fileConfig.name || null;
  return {
    relayUrl: relayUrl ? stripSlash(relayUrl) : null,
    teamKey: teamKey || null,
    name: name || null,
  };
}

function configFilePath() {
  return path.join(os.homedir(), ".config", "choir", "config.json");
}

function readConfigFile(p) {
  try {
    return JSON.parse(fs.readFileSync(p || configFilePath(), "utf8"));
  } catch {
    return {};
  }
}

function loadConfig(env) {
  return resolveConfig(env || process.env, readConfigFile());
}

// ---- per-session token cache -----------------------------------------------
// A fixed, stable data dir (~/.choir) that both the share command and the hook
// scripts resolve identically, independent of plugin template-var substitution.

function resolveDataDir(env) {
  env = env || process.env;
  return env.CHOIR_DATA_DIR || path.join(os.homedir(), ".choir");
}

function sessionCacheFile(dataDir, sessionId) {
  return path.join(dataDir, "sessions", `${sessionId}.json`);
}

function readSessionCache(dataDir, sessionId) {
  try {
    return JSON.parse(fs.readFileSync(sessionCacheFile(dataDir, sessionId), "utf8"));
  } catch {
    return null;
  }
}

function writeSessionCache(dataDir, sessionId, data) {
  const file = sessionCacheFile(dataDir, sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
}

module.exports = {
  resolveConfig,
  loadConfig,
  configFilePath,
  readConfigFile,
  resolveDataDir,
  sessionCacheFile,
  readSessionCache,
  writeSessionCache,
};
