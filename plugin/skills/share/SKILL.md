---
name: share
description: Start or reshare this Claude Code session with your team, and print a join code teammates can use to watch and steer it live.
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/choir-share" --session "${CLAUDE_SESSION_ID}" $ARGUMENTS`
