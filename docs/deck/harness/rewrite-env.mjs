/**
 * Repoint the wt-shots worktree's environment at the LOCAL stand-in, and REMOVE
 * every credential that could reach a live third party during a screenshot run.
 *
 * Removal, not blanking: several of these are `z.string().min(1).optional()` or
 * carry a regex, so an empty string is a PRESENT-and-INVALID value that fails the
 * boot. Absent is the state the schema is built to tolerate.
 *
 * Prints names only — never a value.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const WT = '/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-shots'
const LOCAL = 'http://127.0.0.1:3223'

const OVERRIDE = {
  NEXT_PUBLIC_SUPABASE_URL: LOCAL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-standin-anon-not-a-key',
  NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3221',
}

// Anything that would let this run reach out, spend, or report.
const REMOVE = new Set([
  'SUPABASE_PROJECT_REF',
  'SUPABASE_DB_URL',
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'SUPABASE_ANON_KEY',
  // Live publishing/inbox rail against REAL customer accounts. Absent → the app
  // says "not configured" instead of calling out.
  'ZERNIO_API_KEY',
  // No crash reports from a demo box.
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
  // Money.
  'STRIPE_SECRET_KEY',
  'STRIPE_STARTER_PRICE_ID',
  'RAZORPAY_KEY_ID',
  'CASHFREE_APP_ID',
  'CASHFREE_SECRET_KEY',
  // Background work + infra.
  'TRIGGER_SECRET_KEY',
  'TRIGGER_PROJECT_ID',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_ZONE_ID',
  'RESEND_API_KEY',
  'DEVOPS_INGEST_TOKEN',
])

for (const rel of ['.env', 'apps/web/.env']) {
  const path = `${WT}/${rel}`
  const out = []
  const seen = new Set()
  const removed = []

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)
    if (!m) {
      out.push(line)
      continue
    }
    const key = m[1]
    if (REMOVE.has(key)) {
      removed.push(key)
      continue
    }
    if (key in OVERRIDE) {
      out.push(`${key}=${OVERRIDE[key]}`)
      seen.add(key)
      continue
    }
    out.push(line)
  }
  for (const [k, v] of Object.entries(OVERRIDE)) {
    if (!seen.has(k)) out.push(`${k}=${v}`)
  }

  writeFileSync(path, out.join('\n'))
  console.log(`${rel}: removed ${removed.length} vars -> ${removed.join(', ')}`)
  console.log(`${rel}: repointed ${Object.keys(OVERRIDE).join(', ')}\n`)
}
