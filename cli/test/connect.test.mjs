import { describe, it, expect } from "vitest";
import { encodeConnect as cliEncode, decodeConnect as cliDecode } from "../lib/connect.js";
import { encodeConnect as plgEncode, decodeConnect as plgDecode } from "../../plugin/lib/connect.js";

const RELAY = "https://choir-relay.example.workers.dev";
const CODE = "awy2ncep-db9w";

describe("connect token", () => {
  it("round-trips relay + code and splits the room/invite", () => {
    const token = cliEncode(RELAY, CODE);
    expect(token.startsWith("choir1_")).toBe(true);
    const d = cliDecode(token);
    expect(d.relay).toBe(RELAY);
    expect(d.code).toBe(CODE);
    expect(d.roomId).toBe("awy2ncep");
    expect(d.inviteId).toBe("db9w");
  });

  it("is identical across the plugin (minter) and cli (reader) implementations", () => {
    // A token minted host-side by the plugin must decode viewer-side in the cli.
    const fromPlugin = cliDecode(plgEncode(RELAY, CODE));
    expect(fromPlugin.relay).toBe(RELAY);
    expect(fromPlugin.code).toBe(CODE);
    expect(plgEncode(RELAY, CODE)).toBe(cliEncode(RELAY, CODE));
    expect(plgDecode(cliEncode(RELAY, CODE))).toEqual(cliDecode(cliEncode(RELAY, CODE)));
  });

  it("strips a trailing slash on the relay", () => {
    expect(cliDecode(cliEncode(RELAY + "/", CODE)).relay).toBe(RELAY);
  });

  it("returns null for a bare code (v0.1 form, not a connect token)", () => {
    expect(cliDecode("awy2ncep-db9w")).toBeNull();
  });

  it("returns null for empty or non-token input", () => {
    expect(cliDecode("")).toBeNull();
    expect(cliDecode("random")).toBeNull();
    expect(cliDecode("choir1_notarealpayload")).toBeNull();
  });
});
