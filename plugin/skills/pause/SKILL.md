---
name: pause
description: Pause the shared Choir session — hold the agent's tool use until you resume.
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/choir-control" pause --session "${CLAUDE_SESSION_ID}"`
