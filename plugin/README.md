# choir (Claude Code plugin)

The host side of **[Choir](https://github.com/huzaifakhan04/choir-cli)** — multiplayer for Claude Code. Install this plugin, keep using Claude Code normally, and share any session so teammates can watch, steer, and take it over.

## Install

```
/plugin marketplace add huzaifakhan04/choir-cli
/plugin install choir@choir
```

Then configure the relay once (see the [quickstart](https://github.com/huzaifakhan04/choir-cli/blob/main/docs/quickstart.md)):

```bash
export CHOIR_RELAY_URL="https://choir-relay.<you>.workers.dev"
export CHOIR_TEAM_KEY="<team key>"
export CHOIR_NAME="Alice"
```

## Commands

| Command | What it does |
|---------|--------------|
| `/choir:share [view\|suggest\|write]` | Share this session; prints a join code |
| `/choir:roster` | Who's connected |
| `/choir:pause` · `/choir:resume` | Freeze / unfreeze the agent's tool use |
| `/choir:scope <name> <view\|suggest\|write>` | Change a teammate's permission |
| `/choir:kick <name>` | Remove a teammate |
| `/choir:approve` | Approve pending suggestions |
| `/choir:handoff <name>` | Hand the driver's seat to a teammate |
| `/choir:take-handoff` | Pick up a session handed to you |

## How it works

Hooks stream the session to a Cloudflare relay (secrets are redacted **on your machine** first), and a `Stop` hook injects teammates' steers at turn boundaries. Nothing streams until you `/choir:share`. Your Claude API key never leaves your machine. See [architecture](https://github.com/huzaifakhan04/choir-cli/blob/main/docs/architecture.md) and [security](https://github.com/huzaifakhan04/choir-cli/blob/main/docs/security.md).

Requires Node 18+ on the host (for the hook scripts and `git`).

MIT © huzaifakhan04
