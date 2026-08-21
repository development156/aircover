#!/usr/bin/env bash
cd /home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-qa || exit 1
pkill -f "next start -p 3238"
pnpm turbo run build --concurrency=1 2>&1 | tail -8
echo "=== BUILD EXIT ${PIPESTATUS[0]} ==="
cd apps/web && setsid nohup pnpm exec next start -p 3238 > ../../.qa/serve2.log 2>&1 &
echo "=== SERVER RESTARTED ==="
