#!/usr/bin/env bash
#
# Prove a Claude Code account is fully set up for this repo. Exits non-zero if
# anything is missing, so "it looked fine" is never the answer.
#
# Run after scripts/account-import.sh in a new account, local or cloud.
set -uo pipefail
ROOT=$(git rev-parse --show-toplevel) || exit 1
cd "$ROOT"
FAIL=0
ok()   { printf "  \033[32mOK  \033[0m %s\n" "$1"; }
bad()  { printf "  \033[31mMISS\033[0m %s\n" "$1"; printf "       -> %s\n" "$2"; FAIL=1; }
warn() { printf "  \033[33mNOTE\033[0m %s\n" "$1"; }

echo
echo "  ── things that arrive with the clone ──"
for pair in "commands:20" "agents:26" "skills:22"; do
  d=${pair%%:*}; want=${pair##*:}
  n=$(ls ".claude/$d" 2>/dev/null | wc -l)
  [ "$n" -ge "$want" ] && ok ".claude/$d ($n)" || bad ".claude/$d has $n, expected >= $want" "your clone is incomplete or on the wrong branch"
done
[ -f .claude/settings.json ] && ok "project settings" || bad "project .claude/settings.json" "wrong branch?"
for h in pre-commit pre-push; do
  [ -x ".githooks/$h" ] && ok ".githooks/$h" || bad ".githooks/$h missing or not executable" "chmod +x .githooks/$h"
done

echo
echo "  ── things you must switch on by hand ──"
HP=$(git config core.hooksPath 2>/dev/null || true)
[ "$HP" = ".githooks" ] && ok "core.hooksPath = .githooks" \
  || bad "core.hooksPath is '${HP:-unset}'" "git config core.hooksPath .githooks   <-- guards are OFF without this"

R=$(find "$HOME/.claude/rules" -name '*.md' 2>/dev/null | wc -l)
[ "$R" -ge 21 ] && ok "personal rules restored ($R files)" \
  || bad "only $R rule files in ~/.claude/rules" "bash scripts/account-import.sh"

for f in apps/web/.env apps/web/.env.local; do
  [ -f "$f" ] && ok "$f present" || bad "$f missing" "restore it by hand — it is not in git and never will be"
done

echo
echo "  ── does the toolchain actually run? ──"
if command -v pnpm >/dev/null 2>&1; then ok "pnpm on PATH"; else bad "pnpm not found" "install pnpm"; fi
if [ -d node_modules ]; then ok "dependencies installed"; else bad "node_modules missing" "pnpm install"; fi

if command -v node >/dev/null 2>&1 && [ -f scripts/sandbox-probe.mjs ]; then
  V=$(node scripts/sandbox-probe.mjs 2>/dev/null | grep -oE 'Verdict: [A-Z_]+' | awk '{print $2}')
  case "${V:-}" in
    FULL|LOCAL_ONLY) ok "browser probe: $V (the suite can run here)" ;;
    NO_BROWSER)      bad "browser probe: NO_BROWSER" "pnpm --filter @sahoda/web exec playwright install chromium" ;;
    *)               warn "browser probe did not reach a verdict — run it directly to see why" ;;
  esac
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "  Everything checked is present. Now run the real gate:"
  echo "    pnpm turbo run typecheck lint test --concurrency=2"
  echo "    pnpm format:check"
else
  echo "  INCOMPLETE — fix the MISS lines above and run this again." >&2
fi
exit "$FAIL"
