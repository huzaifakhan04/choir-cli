# Choir Quickstart

Choir makes one live Claude Code session something your whole team can watch, steer, and hand off. There are three roles in a setup: the **relay** (deployed once per team), the **host** (whoever is driving Claude Code), and **viewers** (teammates who join).

## 1. Deploy a relay (once per team)

The relay is a single Cloudflare Worker + Durable Object. It runs on Cloudflare's free plan and there is nothing to babysit — outbound fan-out to viewers is free.

```bash
git clone https://github.com/huzaifakhan04/multiplayer-ai-yc-rfs-f26 choir
cd choir/relay
npm i -g wrangler          # or: npx wrangler

# set the two secrets
wrangler secret put TEAM_KEY            # a shared password your team uses to open rooms
wrangler secret put TOKEN_SIGNING_KEY   # any long random string

wrangler deploy
```

`wrangler deploy` prints your relay URL, e.g. `https://choir-relay.<you>.workers.dev`. Share the relay URL and the `TEAM_KEY` with your team over a trusted channel.

## 2. Install the plugin (host)

The host keeps using Claude Code normally — Choir just adds hooks and the `/choir:*` commands.

```bash
# in Claude Code:
/plugin marketplace add huzaifakhan04/multiplayer-ai-yc-rfs-f26
/plugin install choir@choir
```

Then point the plugin at your relay (once):

```bash
export CHOIR_RELAY_URL="https://choir-relay.<you>.workers.dev"
export CHOIR_TEAM_KEY="<the team key>"
export CHOIR_NAME="Alice"
```

(Put these in your shell profile, or run `npx choircode config --relay <url> --team-key <key> --name Alice`.)

## 3. Share a session (host)

In any Claude Code session, run:

```
/choir:share            # watch-only for teammates
/choir:share suggest    # teammates can propose steers you approve
/choir:share write      # teammates can steer directly
```

It prints a join code:

```
🎶 Choir is live for this session. Teammates can join with:

    npx choircode join znx2fusf-zbxd
```

Drop that line in your team chat. Nothing is streamed until you share — before that, the hooks stay silent.

## 4. Join (viewers)

```bash
npx choircode config --relay https://choir-relay.<you>.workers.dev --name Bob   # once
npx choircode join znx2fusf-zbxd
```

Bob replays the session so far, then watches it live. With a `suggest`/`write` code, Bob can type a line and press Enter to steer.

## What each person needs

| Role | Needs |
|------|-------|
| Relay owner | A Cloudflare account (free), `wrangler` |
| Host | Claude Code + the `choir` plugin + relay URL + `TEAM_KEY` + their own Claude auth |
| Viewer | Node 18+ (for `npx choircode`) + relay URL |

Everyone uses their **own** Claude auth. The relay never sees a Claude API key, and secrets are redacted on the host before anything is sent. See [security.md](security.md).
