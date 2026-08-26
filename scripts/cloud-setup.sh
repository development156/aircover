#!/usr/bin/env bash
#
# Sahoda Labs — Claude Code cloud sandbox setup.
#
#   Setup script field:   bash scripts/cloud-setup.sh
#
# It holds NO secret. It reads environment variables set on the cloud
# environment and writes the three .env files this repository needs. That is why
# it is safe in git.
#
# The 47 names below were read out of the working apps/web/.env on 2026-08-22
# (names only, never values) — they are what actually runs, not a guess. An
# earlier version of this script was written from a grep of `process.env` and
# was wrong in eight places: there is no OPENROUTER_API_KEY (there are three:
# _TEXT, _RESEARCH, _IMAGE), no ENCRYPTION_KEY (it is TOKEN_VAULT_KEY), and
# DATABASE_URL, SUPABASE_DB_CA_CERT, CRON_SECRET, ZERNIO_WEBHOOK_SECRET and
# NEXT_PUBLIC_SENTRY_DSN are read by source but are NOT in the working env.
#
# Anything missing is REPORTED, never invented.
#
# NO `set -e` and NO `set -u`, both deliberately.
#
#   set -e  : the cloud harness treats ANY non-zero exit from the setup script
#             as "Setup script failed" and then REFUSES to start Claude Code.
#             A setup script must never block the session. It reports; the
#             session decides. Measured 2026-08-24: an earlier version of this
#             file exited 1 on a missing required variable and killed the
#             session before Claude Code ever started.
#   set -u  : `${!v:-}` indirect expansion still trips "unbound variable" on
#             bash older than 4.4, which would abort before printing anything.
#
# This script ALWAYS exits 0. Problems are printed, and written to
# .sahoda-setup-status so /kickoff can read them.
set -o pipefail 2>/dev/null || true

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  ok       %s\n' "$*"; }
gap()  { printf '  absent   %s\n' "$*"; }
bad()  { printf '  FAIL     %s\n' "$*"; }

# ── REQUIRED — the app cannot boot and the gate cannot run without these ──────
ENV_REQUIRED=(
  NEXT_PUBLIC_SUPABASE_URL           # BARE ORIGIN, no trailing path
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_DB_URL                    # the ap-south-1 POOLER host. The direct
                                     # host is IPv6-only and every paid action
                                     # dies against it.
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_JWT_SECRET
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  CLERK_SECRET_KEY
)

# ── The rest of the working environment ──────────────────────────────────────
# A missing key here degrades one feature honestly. This product is built to
# say what it cannot do rather than fake a result, so absence is a visible
# state, not a crash.
ENV_OPTIONAL=(
  # auth and admin
  CLERK_WEBHOOK_SECRET  ADMIN_BOOTSTRAP_EMAILS  OPS_ALLOW_SELF_APPROVE
  TURNSTILE_SECRET_KEY  NEXT_PUBLIC_TURNSTILE_SITE_KEY
  # AI — THREE OpenRouter keys, not one
  OPENROUTER_API_KEY_TEXT  OPENROUTER_API_KEY_RESEARCH  OPENROUTER_API_KEY_IMAGE
  OPENAI_API_KEY  GOOGLE_GEMINI_API_KEY
  # publishing and connections
  ZERNIO_API_KEY  X_CLIENT_ID  LINKEDIN_CLIENT_ID  META_APP_ID
  GOOGLE_OAUTH_CLIENT_ID  GOOGLE_OAUTH_CLIENT_SECRET
  TOKEN_VAULT_KEY                    # the AES vault. Tokens decrypt in memory
                                     # and are never logged or returned.
  # payments
  CASHFREE_APP_ID  CASHFREE_SECRET_KEY  CASHFREE_ENV
  RAZORPAY_KEY_ID  STRIPE_SECRET_KEY  STRIPE_STARTER_PRICE_ID
  # jobs and ops
  TRIGGER_PROJECT_ID  TRIGGER_SECRET_KEY  JOB_SIGNING_SECRET  DEVOPS_INGEST_TOKEN
  # infrastructure
  UPSTASH_REDIS_REST_URL  UPSTASH_REDIS_REST_TOKEN  SENTRY_DSN  RESEND_API_KEY
  CLOUDFLARE_ACCOUNT_ID  CLOUDFLARE_API_TOKEN  CLOUDFLARE_ZONE_ID
  # radar
  APIFY_TOKEN  ZYTE_API_KEY
  # web
  NEXT_PUBLIC_APP_URL  NEXT_PUBLIC_SITE_DOMAIN
  # MCP — .mcp.json interpolates CONTEXT7_API_KEY. SUPABASE_PROJECT_REF is also
  # interpolated but is written once, explicitly, below: listing it in both
  # places emitted the key TWICE into every .env, caught by this script's own
  # self-test rather than by reading it.
  CONTEXT7_API_KEY
)

