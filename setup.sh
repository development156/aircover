#!/usr/bin/env bash
#
# The repo-root entrypoint for a cloud environment's "Setup script" field.
#
#   bash setup.sh
#
# ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
# The field used to point straight at `scripts/cloud-setup.sh`. On a branch that
# does not carry that file, bash exits 127 — and the harness treats ANY non-zero
# exit from the setup script as "Setup script failed" and then REFUSES to start
# the session. MEASURED 2026-08-30 on the wt-karunesh2 and wt-karunesh3
# environments:
#
#   bash: scripts/cloud-setup.sh: No such file or directory
#   Setup script failed with exit code 127.
#   Session couldn't start.
#
# `main` is the only branch in this repository missing that script: it is a
# 20-route pre-history-reset skeleton, 800+ commits stale, and is NOT the
# product. An environment pointed at it dies here every time.
#
# ── THE ONE RULE THIS FILE OBEYS ─────────────────────────────────────────────
# It ALWAYS exits 0. A session that starts can be TOLD what is wrong and can
# repair itself — `/kickoff` step 0 runs cloud-setup.sh when it can prove it
# never ran. A session that never starts cannot be told anything at all.
#
# NO `set -e`. That is the whole point.

set -o pipefail 2>/dev/null || true

# Work from the repository root however we were invoked — the harness may run
# this from somewhere else, and a bare relative path would fail the same way the
# old field value did.
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || ROOT=""
if [ -z "$ROOT" ]; then
  ROOT=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd) || ROOT=""
fi
[ -n "$ROOT" ] && cd "$ROOT" 2>/dev/null

BRANCH=$(git branch --show-current 2>/dev/null) || BRANCH=""
printf '\n  sahoda setup · %s · branch %s\n' "$(pwd)" "${BRANCH:-unknown}"

if [ -f scripts/cloud-setup.sh ]; then
  bash scripts/cloud-setup.sh
  exit 0
fi

ROUTES=$(find apps/web/src/app -name 'page.tsx' 2>/dev/null | wc -l)
cat <<MSG

  ─────────────────────────────────────────────────────────────────────────
  This environment cannot set itself up, and the session is starting anyway
  so that it can tell you why.

  scripts/cloud-setup.sh is not in this checkout.
    directory   $(pwd)
    branch      ${BRANCH:-unknown}
    routes      ${ROUTES:-0}    (the product has 60)

  Almost always this means the environment is pointed at a branch that is
  not a lane. 'main' is a 20-route skeleton, 800+ commits stale, and is NOT
  the product — it is the only branch here without that script.

  Fix it in the cloud environment's settings, not in code:

    Branch            wt-karunesh2   (or wt-karunesh3, wt-divas, wt-jiban,
                                      wt-girija — each with a 2 and a 3)
    Setup script      bash setup.sh
    SAHODA_LANE_OWNER karunesh       (or divas | jiban | girija)

  SAHODA_LANE_OWNER is not optional for a karunesh lane: .githooks/pre-push
  keys on it, so leaving it unset turns OFF the block that keeps that lane
  out of wt-core and wt-web. It does not announce itself.

  Then start a new session. Nothing here needs a code change.
  ─────────────────────────────────────────────────────────────────────────

MSG
exit 0
