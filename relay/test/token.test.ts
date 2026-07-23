import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "../src/token";

const SECRET = "test-signing-key-please-rotate";

describe("session tokens", () => {
  it("signs and verifies a valid token round-trip", async () => {
    const { token, claims } = await signToken(
      { sid: "s1", role: "host", scope: "write", name: "alice", ttlSeconds: 3600 },
      SECRET,
    );
    const verified = await verifyToken(token, SECRET);
    expect(verified.sid).toBe("s1");
    expect(verified.role).toBe("host");
    expect(verified.scope).toBe("write");
    expect(verified.name).toBe("alice");
    expect(verified.jti).toBe(claims.jti);
    expect(verified.exp).toBeGreaterThan(verified.iat);
  });

  it("rejects an expired token", async () => {
    const { token } = await signToken(
      { sid: "s1", role: "viewer", scope: "view", name: "bob", ttlSeconds: -1 },
      SECRET,
    );
    await expect(verifyToken(token, SECRET)).rejects.toThrow(/expired/i);
  });

  it("rejects a token signed with a different key", async () => {
    const { token } = await signToken(
      { sid: "s1", role: "viewer", scope: "view", name: "bob", ttlSeconds: 3600 },
      SECRET,
    );
    await expect(verifyToken(token, "a-different-key")).rejects.toThrow(/signature/i);
  });

  it("rejects a tampered payload", async () => {
    const { token } = await signToken(
      { sid: "s1", role: "viewer", scope: "view", name: "bob", ttlSeconds: 3600 },
      SECRET,
    );
    const [h, p, s] = token.split(".");
    const flipped = p.slice(0, -1) + (p.slice(-1) === "A" ? "B" : "A");
    await expect(verifyToken(`${h}.${flipped}.${s}`, SECRET)).rejects.toThrow(/signature/i);
  });

  it("rejects a malformed token", async () => {
    await expect(verifyToken("not-a-jwt", SECRET)).rejects.toThrow(/malformed/i);
  });
});
