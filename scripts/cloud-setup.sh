#!/usr/bin/env bash
#
# Sahoda Labs — Claude Code cloud sandbox setup.
#
#   Setup script field:  bash scripts/cloud-setup.sh
#
# It reads ENVIRONMENT VARIABLES from the cloud environment's own settings and
# materialises the three .env files this repository needs. It contains no secret
# itself, which is why it is safe in git.
#
# The variable names below were read out of the source with
#   grep -rhoE 'process\.env\.[A-Z_][A-Z0-9_]*' apps packages
# on 2026-08-24, not guessed. Re-derive them the same way when this drifts.
#
# Anything missing is REPORTED, never invented. A sandbox that half-works while
# claiming to be ready is the failure this whole repository is built against.
#
set -uo pipefail

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  ok       %s\n' "$*"; }
gap()  { printf '  absent   %s\n' "$*"; }
bad()  { printf '  FAIL     %s\n' "$*"; }

# ── REQUIRED — without these the app cannot boot and the gate cannot run ──────
ENV_REQUIRED=(
  NEXT_PUBLIC_SUPABASE_URL          # must be the BARE ORIGIN, no trailing path
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_DB_URL                   # use the ap-south-1 POOLER host, not the
                                    # direct host: the direct one is IPv6-only
                                    # and every paid action dies against it
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  CLERK_SECRET_KEY
)

# ── OPTIONAL — each absence is a visible, honest "not configured" state ───────
# This product is built to say what it cannot do rather than fake a result, so
# a missing key degrades a feature; it does not crash the app.
ENV_OPTIONAL=(
  # database
  SUPABASE_SERVICE_ROLE_KEY  SUPABASE_JWT_SECRET  SUPABASE_DB_CA_CERT  DATABASE_URL
  # secrets and jobs
  TOKEN_VAULT_KEY  CRON_SECRET
  # AI — note these are TWO keys, not one OPENROUTER_API_KEY
  OPENROUTER_API_KEY_TEXT  OPENROUTER_API_KEY_RESEARCH
  # publishing
  ZERNIO_API_KEY  ZERNIO_WEBHOOK_SECRET
  # payments
  CASHFREE_APP_ID  CASHFREE_SECRET_KEY
  # infrastructure
  UPSTASH_REDIS_REST_URL  UPSTASH_REDIS_REST_TOKEN
  SENTRY_DSN  NEXT_PUBLIC_SENTRY_DSN  NEXT_PUBLIC_SENTRY_ENVIRONMENT
  SENTRY_ORG  SENTRY_PROJECT  SENTRY_AUTH_TOKEN
  # radar
  APIFY_TOKEN  ZYTE_API_KEY
  # web
  NEXT_PUBLIC_APP_URL  NEXT_PUBLIC_TURNSTILE_SITE_KEY
  # MCP — .mcp.json interpolates CONTEXT7_API_KEY and SUPABASE_PROJECT_REF.
  # Without them the context7 and supabase MCP servers start but cannot
  # authenticate. SUPABASE_PROJECT_REF is NOT listed here: it is written once,
  # explicitly, below. Listing it in both places emitted the key TWICE into
  # every .env file — caught by this script's own self-test, not by reading it.
  CONTEXT7_API_KEY
)

say "1 · Environment variables"
MISSING=(); SET_COUNT=0
for v in "${ENV_REQUIRED[@]}"; do
  if [ -n "${!v:-}" ]; then ok "$v"; SET_COUNT=$((SET_COUNT+1))
  else gap "$v   ← REQUIRED"; MISSING+=("$v"); fi
done
for v in "${ENV_OPTIONAL[@]}"; do
  if [ -n "${!v:-}" ]; then ok "$v"; SET_COUNT=$((SET_COUNT+1)); else gap "$v"; fi
done

