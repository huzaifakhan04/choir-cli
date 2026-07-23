---
name: kick
description: Remove a teammate from the shared Choir session by name (revokes their access).
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/choir-control" kick $ARGUMENTS --session "${CLAUDE_SESSION_ID}"`
