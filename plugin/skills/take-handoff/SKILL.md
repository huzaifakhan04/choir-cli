---
name: take-handoff
description: Pick up a Claude Code session a teammate handed off to you — load the shared context and become the session's driver. Run after `npx choircode take`.
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/choir-take-handoff" --session "${CLAUDE_SESSION_ID}"`
