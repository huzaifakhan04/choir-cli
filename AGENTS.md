# AGENTS.md — Guide for AI coding agents working on Choir

Operating context for anyone contributing to Choir with an AI coding agent (Claude Code, Cursor, Codex, Aider, …). Follow these automatically.

> This file follows the [agents.md](https://agents.md) convention and is read by many agents directly. If yours uses a different filename (e.g. Claude Code reads `CLAUDE.md`), copy or symlink this file to that name locally — a personal `CLAUDE.md` is git-ignored, so it won't be committed.
>
> Throughout, replace `<owner>` with the repository owner you're working against (the upstream repo, or your fork).

---

## 0. Golden rules (do these every time)

1. **Author commits under your own identity — never credit the AI agent.**
   - Set `git config user.name` / `user.email` to **your own** name and email; commits should be authored by the human contributor.
   - Do **not** add `Co-Authored-By: <AI> …`, "Generated with …", or any AI/assistant/agent name in commit messages, PR descriptions, or `author`/`contributor` fields. The AI is a tool, not a co-author.
   - Write plain, descriptive commit messages about *what changed and why*. Keep commits small and focused.
2. **After making changes, review `README.md`, `CONTRIBUTING.md`, and `SECURITY.md` for consistency.** If a change affects install steps, commands, supported versions, project layout, security posture, or naming — update those files too. **If nothing there is affected, leave them unchanged** (don't churn them).
3. **Keep the plugin's host scripts dependency-free.** Everything under `plugin/bin/` and `plugin/lib/` is plain Node with **no npm dependencies** — it must run with only Node installed. Don't `require()` third-party packages there.
4. **`cli/lib/connect.js` and `plugin/lib/connect.js` must stay byte-identical.** The host (plugin) mints connect tokens; the viewer (CLI) reads them. Change one → copy to the other. `cli/test/connect.test.mjs` guards this.
5. **Redaction is sacred.** Anything that streams host data goes through `plugin/lib/redact.js`. Add test cases when you touch it.
6. **Verify before claiming done.** Run `pnpm test`, and for runtime changes, exercise the real path (see §3) — not just unit tests.

---

## 1. What this is (quick facts)

Choir = multiplayer for Claude Code: watch / redirect / hand off one live agent session as a team.

| Thing | Value |
|-------|-------|
| npm package | `choir-cli` — binary is **`choir`** (`npx choir-cli join …`, or `choir join …` after a global install) |
| Plugin name / commands | `choir` · `/choir:*` |
| Marketplace install | `/plugin marketplace add <owner>/choir-cli` → `/plugin install choir@choir` |
| Relay | A Cloudflare Worker (`choir-relay`) each team self-hosts; you deploy your own for development |

**Monorepo layout:** `plugin/` (Claude Code plugin — hooks, `/choir:*`, redaction) · `relay/` (Cloudflare Worker + Durable Object) · `cli/` (`choir-cli` npm package) · `packages/protocol/` (shared TS wire types) · `docs/` (architecture, security, quickstart).

---

## 2. Common commands

```bash
pnpm install                                    # install workspace deps
pnpm test                                        # run the vitest unit suite
npx tsc -p relay/tsconfig.json                   # typecheck the relay (Workers TS)

# run the relay locally (reads relay/.dev.vars). NOTE: wrangler is NOT at the root
# node_modules/.bin — always invoke it through the relay package:
pnpm --filter @choir/relay exec wrangler dev --port 8787

# relay end-to-end smoke test (against local wrangler dev OR a deployed relay):
CHOIR_RELAY_URL=http://127.0.0.1:8787 CHOIR_TEAM_KEY=dev-team-key node relay/scripts/smoke.mjs
```

Copy `relay/.dev.vars.example` → `relay/.dev.vars` for local secrets (git-ignored). The plugin reads its config from `~/.config/choir/config.json` and env (`CHOIR_RELAY_URL`, `CHOIR_TEAM_KEY`, `CHOIR_NAME`, `CHOIR_DATA_DIR`).

---

## 3. Verifying against real Claude Code

Hooks and slash commands must be exercised against the actual `claude` binary, not just unit tests.

```bash
# load the local plugin without installing it, headless, cheap model:
claude -p "/choir:share view" --plugin-dir ./plugin \
  --settings <settings-with-permissions> --model claude-haiku-4-5-20251001
```

- Some agents/harnesses **block `--dangerously-skip-permissions`**. Instead pass a `--settings` JSON that pre-allows only what the test needs, e.g. `{ "permissions": { "allow": ["Bash(node:*)", "Bash(echo:*)"] } }`. The plugin's own `allowed-tools: Bash(node:*)` frontmatter also permits the `/choir:*` command scripts.
- To capture real hook payloads, register a logging hook via `--settings` and run one cheap `claude -p` turn.
- Interactive logins (`wrangler login`, `npm login`) can't run headlessly — run those yourself in a real terminal.

---

## 4. Releasing / publishing (maintainers & forks)

Publishing to the canonical `choir-cli` on npm is a **maintainer** action; contributors just open PRs. If you maintain a fork, use **your own** npm token and package scope.

Publishing is automated by `.github/workflows/publish.yml`, triggered on a **GitHub Release** (or `workflow_dispatch`). It publishes `choir-cli` to npmjs **and** a scoped mirror `@<owner>/choir-cli` to GitHub Packages (which populates the repo's Packages section). The publish steps **skip a version that already exists**, so re-runs are safe.

**To cut a release:**

```bash
# 1. bump the CLI version (and the plugin version too if plugin/ content changed)
npm version patch --prefix cli --no-git-tag-version         # e.g. 0.2.1 -> 0.2.2
# if the plugin changed, also bump plugin/.claude-plugin/plugin.json AND both
# "version" fields in .claude-plugin/marketplace.json (installed plugins only
# update on a version bump).

# 2. keep npm metadata correct: repository / homepage / bugs must point at the repo
# 3. commit + push, then tag a release:
git commit -am "choir-cli vX.Y.Z" && git push origin main
gh release create vX.Y.Z --title "choir-cli vX.Y.Z" --notes "…"

# watch it:
gh run list --workflow=publish.yml --limit 1
gh run view <run-id> --json jobs --jq '.jobs[] | .name + ": " + .conclusion'
```

**Requirements / gotchas:**

- The `NPM_TOKEN` repo secret **must be an npm _Automation_ token** (npmjs → Access Tokens → Generate → Classic → *Automation*). A "Publish"/web token fails in CI with `EOTP` because it still demands a 2FA code CI can't provide. Set it with `gh secret set NPM_TOKEN` in your repo.
- GitHub Packages uses the built-in `GITHUB_TOKEN` (the workflow has `permissions: packages: write`) — no secret needed. The first publish there may land **private**; flip visibility in the package settings if it should be public.
- `E403 "cannot publish over previously published versions"` = that version already exists on the registry → **bump the version**. (The workflow's `npm view` guard turns this into a green skip.)
- **GitHub Actions re-runs use the workflow file from the run's original commit**, not latest `main`. To exercise updated workflow logic, trigger a *new* run (`gh workflow run …` or a new release) — don't just `gh run rerun`.
- **Manual fallback:** `npm publish ./cli --access public` needs an interactive 2FA step, so run it in a **real terminal**, not headless. Deprecate old versions with `npm deprecate choir-cli@X.Y.Z "message"`.

---

## 5. Deploying / redeploying a relay (Cloudflare)

Each team self-hosts the relay; for development, deploy your own to a free Cloudflare account.

```bash
pnpm --filter @choir/relay exec wrangler login       # interactive; run in a real terminal
pnpm --filter @choir/relay exec wrangler deploy      # prints your relay URL

# set secrets non-interactively (never commit their values):
echo "<random-hex>"    | pnpm --filter @choir/relay exec wrangler secret put TOKEN_SIGNING_KEY
echo "<team-password>" | pnpm --filter @choir/relay exec wrangler secret put TEAM_KEY
```

- **First-time Cloudflare account:** the deploy fails with *"You need a workers.dev subdomain"* — open **dash.cloudflare.com → Workers & Pages** once to create the subdomain, then redeploy.
- **Right after creating the subdomain**, the edge TLS cert takes ~1–3 min; requests may fail with curl **exit 35 (SSL)**. Poll `/health` until it returns `choir relay ok`.
- Secrets are `TEAM_KEY` (the team's shared password) and `TOKEN_SIGNING_KEY` — set via `wrangler secret put`. Never hardcode them.

---

## 6. Repo admin (via `gh`)

```bash
gh repo edit <owner>/choir-cli --description "…" --homepage "…" --add-topic <topic>
gh secret set NPM_TOKEN
gh workflow run publish.yml
gh run list --workflow=ci.yml --limit 1
gh run view <id> --log-failed
```

- **Private vulnerability reporting** (so `SECURITY.md`'s report link works for outsiders) is a one-click toggle in **Settings → Security → Private vulnerability reporting**; it may not be settable via the API token.

---

## 7. Environment gotchas (macOS / zsh / CI)

- **`status` is a read-only variable in zsh** — never use it as a shell variable name (use `st`, `rstat`, …).
- **No `timeout` command** on macOS by default. To bound a long-running process, launch it in the background and `kill` it after a `sleep`.
- **`pnpm` build approvals:** `pnpm-workspace.yaml` has an `allowBuilds:` block (`esbuild: true`, `workerd: true`, `sharp: false`). If `pnpm install` reports ignored builds, approve the needed ones there and re-install.
- **CI Node version:** pnpm 11.5.x needs **Node ≥ 22.13** (it uses `node:sqlite`). The workflows pin `node-version: 22`. The *published packages* still support Node 18+ — this only pins the build toolchain.

---

## 8. Product/behavior gotchas (learned the hard way)

- **Steer injection framing:** the `Stop`-hook injects a teammate's steer as `{"decision":"block","reason":"Additional instruction for this task: …"}`. It **must read as a neutral, authorized task instruction** — phrasing it like *"a teammate/external party is steering you"* makes the model **refuse it as prompt injection** (verified on Claude Code 2.1.205). Attribution goes to viewers via the `steer_injected` event, not into the injected reason. Loop safety: on `stop_hook_active: true`, exit 0 (don't re-block).
- **SKILL.md YAML frontmatter:** a `: ` (colon + space, e.g. `Usage: /choir:x`) inside an unquoted `description` breaks YAML parsing → the skill loads with empty metadata. **Quote such descriptions.** Catch it with `claude plugin validate ./plugin`.
- **Durable Object request bodies:** read the request body *before* an auth check that might throw, otherwise workerd logs *"Can't read from request stream after response has been sent."*
- **`raw.githubusercontent.com` lags** after a repo rename/push. Verify repo contents authoritatively with `gh api /repos/<owner>/choir-cli/contents/<path>`.

---

## 9. Post-change checklist

Before wrapping up any change:

- [ ] `pnpm test` green; relay typechecks if `relay/` changed.
- [ ] Runtime behavior exercised end-to-end if it's a runtime change (not just tests).
- [ ] `connect.js` copies still identical (if touched).
- [ ] **Reviewed `README.md`, `CONTRIBUTING.md`, `SECURITY.md`** — updated if the change affects them, left alone if not.
- [ ] Versions bumped where a publish/plugin-update is intended.
- [ ] Committed under your own identity, with **no AI attribution**, and pushed.
