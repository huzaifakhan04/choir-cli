# Contributing to Choir

First off — thank you! Choir is free and open source, and it gets better because people like you pitch in. Bug reports, docs fixes, tests, and new features are all welcome.

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- 🐛 **Report a bug** — [open an issue](https://github.com/huzaifakhan04/choir-cli/issues/new) with steps to reproduce.
- 💡 **Suggest a feature** — open an issue describing the problem you're trying to solve.
- 📖 **Improve the docs** — the README and everything in `docs/` are fair game.
- 🧪 **Add tests** — more coverage is always appreciated.
- 🔌 **Build a host adapter** — bringing Choir to another agent (Codex, Cursor, …) is the highest-impact contribution. See [below](#adding-a-host-adapter).

> Found a **security** vulnerability? Please **do not** open a public issue — follow our [Security Policy](SECURITY.md) instead.

## Development setup

```bash
git clone https://github.com/huzaifakhan04/choir-cli
cd choir-cli
pnpm install

pnpm test                                        # run the unit suite (vitest)
pnpm --filter @choir/relay exec wrangler dev      # run the relay locally on :8787
claude --plugin-dir ./plugin                      # load the plugin without installing it
```

To test the full loop locally, copy `relay/.dev.vars.example` to `relay/.dev.vars`, start `wrangler dev`, then in another terminal set `CHOIR_RELAY_URL=http://127.0.0.1:8787` and run a `/choir:share` from a plugin-loaded session.

## Project structure

| Path | What |
|------|------|
| `plugin/` | The Claude Code plugin — hooks, `/choir:*` commands, on-host redaction (zero-dependency Node) |
| `relay/` | The Cloudflare Worker + Durable Object (WebSocket hub + SQLite event log + tokens) |
| `cli/` | `choir-cli` — the terminal viewer/steerer published to npm |
| `packages/protocol/` | Shared wire types spoken by every surface |
| `docs/` | Architecture, security model, and quickstart |

Read [`docs/architecture.md`](docs/architecture.md) to get oriented.

## Conventions

- **Test first.** New logic comes with tests. We use [Vitest](https://vitest.dev); run `pnpm test` before pushing.
- **Keep the host dependency-free.** The plugin's hook scripts (`plugin/bin/*`, `plugin/lib/*`) are plain Node with **no npm dependencies** — they run wherever Node does, with no install step. Please keep it that way.
- **`connect.js` stays in sync.** `cli/lib/connect.js` and `plugin/lib/connect.js` are byte-identical by design (the host mints tokens, the viewer reads them). Change both, and the cross-package test in `cli/test/connect.test.mjs` will keep you honest.
- **Small, focused commits** with clear messages.
- **Redaction is sacred.** Anything that streams host data must pass through the redaction filter (`plugin/lib/redact.js`). Add test cases when you touch it.

## Adding a host adapter

Choir's **relay and CLI are agent-agnostic** — they speak the simple event protocol in `packages/protocol/`. Supporting a new agent (Codex, Cursor, Aider, …) means writing a thin *host adapter* that:

1. Observes the agent's session (its equivalent of Claude Code hooks) and emits Choir events (`prompt`, `tool_call`, `tool_result`, `assistant_text`, `turn_end`, …).
2. Redacts on-host before sending.
3. Injects queued steers back into the session at a safe point.

The shared session, relay, and viewer stay exactly the same. If you're interested, open an issue to coordinate — this is where Choir grows.

## Submitting a pull request

1. Fork the repo and create a branch (`git checkout -b my-change`).
2. Make your change, with tests. Run `pnpm test`.
3. Open a PR against `main` with a clear description. Link any related issue.
4. A maintainer will review. Thanks for your patience — and your contribution!

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE), the same license that covers the project.
