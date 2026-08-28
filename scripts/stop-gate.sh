#!/usr/bin/env bash
#
# The Stop gate: run the checks when there is something to check, one session at
# a time, and never report a busy machine as a broken change.
#
# ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
# It used to be a one-liner in .claude/settings.json that ran the FULL suite on
# every stop. There are 39 worktrees on this machine and several sessions run at
# once, so the gate produced failures it was itself causing. MEASURED
# 2026-08-27: three red results in one evening, a DIFFERENT file each time, and
# every one of those files passed alone.
#
# The tell was the SKIP count. A healthy run of apps/web skips 13. A starved one
# reported 38 skipped with ZERO tests failed, because the file died in its
# beforeAll and its tests were never attempted. A suite that "passes" with a
# raised skip count has not run.
#
# A gate that is randomly red is a gate people learn to skip, which is how this
# suite came to sit outside the gate for twenty runs once before.
#
# ── THE FOUR THINGS IT DOES ──────────────────────────────────────────────────
# 1 · ONE AT A TIME. A machine-wide lock in the SHARED git dir. If another
#     worktree is gating, this one skips and says so. Skipping is not failing —
#     the other run is already loading the same cores.
# 2 · ONLY WHEN SOMETHING CHANGED. It records what it last gated green. An
#     unchanged tree at an unchanged commit is not re-gated.
# 3 · DETERMINISTIC CONCURRENCY. --concurrency=2. Turbo's default fans out
#     across packages and each package's runner fans out again, which is how one
#     gate saturates twelve cores by itself.
# 4 · A FAILURE MUST HAPPEN TWICE. On red it re-runs SERIALLY. A real break
#     fails both times; contention passes the second. Only a break that survives
#     both is reported to the session.
#
# ── WHAT IT DELIBERATELY DOES NOT RUN ────────────────────────────────────────
# The browser suite: it writes to the PRODUCTION database and once minted 12,196
# users. And `build`: the JS budget is only meaningful with Vercel's env, so a
# local build passes green while the deployed one fails on the same commit
# (MEASURED 2026-08-27, /connections).
#
# ── ESCAPE HATCHES ───────────────────────────────────────────────────────────
#   SAHODA_SKIP_GATE=1   skip entirely
#   SAHODA_GATE_DEBUG=1  print each decision and why

INPUT=$(cat 2>/dev/null || true)

# `echo $INPUT` UNQUOTED mangles the JSON, so this test silently never matched
# and the gate could re-enter itself. printf with quotes is the fix.
if [ "$(printf '%s' "$INPUT" | jq -r '.stop_hook_active' 2>/dev/null)" = "true" ]; then
  exit 0
fi

[ "${SAHODA_SKIP_GATE:-}" = "1" ] && exit 0

command -v git >/dev/null 2>&1 || exit 0
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$ROOT" || exit 0

say() { [ "${SAHODA_GATE_DEBUG:-}" = "1" ] && echo "  [gate] $*" >&2; return 0; }

# The COMMON dir is shared by every worktree, which is the right scope: the
# contention is for one machine's cores, not for one branch.
COMMON=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || COMMON="$ROOT/.git"
STATE="$COMMON/sahoda-gate"
mkdir -p "$STATE" 2>/dev/null || true

# ── 1 · ONE AT A TIME ────────────────────────────────────────────────────────
# BRACES, NOT A BARE REDIRECT. `exec 9>file 2>/dev/null` applies the 2>/dev/null
# to the CURRENT SHELL permanently, which silently discarded every later >&2 —
# including the failure report. The first version of this script exited 2 on a
# real break and printed NOTHING, which is worse than not gating at all.
if ! { exec 9>"$STATE/lock"; } 2>/dev/null; then
  exit 0
fi
if ! flock -n 9 2>/dev/null; then
  say "another worktree holds the lock — skipping"
  echo '{"systemMessage":"Checks skipped: another session on this machine is already running them, so nothing was verified here."}'
  exit 0
fi

# ── 2 · ONLY WHEN SOMETHING CHANGED ──────────────────────────────────────────
HEAD_SHA=$(git rev-parse HEAD 2>/dev/null || echo none)
DIRTY=$(git status --porcelain 2>/dev/null | sort | cksum | tr -d ' ')
FINGERPRINT="$HEAD_SHA:$DIRTY"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null | tr '/' '-')
LAST_FILE="$STATE/last-green-${BRANCH:-detached}"

if [ -f "$LAST_FILE" ] && [ "$(cat "$LAST_FILE" 2>/dev/null)" = "$FINGERPRINT" ]; then
  say "unchanged since the last green gate — skipping"
  exit 0
fi

# ── 3 · RUN IT, BOUNDED ──────────────────────────────────────────────────────
LOG="$STATE/last-run.log"
run_gate() {
  TURBO_TELEMETRY_DISABLED=1 pnpm turbo run typecheck test \
    --filter="...[origin/main]" --concurrency="$1" > "$LOG" 2>&1
}

if run_gate 2 && pnpm format:check > /dev/null 2>&1; then
  printf '%s' "$FINGERPRINT" > "$LAST_FILE" 2>/dev/null || true
  say "green"
  exit 0
fi

# ── 4 · A FAILURE MUST HAPPEN TWICE ──────────────────────────────────────────
say "first attempt red — re-running serially to tell a break from a busy machine"
if run_gate 1 && pnpm format:check > /dev/null 2>&1; then
  printf '%s' "$FINGERPRINT" > "$LAST_FILE" 2>/dev/null || true
  echo '{"systemMessage":"Checks passed on a second, slower run. The first red was a busy machine, not your change."}'
  exit 0
fi

# Failed twice. Name the files rather than a count: six unrelated suites red at
# once is an environment, one is a diff.
{
  echo "Checks failed twice, the second time with nothing else running. This is the change, not the machine."
  echo
  grep -E "^ *FAIL |error TS[0-9]+" "$LOG" 2>/dev/null | sed 's/ > .*//' | sort -u | head -12
  echo
  echo "Full output: $LOG"
} >&2
exit 2