# Safe indirect read: works on every bash, never trips set -u.
val() { eval "printf '%s' \"\${$1}\"" 2>/dev/null; }

say "1 · Environment variables"
MISSING=(); SET_COUNT=0
for v in "${ENV_REQUIRED[@]}"; do
  if [ -n "$(val "$v")" ]; then ok "$v"; SET_COUNT=$((SET_COUNT+1))
  else gap "$v   <- REQUIRED"; MISSING+=("$v"); fi
done
for v in "${ENV_OPTIONAL[@]}"; do
  if [ -n "$(val "$v")" ]; then ok "$v"; SET_COUNT=$((SET_COUNT+1)); else gap "$v"; fi
done

# ── Fixed values that are not secrets ────────────────────────────────────────
# SAHODA_E2E_ACK_TARGET is a GUARD, not a knob: Playwright refuses at module
# scope without it. It exists because this suite wrote to the production
# database on every gate run for months and minted 12,196 Clerk users.
# E2E_PORT must be explicit, or turbo's strict env stripping drops it and every
# sandbox lands on the same default port.
: "${SUPABASE_PROJECT_REF:=rloztdhzfliyvpvxsgjl}"
: "${SAHODA_E2E_ACK_TARGET:=rloztdhzfliyvpvxsgjl}"
: "${E2E_PORT:=3100}"

say "2 · Writing the three .env files"
# All three, every time. They are gitignored so they never arrive with a clone,
# and apps/web/.env.local is the one Playwright reads — two sessions could not
# run their smoke suite at all for want of exactly that file.
write_env() {
  local target="$1"; mkdir -p "$(dirname "$target")"; : > "$target"; chmod 600 "$target"
  local v
  for v in "${ENV_REQUIRED[@]}" "${ENV_OPTIONAL[@]}"; do
    _x=$(val "$v"); [ -n "$_x" ] && printf '%s=%s\n' "$v" "$_x" >> "$target"
  done
  printf 'SUPABASE_PROJECT_REF=%s\n'  "$SUPABASE_PROJECT_REF"  >> "$target"
  printf 'SAHODA_E2E_ACK_TARGET=%s\n' "$SAHODA_E2E_ACK_TARGET" >> "$target"
  printf 'E2E_PORT=%s\n'              "$E2E_PORT"              >> "$target"
  ok "$target  ($(wc -l < "$target") vars)"
}
write_env .env
write_env apps/web/.env
write_env apps/web/.env.local

say "3 · Lane owner"
# The BRANCH says the role. It cannot say the person: two people both running
# /lead-design get two branches that both say "design". Declared, or the handoff
# filename falls back to a branch id nobody can read.
if [ -n "${SAHODA_LANE_OWNER:-}" ]; then
  git config sahoda.owner "$SAHODA_LANE_OWNER" 2>/dev/null
  ok "owner = $SAHODA_LANE_OWNER"
elif [ -n "$(git config sahoda.owner 2>/dev/null)" ]; then
  ok "owner = $(git config sahoda.owner)"
else
  gap "SAHODA_LANE_OWNER not set. Handoffs will be filed under the branch id."
  echo "         Set it in this environment's variables (girija | jiban | divas)"
  echo "         or run: git config sahoda.owner <name>"
fi

say "4 · Git identity"
# A fresh checkout is authored as the personal account, and Vercel BLOCKS a
# deployment whose HEAD is not authored SAHODALABS.
git config user.name  "SAHODALABS"
git config user.email "development@sahodalabs.com"
ok "$(git config user.name) <$(git config user.email)>"

say "5 · Dependencies"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile >/tmp/pnpm-install.log 2>&1 \
    && ok "pnpm install" \
    || { bad "pnpm install failed, last 15 lines:"; tail -15 /tmp/pnpm-install.log; }
else
  bad "pnpm not found"
fi

