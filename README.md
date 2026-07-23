# Choir

**Multiplayer for Claude Code.** Watch, redirect, and hand off one live agent session as a team — the way you'd work with any other teammate.

> Built for Y Combinator's Fall 2026 "Multiplayer AI" RFS: *"Anyone on a team should be able to drop into the same live agent session to watch it work, redirect it, and hand it off."* Today the best you can do in Claude Code is share a read-only transcript. Choir makes the session itself the shared, living thing.

Many voices, one live session.

---

## What it does

One person runs Claude Code normally. They run `/choir:share`, get an invite code, and drop it in chat. Teammates run:

```bash
npx choircode join a1b2c3
```

…and now they can:

- **Watch** — see the agent's prompts, tool calls, results, and replies stream live in their own terminal. Late-joiners replay the whole session, then tail live.
- **Redirect** — send a steering message that the host's agent picks up at its next step and acts on.
- **Hand off** — pass the driver's seat to a teammate, who continues the same session on their own machine with full context.

Each person uses their **own** Claude auth. The host keeps running native `claude`. It costs ~$0 to run.

## How it works

```
HOST (native claude + Choir plugin)     RELAY (Cloudflare Durable Object)     VIEWERS (terminal)
  hooks ── redacted events ───────────▶  WS hub + SQLite event log  ◀────────▶  npx choircode join
  Stop-hook ◀── steer queue ────────────  signed tokens, presence, roles        watch · /steer · take
```

- **Plugin** (host side) — Claude Code hooks stream the session out (redacted client-side, before it ever leaves the machine) and a `Stop`-hook injects teammates' steering back in.
- **Relay** — one Cloudflare Durable Object per session: a WebSocket hub with free outbound fan-out and a replayable SQLite event log. Self-hosted with one `wrangler deploy`.
- **CLI** — `npx choircode` — the terminal viewer/steerer.

The relay never sees your Claude API key, and secrets are stripped on the host before anything is sent.

## Status

Early, built in the open. Phased roadmap:

- [x] **Phase 0** — de-risk spike: hook→relay streaming + `Stop`-hook steer injection *(proven against Claude Code 2.1.205)*
- [x] **Phase 1** — Watch: stream a live session, replay history + tail live from the terminal
- [x] **Phase 2** — Redirect: teammates steer a running session; host controls (pause/kick/scope/roster)
- [x] **Phase 3** — Handoff: transfer the driver's seat cross-machine with the shared context
- [x] **Phase 4** — Distribution: plugin on the marketplace + [`choircode`](https://www.npmjs.com/package/choircode) on npm

All phases are verified end-to-end against real Claude Code 2.1.205 and a live Cloudflare relay.

## Commands

**Host** (Claude Code, via the `choir` plugin): `/choir:share [view|suggest|write]`, `/choir:roster`, `/choir:pause`, `/choir:resume`, `/choir:scope <name> <scope>`, `/choir:kick <name>`, `/choir:approve`, `/choir:handoff <name>`, `/choir:take-handoff`.

**Viewer** (terminal): `npx choircode join <code>`, `npx choircode take <code> --name <you>`, `npx choircode config --relay <url>`.

## Repository layout

| Path | What |
|------|------|
| `plugin/` | The Claude Code plugin (hooks, slash commands, redaction) — zero-dependency Node |
| `relay/` | Cloudflare Worker + Durable Object (WebSocket hub + SQLite event log + tokens) |
| `cli/` | `npx choircode` — terminal viewer and steerer |
| `packages/protocol/` | Shared TypeScript types (event kinds, wire frames, token claims) |
| `docs/` | Quickstart, security model, architecture |

## Security

Choir v1 is designed for **one trusted team**. Steering is injected as guidance, so the host's own Claude Code permission prompts still gate every real command — a remote steer can't bypass the local approval gate. Secrets are redacted on the host before egress. See [`docs/security.md`](docs/security.md).

## License

MIT © huzaifakhan04
