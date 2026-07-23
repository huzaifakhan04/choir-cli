# choircode

The terminal client for **[Choir](https://github.com/huzaifakhan04/multiplayer-ai-yc-rfs-f26)** — multiplayer for Claude Code. Join a teammate's live Claude Code session, watch it work, and steer it, all from your terminal.

```bash
# one-time: point at your team's relay
npx choircode config --relay https://choir-relay.<you>.workers.dev --name Bob

# join a session (the code comes from the host's /choir:share)
npx choircode join znx2fusf-zbxd
```

You'll replay the session so far, then watch it live — prompts, tool calls and results, and the agent's replies. With a `suggest` or `write` scope, type a line and press Enter to steer the running agent.

## Commands

| Command | What it does |
|---------|--------------|
| `choircode join <code>` | Join and watch/steer a shared session |
| `choircode take <code> --name <you>` | Accept a handoff (then run `/choir:take-handoff` in Claude Code) |
| `choircode config --relay <url> [--name <you>]` | Save your relay + display name |

Flags: `--relay <url>`, `--name <you>` (also read from `CHOIR_RELAY_URL` / `CHOIR_NAME` or `~/.config/choir/config.json`).

## In-session keys (suggest/write scope)

- type a line + Enter — send a steer
- `/who` — show who's connected
- `/quit` — leave

Node 18+. The host side is the `choir` Claude Code plugin — see the [main repo](https://github.com/huzaifakhan04/multiplayer-ai-yc-rfs-f26).

MIT © huzaifakhan04
