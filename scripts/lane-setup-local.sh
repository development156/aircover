#!/usr/bin/env bash
#
# Make ONE machine ready to run all twelve lanes locally.
#
# ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
# The lanes used to be split across accounts and cloud sessions. They are not
# any more: one person, one machine, one Claude account, twelve lanes. That
# arrangement needs four things per lane that nothing sets up on its own, and
# three of the four fail SILENTLY when they are missing.
#
#   1 · the worktree            — nine of the twelve had none
#   2 · the commit author       — Vercel REFUSES to build a commit not authored
#                                 SAHODALABS, and prints nothing anyone sees.
#                                 MEASURED 2026-07-25: a5f32c3 (IDIVASM) BLOCKED,
#                                 identical tree re-authored (24e46d0) READY.
#   3 · core.hooksPath          — without it the push guard that keeps a lane out
#                                 of wt-web and main is simply OFF. Found unset in
#                                 a live worktree on 2026-08-28: built, tested,
#                                 then silently not armed.
#   4 · a private E2E_PORT      — every worktree defaults to 3100 and Playwright's
#                                 `reuseExistingServer` attaches to whatever is
#                                 already listening. One lane once tested another
#                                 lane's build twice and nearly reported it as its
#                                 own.
#
# ── THE AUTHOR TRAP, WHICH IS WHY 2 IS SET THE WAY IT IS ─────────────────────
# This repo has `extensions.worktreeConfig = true`. A new worktree is BORN with a
# per-worktree config shadowing the repo-level author, so plain `git config
# user.name` writes the repo file, reads back the old value, and reports success.
# That is the actual mechanism behind the blocked commit above. Only
# `git config --worktree` takes, and it has to be re-run per worktree.
#
# ── IDEMPOTENT ───────────────────────────────────────────────────────────────
# Safe to re-run. It creates what is missing, corrects what is wrong, and touches
# nothing that is already right. It does NOT delete a worktree, does NOT install
# dependencies (that is 1.1 GB a lane — see the report at the end), and does NOT
# fetch or move any branch.
#
#   bash scripts/lane-setup-local.sh          # set up, then verify
#   bash scripts/lane-setup-local.sh --check  # verify only, change nothing
#
# Exits non-zero if any lane is not ready, so it can gate a session start.

set -uo pipefail

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

AUTHOR_NAME='SAHODALABS'
AUTHOR_EMAIL='development@sahodalabs.com'

# The lane, its owner, and the port it alone may use. The port is the third
# field so a lane's identity and its port can never drift apart in two lists.
# 3100 is deliberately absent: it is the unset default, so a lane that lost its
# E2E_PORT collides with nothing rather than silently joining wt-core.
LANES=(
  'wt-girija:girija:3201'
  'wt-girija2:girija:3202'
  'wt-girija3:girija:3203'
  'wt-jiban:jiban:3204'
  'wt-jiban2:jiban:3205'
  'wt-jiban3:jiban:3206'
  'wt-divas:divas:3207'
  'wt-divas2:divas:3208'
  'wt-divas3:divas:3209'
  'wt-karunesh:karunesh:3210'
  'wt-karunesh2:karunesh:3211'
  'wt-karunesh3:karunesh:3212'
)

ROOT="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"
ROOT="${ROOT%/.git}"
[ -d "$ROOT" ] || { echo "not inside the repository"; exit 1; }
TREES="$ROOT/.claude/worktrees"
HERE="$(git rev-parse --show-toplevel)"

# The env file this worktree is using, as the source for every lane's copy.
SRC_ENV="$HERE/apps/web/.env.local"

FAIL=0
ACTED=0
NEED_INSTALL=()

ok()   { printf '  \033[32mok\033[0m      %s\n' "$*"; }
did()  { printf '  \033[36mset\033[0m     %s\n' "$*"; ACTED=$((ACTED+1)); }
bad()  { printf '  \033[31mMISSING\033[0m %s\n' "$*"; FAIL=$((FAIL+1)); }

echo
echo "── twelve lanes, one machine ────────────────────────────────────────────"
echo "   repo   $ROOT"
echo "   mode   $([ $CHECK_ONLY = 1 ] && echo 'check only, nothing is changed' || echo 'set up and verify')"
echo

