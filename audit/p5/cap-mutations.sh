#!/usr/bin/env bash
# A cap is only proven by a test that COUNTS PROVIDER CALLS and goes red when the
# cap stops refusing. Each mutation disables one cap at its decision point, then
# runs the suite that claims to cover it. A mutation whose edit matches nothing is
# reported as such and never as a verdict.
set -uo pipefail
WT=/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-audit

mutate() {  # $1 label  $2 abs file  $3 perl expr  $4 pkg dir  $5.. tests
  local label="$1" file="$2" expr="$3" pkg="$4"; shift 4
  echo
  echo "══════════════════════════════════════════════════════════════"
  echo "MUTATION: $label"
  cp "$file" /tmp/cap.bak
  perl -0pi -e "$expr" "$file"
  if cmp -s "$file" /tmp/cap.bak; then
    echo "  !! EDIT MATCHED NOTHING — no verdict, this mutation tested nothing."
    cp /tmp/cap.bak "$file"; return 2
  fi
  diff /tmp/cap.bak "$file" | head -6 | sed 's/^/    /'
  ( cd "$pkg" && timeout 400 npx vitest run "$@" 2>&1 | tail -5 | sed 's/^/    /' )
  cp /tmp/cap.bak "$file"
  echo "  (restored)"
}

mutate "per-day publish cap always allows" \
  "$WT/packages/shared/src/publishing/constraints.ts" \
  's/export function checkPerDayCap\(/export function checkPerDayCap_DISABLED(/; s/^(export function checkPerDayCap_DISABLED\()/export function checkPerDayCap(input: { channel: string; used: number }) { return { allowed: true, cap: 999, used: input.used } }\n$1/m' \
  "$WT/apps/jobs" src/publish/per-day-cap.test.ts

mutate "X monthly ration always allows" \
  "$WT/packages/publishing/src/x-cost.ts" \
  's/export function checkXRation\(/export function checkXRation_DISABLED(/; s/^(export function checkXRation_DISABLED\()/export function checkXRation(input: { used: number }) { return { allowed: true, ration: 999, used: input.used, remaining: 999 } }\n$1/m' \
  "$WT/apps/jobs" src/publish/x-ration.test.ts

mutate "credit HOLD no longer refuses on an insufficient balance" \
  "$WT/packages/billing/src/withCredits.ts" \
  's/if \(isCreditInsufficient\(holdErr\)\)/if (false \&\& isCreditInsufficient(holdErr))/' \
  "$WT/packages/billing" src

echo
echo "=== tree must be clean ==="
git -C "$WT" status --porcelain packages apps
echo "(empty above = every mutation restored)"
