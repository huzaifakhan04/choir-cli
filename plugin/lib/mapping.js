"use strict";
/**
 * Pure mapping from a Claude Code hook payload to a Choir event. Field shapes
 * match Claude Code 2.1.205 (verified by capturing real hook stdin). Kept
 * dependency-free and side-effect-free so it can be unit tested directly.
 */

function summarizeToolInput(tool, input) {
  if (!input || typeof input !== "object") return tool || "";
  if (typeof input.command === "string") return input.command; // Bash
  if (typeof input.file_path === "string") return input.file_path; // Read/Write/Edit
  if (typeof input.path === "string") return input.path;
  if (typeof input.pattern === "string") return input.pattern; // Grep/Glob
  if (typeof input.url === "string") return input.url; // WebFetch
  if (typeof input.query === "string") return input.query; // WebSearch
  if (typeof input.description === "string") return input.description;
  try {
    return JSON.stringify(input).slice(0, 200);
  } catch {
    return tool || "";
  }
}

function summarizeToolResponse(resp) {
  if (resp == null) return "";
  if (typeof resp === "string") return resp;
  if (typeof resp.stdout === "string") return resp.stdout || resp.stderr || "(no output)";
  if (typeof resp.output === "string") return resp.output;
  try {
    return JSON.stringify(resp).slice(0, 4000);
  } catch {
    return "";
  }
}

function mapHookToEvent(input, hostName) {
  const host = hostName || "host";
  switch (input && input.hook_event_name) {
    case "UserPromptSubmit":
      return { kind: "prompt", actor: host, payload: { text: input.prompt || "" } };
    case "PreToolUse":
      return {
        kind: "tool_call",
        actor: "agent",
        payload: {
          tool: input.tool_name,
          summary: summarizeToolInput(input.tool_name, input.tool_input),
          toolUseId: input.tool_use_id,
        },
      };
    case "PostToolUse": {
      const resp = input.tool_response || {};
      const ok = !(resp.interrupted || resp.is_error || resp.isError);
      return {
        kind: "tool_result",
        actor: "agent",
        payload: {
          tool: input.tool_name,
          ok,
          output: summarizeToolResponse(resp),
          summary: summarizeToolInput(input.tool_name, input.tool_input),
          toolUseId: input.tool_use_id,
        },
      };
    }
    case "PostToolUseFailure":
      return {
        kind: "tool_error",
        actor: "agent",
        payload: {
          tool: input.tool_name,
          ok: false,
          output: input.tool_error || "tool failed",
          summary: summarizeToolInput(input.tool_name, input.tool_input),
          toolUseId: input.tool_use_id,
        },
      };
    case "MessageDisplay":
      return {
        kind: "assistant_text",
        actor: "agent",
        payload: {
          text: input.delta || "",
          messageId: input.message_id,
          index: input.index,
          final: !!input.final,
        },
      };
    case "Stop":
      return { kind: "turn_end", actor: "agent", payload: { last: input.last_assistant_message || "" } };
    case "SessionEnd":
      return { kind: "session_end", actor: host, payload: { reason: input.reason || "" } };
    default:
      return null;
  }
}

module.exports = { mapHookToEvent, summarizeToolInput, summarizeToolResponse };
