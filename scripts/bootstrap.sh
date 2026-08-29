#!/usr/bin/env bash
#
# One command that sets up this repo on a fresh Claude Code account.
#
#   bash scripts/bootstrap.sh
#
# Safe to run twice. It changes nothing it has not printed first, it never
# touches a .env file, and it ends by PROVING the result rather than assuring
# you of it. Everything it cannot do itself is listed at the end with the exact
# step, because four parts of this genuinely need a human.
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "  Not in a git repo. Clone first." >&2; exit 1; }
cd "$ROOT"

step() { printf "\n  \033[1m%s\033[0m\n" "$1"; }
ok()   { printf "    ok    %s\n" "$1"; }
skip() { printf "    --    %s\n" "$1"; }
warn() { printf "    !!    %s\n" "$1"; }

echo "  Setting up $(basename "$ROOT") on branch $(git branch --show-current 2>/dev/null)"

# ── 1 · branch ───────────────────────────────────────────────────────────────
step "1 · Branch"
CUR=$(git branch --show-current 2>/dev/null || echo "")
case "$CUR" in
  wt-core|wt-*|claude/*) ok "on $CUR" ;;
  main|master)
    warn "on '$CUR', which is 800+ commits stale here and is NOT the product"
    warn "switch with: git checkout wt-core" ;;
  *) ok "on ${CUR:-detached}" ;;
esac

# ── 2 · dependencies ─────────────────────────────────────────────────────────
step "2 · Dependencies"
if command -v pnpm >/dev/null 2>&1; then
  if [ -d node_modules ]; then
    ok "already installed"
  else
    echo "    installing (a few minutes)…"
    pnpm install --frozen-lockfile >/dev/null 2>&1 && ok "installed" || warn "pnpm install failed — run it directly to see why"
  fi
else
  warn "pnpm not on PATH. Install it, then re-run this script."
fi

# ── 3 · the guards ───────────────────────────────────────────────────────────
# One command, and forgetting it silently disarms BOTH the QA-scratch guard and
# the push block that keeps wt-karunesh out of wt-core. Found unset in a live
# worktree on 2026-08-28, weeks after the guard was written and tested.
step "3 · Git guards"
git config core.hooksPath .githooks
[ "$(git config core.hooksPath)" = ".githooks" ] && ok "core.hooksPath = .githooks" || warn "could not set core.hooksPath"

# ── 4 · personal rules and settings ──────────────────────────────────────────
step "4 · Personal rules and settings"
if [ -d ops/account-transfer ]; then
  bash scripts/account-import.sh 2>/dev/null | grep -E "rules restored|settings merged|backed up" | sed 's/^/    /' || true
  R=$(find "$HOME/.claude/rules" -name '*.md' 2>/dev/null | wc -l)
  [ "$R" -ge 21 ] && ok "$R rule files in place" || warn "only $R rule files — run: bash scripts/account-import.sh"
else
  skip "no ops/account-transfer/ in this branch"
fi

# ── 5 · the browser ──────────────────────────────────────────────────────────
# Playwright ships a downloader, not a browser. Nothing installed one for weeks,
# which is the whole reason the browser tests were UNRUN on every cloud lane.
step "5 · Browser for the tests"
if command -v pnpm >/dev/null 2>&1 && [ -d node_modules ]; then
  if pnpm --filter @sahoda/web exec playwright install chromium >/dev/null 2>&1; then
    ok "chromium ready"
  else
    warn "install failed — run: pnpm --filter @sahoda/web exec playwright install chromium"
  fi
else
  skip "needs dependencies first"
fi

# ── 6 · prove it ─────────────────────────────────────────────────────────────
step "6 · Proving the setup"
if bash scripts/account-verify.sh; then
  VERIFIED=0
else
  VERIFIED=1
fi

# ── 7 · what only a person can do ────────────────────────────────────────────
cat <<'MSG'

  ─────────────────────────────────────────────────────────────────────
  FOUR THINGS NO SCRIPT CAN DO. Nothing works without the first two.

  1. The two secret files. Copy them in by hand:
       apps/web/.env
       apps/web/.env.local
     They are not in git and never will be.

  2. Reconnect the integrations:  /mcp
     GitHub needs a pasted token. Vercel, Supabase, Sentry and Resend are
     sign-in pop-ups.

  3. Re-install the plugins. `bash scripts/account-import.sh` prints the
     list, including the private `divas-personal` marketplace.

  4. For CLOUD sessions only: paste the same secret values into the cloud
     session's environment settings once. `scripts/cloud-setup.sh` then
     runs on its own and does steps 2, 3 and 5 above for you.
  ─────────────────────────────────────────────────────────────────────
MSG

if [ "$VERIFIED" -eq 0 ]; then
  echo "  Setup is complete. Last check, and it is the real one:"
  echo "    pnpm turbo run typecheck lint test --concurrency=2"
  echo "    pnpm format:check"
else
  echo "  Setup is INCOMPLETE — the MISS lines above say exactly what is left." >&2
fi
exit 0
