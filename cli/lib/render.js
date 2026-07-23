"use strict";
/**
 * Turns the session event stream into terminal lines. Stateful only for
 * assistant_text: MessageDisplay arrives as deltas keyed by messageId, so we
 * buffer per message and emit one line when the message is final. Colors are
 * auto-disabled by picocolors when stdout isn't a TTY (e.g. in tests/pipes).
 */
const pc = require("picocolors");

function oneLine(s) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
}
function clip(s, n) {
  s = String(s == null ? "" : s);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function createRenderer() {
  const buffers = new Map(); // messageId -> accumulated text

  function handleEvent(event) {
    const { kind, actor } = event;
    const p = event.payload || {};
    switch (kind) {
      case "session_start": {
        const where = p.cwd ? ` in ${p.cwd}` : "";
        const branch = p.branch ? ` (${p.branch})` : "";
        return pc.dim(`— session started${where}${branch} —`);
      }
      case "prompt":
        return `${pc.bold(pc.cyan(`👤 ${actor}`))}  ${clip(oneLine(p.text), 400)}`;
      case "tool_call":
        return `${pc.yellow("▶")} ${pc.bold(p.tool || "tool")}  ${pc.dim(clip(oneLine(p.summary), 140))}`;
      case "tool_result":
        return `  ${p.ok ? pc.green("✔") : pc.red("✘")} ${pc.dim(clip(oneLine(p.output), 140))}`;
      case "tool_error":
        return `  ${pc.red(`✘ ${clip(oneLine(p.output), 140)}`)}`;
      case "assistant_text": {
        const id = p.messageId || "_";
        const text = (buffers.get(id) || "") + (p.text || "");
        if (p.final) {
          buffers.delete(id);
          return `${pc.green("🤖")} ${clip(oneLine(text), 600)}`;
        }
        buffers.set(id, text);
        return null; // still streaming; wait for final
      }
      case "steer_injected":
        return `${pc.magenta(`↪ ${p.from || "teammate"} steered:`)} ${clip(oneLine(p.text), 240)}`;
      case "notification":
        return pc.dim(`🔔 ${clip(oneLine(p.text), 160)}`);
      case "turn_end":
        return pc.dim("─".repeat(24));
      case "handoff":
        return pc.magenta(`⇄ ${p.from || "host"} handed off to ${p.to || "teammate"}`);
      case "session_end":
        return pc.dim("— session ended —");
      default:
        return null;
    }
  }

  function formatRoster(roster) {
    if (!Array.isArray(roster) || roster.length === 0) return pc.dim("👥 (nobody yet)");
    const who = roster
      .map((m) =>
        m.isWriter
          ? pc.bold(pc.green(`${m.name} ✍`))
          : `${m.name}${m.scope && m.scope !== "view" ? pc.dim(`(${m.scope})`) : ""}`,
      )
      .join(", ");
    return pc.dim(`👥 ${who}`);
  }

  return { handleEvent, formatRoster };
}

module.exports = { createRenderer, oneLine, clip };
