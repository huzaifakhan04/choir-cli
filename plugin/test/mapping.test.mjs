import { describe, it, expect } from "vitest";
import { mapHookToEvent } from "../lib/mapping.js";

// Payloads below mirror the real shapes captured from Claude Code 2.1.205.

describe("mapHookToEvent", () => {
  it("maps UserPromptSubmit to a prompt event attributed to the host", () => {
    const ev = mapHookToEvent({ hook_event_name: "UserPromptSubmit", prompt: "fix the bug" }, "alice");
    expect(ev).toEqual({ kind: "prompt", actor: "alice", payload: { text: "fix the bug" } });
  });

  it("maps PreToolUse to a tool_call summarizing the command", () => {
    const ev = mapHookToEvent(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm test", description: "run tests" },
        tool_use_id: "toolu_1",
      },
      "alice",
    );
    expect(ev.kind).toBe("tool_call");
    expect(ev.actor).toBe("agent");
    expect(ev.payload.tool).toBe("Bash");
    expect(ev.payload.summary).toBe("npm test");
    expect(ev.payload.toolUseId).toBe("toolu_1");
  });

  it("summarizes file tools by path", () => {
    const ev = mapHookToEvent(
      { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "src/index.ts" } },
      "alice",
    );
    expect(ev.payload.summary).toBe("src/index.ts");
  });

  it("maps PostToolUse to a successful tool_result with output", () => {
    const ev = mapHookToEvent(
      {
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "echo hi" },
        tool_response: { stdout: "hi", stderr: "", interrupted: false },
      },
      "alice",
    );
    expect(ev.kind).toBe("tool_result");
    expect(ev.payload.ok).toBe(true);
    expect(ev.payload.output).toBe("hi");
  });

  it("maps MessageDisplay deltas to assistant_text carrying the final flag", () => {
    const ev = mapHookToEvent(
      { hook_event_name: "MessageDisplay", delta: "Done!", message_id: "m1", index: 0, final: true },
      "alice",
    );
    expect(ev).toEqual({
      kind: "assistant_text",
      actor: "agent",
      payload: { text: "Done!", messageId: "m1", index: 0, final: true },
    });
  });

  it("maps Stop to a turn_end", () => {
    const ev = mapHookToEvent({ hook_event_name: "Stop", last_assistant_message: "Done!" }, "alice");
    expect(ev.kind).toBe("turn_end");
  });

  it("maps SessionEnd to a session_end attributed to the host", () => {
    const ev = mapHookToEvent({ hook_event_name: "SessionEnd", reason: "other" }, "alice");
    expect(ev.kind).toBe("session_end");
    expect(ev.actor).toBe("alice");
  });

  it("returns null for events we do not stream", () => {
    expect(mapHookToEvent({ hook_event_name: "SomethingElse" }, "alice")).toBeNull();
  });
});