if [ ! -f "$SRC_ENV" ]; then
  echo "  apps/web/.env.local is absent from this worktree, so no lane can be given one."
  echo "  That file is never in git. Restore it by hand before re-running."
  exit 1
fi

for ENTRY in "${LANES[@]}"; do
  LANE="${ENTRY%%:*}"
  REST="${ENTRY#*:}"
  OWNER="${REST%%:*}"
  PORT="${REST##*:}"
  DIR="$TREES/$LANE"

  printf '\033[1m%s\033[0m  owner=%s  port=%s\n' "$LANE" "$OWNER" "$PORT"

  # ── 1 · a local branch, then a worktree ────────────────────────────────────
  # A lane worked only in the cloud has no local ref at all. Create it FROM THE
  # REMOTE rather than from HEAD: HEAD is whatever this worktree happens to be
  # on, and a lane silently branched off the wrong commit is worse than absent.
  if ! git -C "$HERE" rev-parse --verify -q "refs/heads/$LANE" >/dev/null; then
    if [ $CHECK_ONLY = 1 ]; then bad "no local branch"; continue; fi
    if git -C "$HERE" rev-parse --verify -q "refs/remotes/origin/$LANE" >/dev/null; then
      git -C "$HERE" branch --track "$LANE" "origin/$LANE" >/dev/null 2>&1 \
        && did "branch created from origin/$LANE"
    else
      bad "neither a local branch nor origin/$LANE — fetch first"; continue
    fi
  fi

  if [ ! -d "$DIR" ]; then
    if [ $CHECK_ONLY = 1 ]; then bad "no worktree at $DIR"; continue; fi
    if git -C "$HERE" worktree add "$DIR" "$LANE" >/dev/null 2>&1; then
      did "worktree created"
    else
      bad "worktree could not be created (is the branch checked out elsewhere?)"; continue
    fi
  fi

  # ── 2 · the author, per worktree, because the repo-level one is shadowed ───
  CUR_N="$(git -C "$DIR" config --worktree user.name 2>/dev/null || true)"
  CUR_E="$(git -C "$DIR" config --worktree user.email 2>/dev/null || true)"
  if [ "$CUR_N" != "$AUTHOR_NAME" ] || [ "$CUR_E" != "$AUTHOR_EMAIL" ]; then
    if [ $CHECK_ONLY = 1 ]; then bad "author is '$CUR_N <$CUR_E>' — Vercel will refuse to build"; else
      git -C "$DIR" config --worktree user.name  "$AUTHOR_NAME"
      git -C "$DIR" config --worktree user.email "$AUTHOR_EMAIL"
      did "author pinned"
    fi
  fi

  # ── 3 · the guard, and who this lane says it is ────────────────────────────
  if [ "$(git -C "$DIR" config core.hooksPath 2>/dev/null || true)" != ".githooks" ]; then
    if [ $CHECK_ONLY = 1 ]; then bad "core.hooksPath unset — the push guard is OFF"; else
      git -C "$DIR" config core.hooksPath .githooks; did "hooks armed"
    fi
  fi
  # --worktree, for the SAME reason the author above is: with
  # extensions.worktreeConfig on, a plain `git config` writes the SHARED file
  # that every worktree reads. Twelve lanes writing their own owner into one
  # shared key leaves whichever ran last, and this is not cosmetic — the
  # pre-push guard reads `sahoda.owner` to decide whether a lane may write
  # wt-core. Getting it wrong either lets a karunesh lane push the trunk or
  # locks every lane out of it. Both were observed, in that order, on the run
  # that produced this comment.
  if [ "$(git -C "$DIR" config sahoda.owner 2>/dev/null || true)" != "$OWNER" ] \
  || [ "$(git -C "$DIR" config sahoda.lane 2>/dev/null || true)" != "$LANE" ]; then
    if [ $CHECK_ONLY = 1 ]; then bad "sahoda.owner is '$(git -C "$DIR" config sahoda.owner 2>/dev/null || echo unset)', expected '$OWNER' — the push guard reads this"; else
      # Clear the shared key first so it can never shadow or be shadowed.
      git -C "$DIR" config --local --unset-all sahoda.owner 2>/dev/null || true
      git -C "$DIR" config --local --unset-all sahoda.lane  2>/dev/null || true
      git -C "$DIR" config --worktree sahoda.owner "$OWNER"
      git -C "$DIR" config --worktree sahoda.lane  "$LANE"
      did "owner and lane pinned (per worktree)"
    fi
  fi

  # ── 4 · the env file, carrying this lane's own port ────────────────────────
  # Copied rather than symlinked: a symlink would make one lane's edit rewrite
  # every other lane's secrets, and the port line is per-lane by definition.
  DST_ENV="$DIR/apps/web/.env.local"
  if [ ! -f "$DST_ENV" ] || ! grep -q "^E2E_PORT=$PORT\$" "$DST_ENV" 2>/dev/null; then
    if [ $CHECK_ONLY = 1 ]; then bad ".env.local absent or carries the wrong E2E_PORT"; else
      mkdir -p "$(dirname "$DST_ENV")"
      grep -v '^E2E_PORT=' "$SRC_ENV" > "$DST_ENV"
      printf '\n# This lane only. Every worktree defaults to 3100 and Playwright\n' >> "$DST_ENV"
      printf '# attaches to whatever is already listening on it.\nE2E_PORT=%s\n' "$PORT" >> "$DST_ENV"
      chmod 600 "$DST_ENV"
      did ".env.local written with E2E_PORT=$PORT"
    fi
  fi

  # Dependencies are reported, never installed: 1.1 GB a lane is the user's call.
  [ -d "$DIR/node_modules" ] || NEED_INSTALL+=("$LANE")

  # ── the verdict for this lane ─────────────────────────────────────────────
  if [ -d "$DIR" ] \
  && [ "$(git -C "$DIR" config --worktree user.name 2>/dev/null)" = "$AUTHOR_NAME" ] \
  && [ "$(git -C "$DIR" config core.hooksPath 2>/dev/null)" = ".githooks" ] \
  && [ "$(git -C "$DIR" config sahoda.owner 2>/dev/null)" = "$OWNER" ] \
  && [ -f "$DST_ENV" ] \
  && grep -q "^E2E_PORT=$PORT\$" "$DST_ENV" 2>/dev/null; then
    ok "ready · $(git -C "$DIR" rev-parse --short HEAD 2>/dev/null) · $(git -C "$DIR" var GIT_AUTHOR_IDENT | sed 's/ [0-9]* [+-][0-9]*$//')"
  fi
  echo
