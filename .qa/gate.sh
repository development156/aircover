#!/usr/bin/env bash
cd /home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-qa || exit 1
node scripts/gate.mjs
echo "=== GATE RC $? ==="
