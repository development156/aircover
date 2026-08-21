#!/usr/bin/env bash
cd /home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-qa/apps/web || exit 1
exec pnpm exec next start -p 3238