say "6 · Where you are"
git fetch --all --prune --quiet 2>/dev/null || true
ROUTES=$(find apps/web/src/app -name 'page.tsx' 2>/dev/null | wc -l)
BRANCH=$(git branch --show-current 2>/dev/null || echo '?')
printf '  branch     %s\n' "$BRANCH"
printf '  head       %s\n' "$(git log -1 --format='%h %s' 2>/dev/null | cut -c1-64)"
printf '  routes     %s\n' "$ROUTES"
if [ "${ROUTES:-0}" -lt 40 ] 2>/dev/null; then
  bad "Only $ROUTES routes. The product has 58."
  echo "         You are on a stale base. Every 'main' in this repository is"
  echo "         690+ commits behind. Cut your branch from origin/wt-web."
else
  ok "$ROUTES routes, this is the current product"
fi
case "$BRANCH" in
  wt-girija|wt-jiban|wt-divas) ok "on a working lane" ;;
  wt-core|wt-web)
    bad "$BRANCH is a shared branch and is NOT a working lane."
    echo "         Everyone shares one GitHub account, so nothing stops you"
    echo "         committing here. Switch to wt-girija, wt-jiban or wt-divas."
    ;;
  *) gap "$BRANCH is not one of the three named lanes" ;;
esac

# ── Is somebody else already working this lane? ──────────────────────────────
# One Claude account and one GitHub account means two sessions CAN land on the
# same branch, and git will not warn you until the second push is rejected.
# Compare against the remote before any work starts.
if git rev-parse --verify -q "origin/$BRANCH" >/dev/null 2>&1; then
  AHEAD=$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0)
  BEHIND=$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo 0)
  if [ "$BEHIND" -gt 0 ] && [ "$AHEAD" -gt 0 ]; then
    bad "DIVERGED from origin/$BRANCH: $AHEAD local, $BEHIND remote."
    echo "         Another session has pushed this lane. Do NOT force-push."
    echo "         Find out who, and rebase or hand over deliberately."
  elif [ "$BEHIND" -gt 0 ]; then
    gap "origin/$BRANCH is $BEHIND ahead of you. Someone pushed. Pull before you work."
  elif [ "$AHEAD" -gt 0 ]; then
    gap "you hold $AHEAD unpushed commit(s) from a previous session on this lane"
  else
    ok "level with origin/$BRANCH"
  fi
  LASTBY=$(git log -1 --format='%cr' "origin/$BRANCH" 2>/dev/null)
  [ -n "$LASTBY" ] && printf '  last push  %s\n' "$LASTBY"
else
  gap "origin/$BRANCH does not exist yet"
fi

say "7 · MCP"
if [ -f .mcp.json ]; then
  ok "$(grep -cE '^\s{4}"[a-z0-9-]+":' .mcp.json 2>/dev/null || echo '?') servers declared"
  [ -z "${CONTEXT7_API_KEY:-}" ] && gap "CONTEXT7_API_KEY, context7 starts but cannot authenticate"
else
  bad ".mcp.json absent, no MCP servers will load"
fi

say "Result"
STATUS=".sahoda-setup-status"
if [ ${#MISSING[@]} -gt 0 ]; then
  bad "${#MISSING[@]} REQUIRED variable(s) absent: ${MISSING[*]}"
  echo
  echo "  The session will still start. It just cannot reach the database or"
  echo "  Clerk until these are set in this environment's settings."
  echo
  echo "  Do NOT invent values, and do NOT un-skip a test that skipped for want"
  echo "  of them. A suite that ran nothing reports as passing, which is how"
  echo "  twenty-six billing tests never executed for months."
  {
    echo "INCOMPLETE"
    echo "missing_required=${MISSING[*]}"
    echo "set_count=$SET_COUNT"
  } > "$STATUS" 2>/dev/null
else
  ok "All ${#ENV_REQUIRED[@]} required present; $SET_COUNT set in total."
  { echo "OK"; echo "set_count=$SET_COUNT"; } > "$STATUS" 2>/dev/null
fi
# ── THE SCRATCH-FILE GUARD ───────────────────────────────────────────────────
# `.githooks/pre-commit` refuses a commit that stages `ops/state/qa.pending.json`,
# which every gate run rewrites. Pointed at here rather than left to each person
# to remember, because the rule was broken twice in three commits by `git add -A`
# on 2026-08-25 — once immediately after being fixed for the same reason.
git config core.hooksPath .githooks 2>/dev/null || true

echo
echo "  Next: run /kickoff. It pulls, restores your own context from the last"
echo "  handoff, and reads what the other two lanes did before you plan."


# ALWAYS succeed. A non-zero exit here stops Claude Code from starting at all,
# and a session that cannot start cannot tell you what is wrong.
exit 0
