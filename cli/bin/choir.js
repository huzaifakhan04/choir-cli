#!/usr/bin/env node
"use strict";
/**
 * `choir-cli` — the Choir viewer/steerer. Join a shared Claude Code session by
 * code, replay its history, then tail it live in your terminal. With a
 * suggest/write scope you can also send steering messages back to the host.
 */
const os = require("os");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const pc = require("picocolors");
const WebSocket = require("ws");
const { createRenderer } = require("../lib/render");
const { decodeConnect } = require("../lib/connect");

function configFilePath() {
  return path.join(os.homedir(), ".config", "choir", "config.json");
}
function readConfigFile() {
  try {
    return JSON.parse(fs.readFileSync(configFilePath(), "utf8"));
  } catch {
    return {};
  }
}
function writeConfigFile(obj) {
  const p = configFilePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
function stripSlash(u) {
  return typeof u === "string" ? u.replace(/\/+$/, "") : u;
}
function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function resolveRelay() {
  return stripSlash(argVal("--relay") || process.env.CHOIR_RELAY_URL || readConfigFile().relayUrl || "");
}
function resolveName() {
  return (
    argVal("--name") ||
    process.env.CHOIR_NAME ||
    readConfigFile().name ||
    (os.userInfo().username || "guest")
  );
}
// Resolve a join argument to {relay, roomId, inviteId}. Supports the v0.2
// self-contained connect token (relay embedded) and the bare v0.1 code
// (relay comes from --relay / config).
function resolveTarget(codeArg) {
  const parsed = decodeConnect(codeArg);
  if (parsed) return { relay: parsed.relay, roomId: parsed.roomId, inviteId: parsed.inviteId };
  const dash = codeArg.indexOf("-");
  return {
    relay: resolveRelay(),
    roomId: dash >= 0 ? codeArg.slice(0, dash) : codeArg,
    inviteId: dash >= 0 ? codeArg.slice(dash + 1) : "",
  };
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

function usage() {
  console.log(`choir — join a live Claude Code session your team is sharing.

Usage:
  choir join <code> [--name <you>] [--relay <url>]     watch & steer a shared session
  choir take <code> --name <you>                       accept a handoff
  choir config --relay <url> [--team-key <key>] [--name <you>]
  choir help

No install needed: run any command as \`npx choir-cli …\` instead of \`choir …\`,
or \`npm i -g choir-cli\` once to get the \`choir\` command on your PATH.

The <code> is what the host's /choir:share prints — it's self-contained
(the relay is baked in), so nothing else is needed to join. A short
roomId-inviteId code also works once you've set --relay or run \`config\`.`);
}

function cmdConfig() {
  const cfg = readConfigFile();
  const relay = argVal("--relay");
  if (relay) cfg.relayUrl = stripSlash(relay);
  const teamKey = argVal("--team-key");
  if (teamKey) cfg.teamKey = teamKey;
  const name = argVal("--name");
  if (name) cfg.name = name;
  writeConfigFile(cfg);
  console.log(`Saved ${configFilePath()}`);
}

async function cmdJoin(code) {
  if (!code) {
    console.error("Missing join code. Usage: npx choir-cli join <code>");
    process.exit(1);
  }
  const { relay, roomId, inviteId } = resolveTarget(code);
  if (!relay) {
    console.error("No relay set. Use the full join code from /choir:share, or pass --relay <url>.");
    process.exit(1);
  }
  const name = resolveName();

  const red = await postJson(`${relay}/sessions/${roomId}/redeem`, { inviteId, name });
  if (!red.ok || !red.json || !red.json.token) {
    console.error(`Could not join (status ${red.status}). Check the code and that the relay is reachable.`);
    process.exit(1);
  }
  const token = red.json.token;
  const scope = red.json.scope || "view";

  const renderer = createRenderer();
  const ws = new WebSocket(relay.replace(/^http/, "ws") + `/sessions/${roomId}`);
  console.log(pc.dim(`Connecting to ${roomId} as ${name} (${scope})…`));

  ws.on("open", () => ws.send(JSON.stringify({ type: "hello", token, since: 0 })));
  ws.on("message", (data) => {
    let frame;
    try {
      frame = JSON.parse(data.toString());
    } catch {
      return;
    }
    switch (frame.type) {
      case "welcome":
        console.log(`${pc.green(`● joined ${roomId}`)}  ${renderer.formatRoster(frame.presence)}`);
        console.log(
          pc.dim(scope === "view" ? "(watching — read only)" : "(type a line + Enter to steer · /who · /quit)"),
        );
        break;
      case "event": {
        const line = renderer.handleEvent(frame.event);
        if (line != null) process.stdout.write(line + "\n");
        break;
      }
      case "presence":
        process.stdout.write(renderer.formatRoster(frame.roster) + "\n");
        break;
      case "error":
        console.error(pc.red(`relay: ${frame.message}`));
        process.exit(1);
    }
  });
  ws.on("close", () => {
    console.log(pc.dim("— disconnected —"));
    process.exit(0);
  });
  ws.on("error", (e) => {
    console.error(pc.red(`connection error: ${e.message}`));
    process.exit(1);
  });

  if (scope !== "view") {
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on("line", (line) => {
      const t = line.trim();
      if (!t) return;
      if (t === "/quit") return ws.close();
      if (t === "/who") return ws.send(JSON.stringify({ type: "presence" }));
      const text = t.startsWith("/steer ") ? t.slice(7) : t;
      ws.send(JSON.stringify({ type: "steer", text }));
      console.log(pc.magenta(`↦ you steered: ${text}`));
    });
  }
}

function dataDir() {
  return process.env.CHOIR_DATA_DIR || path.join(os.homedir(), ".choir");
}

async function cmdTake(code) {
  if (!code) {
    console.error("Missing join code. Usage: npx choir-cli take <code> --name <you>");
    process.exit(1);
  }
  const { relay, roomId, inviteId } = resolveTarget(code);
  if (!relay) {
    console.error("No relay set. Use the full join code from /choir:share, or pass --relay <url>.");
    process.exit(1);
  }
  const name = resolveName();

  const red = await postJson(`${relay}/sessions/${roomId}/redeem`, { inviteId, name });
  if (!red.ok || !red.json || !red.json.token) {
    console.error(`Could not authenticate to the session (status ${red.status}).`);
    process.exit(1);
  }
  const res = await fetch(`${relay}/sessions/${roomId}/take`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${red.json.token}` },
    body: JSON.stringify({ name }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.token) {
    console.error(`Could not take the handoff (status ${res.status}). ${(json && json.message) || ""}`);
    console.error(`(The host must run /choir:handoff ${name} first.)`);
    process.exit(1);
  }

  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "pending-handoff.json"),
    JSON.stringify({ roomId, relayUrl: relay, hostToken: json.token, name, bundle: json.bundle || "" }),
    { mode: 0o600 },
  );

  console.log(`\n${pc.green("✅ You now hold the session.")} Context bundle:\n`);
  console.log(json.bundle || "(no context captured yet)");
  console.log(
    `\nNext: start Claude Code in this repo and run ${pc.bold("/choir:take-handoff")} to load this context and continue as the driver.\n`,
  );
  process.exit(0);
}

(async () => {
  const cmd = process.argv[2];
  const positional = process.argv[3] && !process.argv[3].startsWith("-") ? process.argv[3] : undefined;
  if (cmd === "join") return cmdJoin(positional);
  if (cmd === "take") return cmdTake(positional);
  if (cmd === "config") return cmdConfig();
  return usage();
})();
