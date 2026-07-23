import { describe, it, expect } from "vitest";
import { scrubSecrets, isSensitivePath, truncate, redactEvent } from "../lib/redact.js";

describe("scrubSecrets", () => {
  it("redacts an AWS access key id", () => {
    expect(scrubSecrets("key=AKIAIOSFODNN7EXAMPLE done")).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("redacts a Bearer token", () => {
    const out = scrubSecrets("Authorization: Bearer abcdef1234567890ABCDEF1234");
    expect(out).not.toContain("abcdef1234567890ABCDEF1234");
    expect(out).toContain("[redacted]");
  });

  it("redacts provider-prefixed keys (sk-, ghp_, xoxb-)", () => {
    expect(scrubSecrets("sk-abcdefghijklmnopqrstuvwx")).toContain("[redacted]");
    expect(scrubSecrets("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")).toContain("[redacted]");
    expect(scrubSecrets("xoxb-1234-5678-abcdEFGHijklMNOP")).toContain("[redacted]");
  });

  it("redacts KEY=value secret assignments", () => {
    const out = scrubSecrets("MY_API_SECRET=s3cr3tv4lue-not-shown");
    expect(out).not.toContain("s3cr3tv4lue-not-shown");
  });

  it("redacts a PEM private key block", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEabc\n-----END RSA PRIVATE KEY-----";
    expect(scrubSecrets(pem)).not.toContain("MIIEabc");
  });

  it("leaves ordinary text untouched", () => {
    const s = "Running npm test in packages/api and it passed";
    expect(scrubSecrets(s)).toBe(s);
  });
});

describe("isSensitivePath", () => {
  it("flags dotenv, ssh, aws, and pem paths", () => {
    expect(isSensitivePath("/home/x/project/.env")).toBe(true);
    expect(isSensitivePath("~/.ssh/id_rsa")).toBe(true);
    expect(isSensitivePath("/Users/x/.aws/credentials")).toBe(true);
    expect(isSensitivePath("./certs/server.pem")).toBe(true);
  });

  it("does not flag ordinary source files", () => {
    expect(isSensitivePath("src/index.ts")).toBe(false);
    expect(isSensitivePath("README.md")).toBe(false);
  });
});

describe("truncate", () => {
  it("caps long strings and marks them", () => {
    const out = truncate("x".repeat(5000), 100);
    expect(out.length).toBeLessThan(200);
    expect(out).toContain("[truncated]");
  });
});

describe("redactEvent", () => {
  it("drops the body of a Bash command that reads a secret file", () => {
    const ev = redactEvent("tool_call", { tool: "Bash", summary: "cat .env" });
    expect(ev.summary).toContain("[redacted");
    expect(ev.summary).not.toContain(".env");
  });

  it("keeps an ordinary Bash command", () => {
    const ev = redactEvent("tool_call", { tool: "Bash", summary: "npm run build" });
    expect(ev.summary).toBe("npm run build");
  });

  it("scrubs secrets inside tool output", () => {
    const ev = redactEvent("tool_result", { tool: "Bash", ok: true, output: "TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" });
    expect(ev.output).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
  });
});
