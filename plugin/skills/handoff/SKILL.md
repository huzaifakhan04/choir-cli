---
name: handoff
description: "Hand the driver's seat to a teammate (usage: /choir:handoff <name>). They continue the session on their machine with the shared context; you become a viewer."
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/choir-control" handoff $ARGUMENTS --session "${CLAUDE_SESSION_ID}"`
