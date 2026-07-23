# Choir Security Model

Choir lets teammates watch and steer an agent running on **someone else's machine**. That is powerful, so the trust model matters. This document is honest about what Choir does and does not protect against.

## Trust boundary (v1): one trusted team

Choir v1 is designed for a **single team of people who already trust each other**. Access is gated by one pre-shared `TEAM_KEY` plus per-session invite codes. It is **not** designed for public, cross-organization, or adversarial use yet. Don't share a session with someone you wouldn't pair-program with.

## What protects you

**A remote steer cannot bypass your local permission gate.** Steering is injected into your session as a *plain instruction the agent reads*, exactly like you typing a follow-up. It is **not** a tool call and cannot execute anything by itself. Every real action the agent takes still passes through your own Claude Code permission prompts (`PreToolUse`). If someone steers "delete the database," your agent still has to ask *you* before running a destructive command (unless you've already allowlisted it). Steering redirects; it doesn't seize the keyboard.

**Permission scopes.** Each viewer joins with a scope:
- `view` — read-only. Can watch, cannot steer.
- `suggest` — can propose steers; the host approves before injection.
- `write` — steers are injected at the next turn boundary.

**Host kill switch.** The host can pause the session, kick a viewer, change a viewer's scope, or end the session at any time (`/choir:pause`, `/choir:kick`, `/choir:scope`).

**Secrets are redacted on the host, before egress.** The redaction filter runs *inside the hook on your machine* — the relay only ever receives already-scrubbed text. It:
- drops the body of tool calls/results that touch sensitive paths (`.env`, `.ssh`, `.aws`, `*.pem`, `*.key`, `credentials`, `.npmrc`, …) or dump the environment (`env`, `printenv`);
- pattern-scrubs every outgoing string (AWS keys, `Bearer` tokens, PEM blocks, JWTs, `sk-`/`ghp_`/`xox*` tokens, and `KEY=value`/`TOKEN: value` assignments);
- never forwards the raw environment, and caps every field's size.

**Your Claude API key never leaves your machine.** The relay only sees session events. Auth to Claude stays entirely local, and each participant uses their own Claude auth.

**Transport & tokens.** All relay traffic is over TLS/WSS in production. Session tokens are short-lived HS256 tokens scoped to one session with a role and permission; a `jti` allows a host to revoke (kick) a specific participant.

## What Choir does NOT protect against (be aware)

- **A malicious teammate with `write` scope** can still steer the agent toward bad instructions. Your permission prompts are the backstop — keep auto-approval (`--dangerously-skip-permissions`, broad allowlists) **off** during shared sessions.
- **Redaction is best-effort.** The scrubber catches common secret shapes and sensitive paths, but no filter is perfect. Treat a shared session like a screen-share: don't `cat` a secret you wouldn't show on a call. Redaction runs client-side precisely so a miss is contained to your intent, not a relay leak.
- **The relay operator can read session content.** If you self-host the relay (recommended), that's you. The relay stores the (redacted) event log in its Durable Object; delete-on-expiry / retention controls are on the roadmap.
- **Anyone with a live invite code can join** until it expires. Treat invite codes like meeting links — share them only in trusted channels, and use short TTLs / `/choir:kick` if one leaks.

## Recommended posture

- Self-host the relay on your own Cloudflare account so no third party holds session data.
- Use a strong, unique `TOKEN_SIGNING_KEY` and `TEAM_KEY`.
- Keep permission prompts on during shared sessions.
- Prefer `view` / `suggest` scopes unless you explicitly want a teammate driving.
- Rotate the `TEAM_KEY` if it may have leaked.

## Reporting

Found a security issue? Please open a private report rather than a public issue.
