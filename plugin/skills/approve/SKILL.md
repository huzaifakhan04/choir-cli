---
name: approve
description: Approve pending steer suggestions from suggest-scope teammates so they get injected.
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/choir-control" approve --session "${CLAUDE_SESSION_ID}"`
