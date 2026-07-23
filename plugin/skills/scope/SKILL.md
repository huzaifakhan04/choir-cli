---
name: scope
description: Change a teammate's permission in the shared session. Usage: /choir:scope <name> <view|suggest|write>.
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/choir-control" scope $ARGUMENTS --session "${CLAUDE_SESSION_ID}"`
