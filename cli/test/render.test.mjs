import { describe, it, expect } from "vitest";
import { createRenderer } from "../lib/render.js";

describe("createRenderer", () => {
  it("renders a prompt with the author and text", () => {
    const r = createRenderer();
    const line = r.handleEvent({ kind: "prompt", actor: "alice", payload: { text: "fix the bug" } });
    expect(line).toContain("alice");
    expect(line).toContain("fix the bug");
  });

  it("renders a tool_call with the tool name and summary", () => {
    const r = createRenderer();
    const line = r.handleEvent({ kind: "tool_call", actor: "agent", payload: { tool: "Bash", summary: "npm test" } });
    expect(line).toContain("Bash");
    expect(line).toContain("npm test");
  });

  it("buffers assistant_text deltas and emits once on final", () => {
    const r = createRenderer();
    const first = r.handleEvent({ kind: "assistant_text", payload: { messageId: "m1", text: "Hel", final: false } });
    expect(first).toBeNull();
    const second = r.handleEvent({ kind: "assistant_text", payload: { messageId: "m1", text: "lo!", final: true } });
    expect(second).toContain("Hello!");
  });

  it("distinguishes ok and failed tool results", () => {
    const r = createRenderer();
    const ok = r.handleEvent({ kind: "tool_result", payload: { ok: true, output: "done" } });
    const bad = r.handleEvent({ kind: "tool_result", payload: { ok: false, output: "boom" } });
    expect(ok).toContain("done");
    expect(bad).toContain("boom");
  });

  it("formats a roster marking the writer", () => {
    const r = createRenderer();
    const line = r.formatRoster([
      { name: "alice", role: "host", scope: "write", isWriter: true },
      { name: "bob", role: "viewer", scope: "view", isWriter: false },
    ]);
    expect(line).toContain("alice");
    expect(line).toContain("bob");
  });
});
