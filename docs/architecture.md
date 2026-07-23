# Choir Architecture

Choir turns one local Claude Code session into something a team shares, without changing how the host works. Three parts:

```
 HOST (native `claude` + Choir plugin)        RELAY (Cloudflare Worker + DO)        VIEWERS (npx choir-cli)
 ┌───────────────────────────────────┐        ┌──────────────────────────────┐     ┌───────────────────────┐
 │ hooks:                            │  HTTP  │  one Durable Object / session │     │  WebSocket             │
 │  UserPromptSubmit ┐               │ ─────▶ │  • append-only event log      │◀─WS─▶│  replay history        │
 │  Pre/PostToolUse  ├─ choir-emit ──┼───────▶│    (SQLite)                   │     │  then tail live        │
 │  MessageDisplay   ┘  (redacted)   │        │  • WebSocket hub (free        │     │  render prompts/tools/ │
 │  Stop ─ choir-steer ◀─ steer ─────┼───HTTP─┤    outbound fan-out)          │     │    assistant/notices   │
 │  PreToolUse ─ choir-gate (pause)  │        │  • steer queue                │     │  /steer ──────────────▶│
 │ commands: /choir:share|pause|...  │        │  • presence + roles           │     │                       │
 └───────────────────────────────────┘        │  • HS256 token mint/verify    │     └───────────────────────┘
      uses the host's own Claude auth          └──────────────────────────────┘
```

## The host (plugin)

The host runs Claude Code normally. The plugin adds:

- **Streaming hooks** (`choir-emit`, async/non-blocking) on `UserPromptSubmit`, `Pre/PostToolUse`, `MessageDisplay`, and `SessionEnd`. Each maps the hook payload to a Choir event, **redacts secrets on-host**, and POSTs it to the relay — but only after the session has been shared, so unshared sessions do nothing.
- **The `Stop` hook** (`choir-steer`, synchronous). At each turn boundary it streams a `turn_end` and asks the relay for the next queued steer. If one exists, it returns `{"decision":"block","reason":...}` so the agent takes the steer up as its next instruction. The reason is framed as a neutral task instruction (framing it as "an external teammate" makes the model refuse it — verified against Claude Code 2.1.205).
- **The `PreToolUse` gate** (`choir-gate`) enforces pause: while the host has paused the session, tool calls are denied.
- **Slash commands**: `/choir:share`, `/choir:pause`, `/choir:resume`, `/choir:kick`, `/choir:scope`, `/choir:roster`.

Nothing here needs the host's Claude API key to leave the machine; the relay only ever sees redacted events.

## The relay (Cloudflare Worker + Durable Object)

One Durable Object instance per session is the authoritative hub:

- **Event log** — an append-only SQLite table with a monotonic `seq`. It is the canonical transcript: late-joiners read everything since a cursor, then subscribe to live appends. This same log powers handoff.
- **WebSocket hub** — viewers connect and are fanned out to using the Hibernation API. Outbound fan-out is free on Cloudflare, which is why viewer count isn't a cost driver.
- **Steer queue** — viewer steers land here; the host's `Stop` hook drains it.
- **Presence & roles** — who's connected, who's the writer, each viewer's scope.
- **Auth** — mints and verifies HS256 session tokens. A token *is* the credential (no accounts): it carries the session id, role, scope, and a `jti` for revocation.

The worker is a thin router: it maps `/sessions/:id/*` to that session's Durable Object and forwards.

## The viewer (CLI)

`npx choir-cli join <code>` redeems an invite for a viewer token, opens the WebSocket, replays history, then tails live — rendering prompts, tool calls/results, coalesced assistant text, notifications, and presence. With `suggest`/`write` scope, typed lines become steers.

## Why this shape

- **Host stays native.** People keep their own Claude Code, their own auth, their own permissions. Choir is additive.
- **The log is the source of truth.** Watch, late-join replay, and handoff all read the same ordered event log.
- **Fan-out is free.** A 1-writer → N-viewer firehose is cheapest where outbound bandwidth is free (Cloudflare Durable Objects), so adding viewers costs ~nothing.
- **Redaction is client-side.** Secrets are scrubbed before they leave the host, so a relay compromise can't leak what never reached it.

## Known limits (v1)

- **Redirect lands at the next turn boundary**, not mid-tool. Waking a fully-idle session on a remote steer is not guaranteed; a background monitor is the candidate mechanism. Mid-run injection is the Agent-SDK upgrade path.
- **Handoff reconstructs from the shared log**, not the host process's memory — the new driver must share the same git branch/commit.
- **One trusted team.** See [security.md](security.md).
