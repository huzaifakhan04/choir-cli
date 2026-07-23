---
name: resume
description: Resume a paused Choir session so the agent can use tools again.
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/choir-control" resume --session "${CLAUDE_SESSION_ID}"`
