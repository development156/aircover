#!/usr/bin/env bash
cd /home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-qa || exit 1
node .qa/sweep.mjs "$1" "$2" "$3"
echo "=== SWEEP EXIT $? ==="
