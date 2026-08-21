#!/usr/bin/env bash
set -x
cd /home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-qa || exit 1
pnpm install --frozen-lockfile 2>&1 | tail -30
echo "=== INSTALL EXIT ${PIPESTATUS[0]} ==="
pnpm turbo run build --concurrency=1 2>&1 | tail -60
echo "=== BUILD DONE ==="
