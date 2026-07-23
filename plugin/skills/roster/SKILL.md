---
name: roster
description: Show who is currently connected to the shared Choir session.
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/choir-control" roster --session "${CLAUDE_SESSION_ID}"`