done

echo "── what is left ─────────────────────────────────────────────────────────"
if [ ${#NEED_INSTALL[@]} -gt 0 ]; then
  echo "  ${#NEED_INSTALL[@]} lane(s) have no node_modules and cannot run a gate yet:"
  echo "    ${NEED_INSTALL[*]}"
  echo "  Install ONLY the lane you are about to work in — roughly 1.1 GB each:"
  echo "    (cd $TREES/<lane> && pnpm install)"
else
  echo "  every lane has dependencies installed"
fi

echo
echo "── how many at once ─────────────────────────────────────────────────────"
TOTAL_KB=$(awk '/^MemTotal:/{print $2}' /proc/meminfo 2>/dev/null || echo 0)
AVAIL_KB=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo 2>/dev/null || echo 0)
echo "  RAM $((TOTAL_KB/1024/1024)) GB total, $((AVAIL_KB/1024/1024)) GB available now."
echo "  A dev server plus a gate is roughly 2 GB a lane. Twenty-two kernel OOM"
echo "  kills were recorded in three hours with FOUR sessions running, and an OOM"
echo "  kill surfaces as a failed gate rather than as an out-of-memory message."
echo "  Run three or four lanes at once, not twelve. Check with:  journalctl -k | grep -i oom"

echo
if [ $FAIL -gt 0 ]; then
  echo "  $FAIL problem(s). Re-run without --check to fix what can be fixed."
  exit 1
fi
[ $ACTED -gt 0 ] && echo "  $ACTED change(s) made. All twelve lanes are ready." || echo "  All twelve lanes were already ready. Nothing changed."
exit 0
