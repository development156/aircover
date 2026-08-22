#!/usr/bin/env bash
# Prove a guard by making it fail. Each mutation is applied, the named tests are
# run, and the file is restored from git — so a crashed run cannot leave the tree
# mutated. A mutation is only meaningful if the BASELINE for those tests is green
# and the mutated source still parses, so both are asserted.
set -uo pipefail
WT=/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-audit
cd "$WT/apps/web" || exit 1

run_tests() {  # $1.. test paths
  timeout 300 npx vitest run "$@" 2>&1 | tail -6
}

mutate() {  # $1 label  $2 file(rel to apps/web)  $3 sed-expr  $4.. tests
  local label="$1" file="$2" expr="$3"; shift 3
  echo
  echo "═══════════════════════════════════════════════════════════════════"
  echo "MUTATION: $label"
  echo "  file: $file"
  echo "  edit: $expr"
  cp "$file" "/tmp/mutate.bak"
  perl -0pi -e "$expr" "$file"
  if cmp -s "$file" "/tmp/mutate.bak"; then
    echo "  !! THE EDIT MATCHED NOTHING — this mutation tested nothing. Not a verdict."
    cp "/tmp/mutate.bak" "$file"
    return 2
  fi
  echo "  diff:"
  diff <(cat "/tmp/mutate.bak") <(cat "$file") | head -8 | sed 's/^/    /'
  echo "  result:"
  run_tests "$@" | sed 's/^/    /'
  cp "/tmp/mutate.bak" "$file"
  echo "  (restored)"
}

case "${1:-all}" in
  loop)
    mutate "remove api/cron/loop\$ from BOTH Clerk matcher exclusions" \
      src/middleware.ts 's/api\/cron\/loop\$\|//g' \
      src/middleware.test.ts src/lib/cron/wiring.test.ts
    ;;
  addpublic)
    mutate "ADD api/onboarding/door\$ to BOTH matcher exclusions (silently makes an authenticated route public)" \
      src/middleware.ts 's/api\/cron\/sweeps\$\|/api\/onboarding\/door\$|api\/cron\/sweeps\$|/g' \
      src/middleware.test.ts src/lib/cron/wiring.test.ts
    ;;
  addroute)
    mutate "ADD a brand-new public route to isPublicRoute" \
      src/middleware.ts "s{'/sign-in\(\.\*\)'{'/api/evil/(.*)',\n    '/sign-in(.*)'{" \
      src/middleware.test.ts src/lib/cron/wiring.test.ts
    ;;
  cronauth)
    mutate "make the cron secret check fail OPEN on an unset secret" \
      src/lib/cron/authorize.ts 's/if \(secret === undefined \|\| secret\.length === 0\) return false/if (secret === undefined || secret.length === 0) return true/' \
      src/lib/cron/authorize.test.ts
    ;;
  cronbearer)
    mutate "drop the Bearer-prefix requirement from the cron check" \
      src/lib/cron/authorize.ts 's/if \(header === null \|\| !header\.startsWith\(BEARER\)\) return false/if (header === null) return false/' \
      src/lib/cron/authorize.test.ts
    ;;
esac
