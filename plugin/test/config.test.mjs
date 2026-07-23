import { describe, it, expect } from "vitest";
import { resolveConfig } from "../lib/config.js";

describe("resolveConfig", () => {
  it("prefers environment variables over the config file", () => {
    const cfg = resolveConfig(
      { CHOIR_RELAY_URL: "https://env.example", CHOIR_TEAM_KEY: "envkey", CHOIR_NAME: "envname" },
      { relayUrl: "https://file.example", teamKey: "filekey", name: "filename" },
    );
    expect(cfg.relayUrl).toBe("https://env.example");
    expect(cfg.teamKey).toBe("envkey");
    expect(cfg.name).toBe("envname");
  });

  it("falls back to the config file when env is unset", () => {
    const cfg = resolveConfig({}, { relayUrl: "https://file.example", teamKey: "filekey" });
    expect(cfg.relayUrl).toBe("https://file.example");
    expect(cfg.teamKey).toBe("filekey");
  });

  it("returns null for values set in neither source", () => {
    const cfg = resolveConfig({}, {});
    expect(cfg.relayUrl).toBeNull();
    expect(cfg.teamKey).toBeNull();
    expect(cfg.name).toBeNull();
  });

  it("strips a trailing slash from relayUrl", () => {
    const cfg = resolveConfig({ CHOIR_RELAY_URL: "https://relay.example/" }, {});
    expect(cfg.relayUrl).toBe("https://relay.example");
  });
});