# ── Fixed values that are not secrets ────────────────────────────────────────
# SAHODA_E2E_ACK_TARGET is a GUARD, not a knob: Playwright refuses at module
# scope without it. It exists because this suite wrote to the production
# database on every gate run for months and minted 12,196 Clerk users.
# E2E_PORT must be explicit — turbo's strict env stripping drops it otherwise,
# and every sandbox then lands on the same default port.
: "${SUPABASE_PROJECT_REF:=rloztdhzfliyvpvxsgjl}"
: "${SAHODA_E2E_ACK_TARGET:=rloztdhzfliyvpvxsgjl}"
: "${E2E_PORT:=3100}"

say "2 · Writing the three .env files"
# All three, every time. They are gitignored so they never arrive with a clone,
# and apps/web/.env.local is the one Playwright reads — two sessions could not
# run their smoke suite at all for want of exactly that file.
write_env() {
  local target="$1"; mkdir -p "$(dirname "$target")"; : > "$target"
  local v
  for v in "${ENV_REQUIRED[@]}" "${ENV_OPTIONAL[@]}"; do
    [ -n "${!v:-}" ] && printf '%s=%s\n' "$v" "${!v}" >> "$target"
  done
  printf 'SUPABASE_PROJECT_REF=%s\n'  "$SUPABASE_PROJECT_REF"  >> "$target"
  printf 'SAHODA_E2E_ACK_TARGET=%s\n' "$SAHODA_E2E_ACK_TARGET" >> "$target"
  printf 'E2E_PORT=%s\n'              "$E2E_PORT"              >> "$target"
  chmod 600 "$target"
  ok "$target  ($(wc -l < "$target") vars)"
}
write_env .env
write_env apps/web/.env
write_env apps/web/.env.local

say "3 · Git identity"
# A fresh checkout is authored as the personal account, and Vercel BLOCKS a
# deployment whose HEAD is not authored SAHODALABS.
git config user.name  "SAHODALABS"
git config user.email "development@sahodalabs.com"
ok "$(git config user.name) <$(git config user.email)>"

say "4 · Dependencies"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile >/tmp/pnpm-install.log 2>&1 \
    && ok "pnpm install" \
    || { bad "pnpm install failed — last 15 lines:"; tail -15 /tmp/pnpm-install.log; }
else
  bad "pnpm not found"
fi

say "5 · Where you are"
git fetch --all --quiet 2>/dev/null || true
ROUTES=$(find apps/web/src/app -name 'page.tsx' 2>/dev/null | wc -l)
printf '  branch     %s\n' "$(git branch --show-current 2>/dev/null || echo '?')"
printf '  head       %s\n' "$(git log -1 --format='%h %s' 2>/dev/null | cut -c1-64)"
printf '  routes     %s\n' "$ROUTES"
if [ "${ROUTES:-0}" -lt 40 ] 2>/dev/null; then
  bad "Only $ROUTES routes. The product has 58."
  echo "         You are on a stale base — every 'main' in this repository is"
  echo "         690+ commits behind. Cut your branch from origin/wt-web."
else
  ok "$ROUTES routes — this is the current product"
fi

say "6 · MCP"
if [ -f .mcp.json ]; then
  ok "$(grep -cE '^\s{4}"[a-z0-9-]+":' .mcp.json 2>/dev/null || echo '?') servers declared in .mcp.json"
  [ -z "${CONTEXT7_API_KEY:-}" ] && gap "CONTEXT7_API_KEY — context7 will start but not authenticate"
else
  bad ".mcp.json absent — no MCP servers will load"
fi

say "Result"
if [ ${#MISSING[@]} -gt 0 ]; then
  bad "${#MISSING[@]} REQUIRED variable(s) absent: ${MISSING[*]}"
  echo
  echo "  Set them in this environment's settings and re-run. Do NOT invent"
  echo "  values, and do NOT un-skip a test that skipped for want of them — a"
  echo "  suite that ran nothing reports as passing, which is how twenty-six"
  echo "  billing tests never executed for months."
  exit 1
fi
ok "All ${#ENV_REQUIRED[@]} required variables present; $SET_COUNT set in total."
echo
echo "  Next: run /lead-design or /lead-research. Either one auto-restores its"
echo "  own context from docs/workflow/handoffs/ before asking you anything."
