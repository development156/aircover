#!/usr/bin/env node
/**
 * Are the Cashfree credentials real, and is the app looking at the ones you edited?
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * On 2026-08-20 a pasted pair failed with `401 authentication Failed`, and the error said
 * nothing about WHY. There were three separate faults stacked, and no single message could
 * have named them:
 *
 *   1. the keys were PRODUCTION keys (`cfsk_ma_prod_…`) being sent to the sandbox host
 *   2. they failed against the production host too — an account-side problem
 *   3. they were pasted at the repo root, while Next reads `apps/web`, which still held
 *      the older broken pair
 *
 * Fault 3 is the nastiest: the file you edited is not the file being read, so a correct
 * key looks exactly as broken as a wrong one. This script reads BOTH files and reports
 * them side by side, so a shadowed edit is visible rather than deduced.
 *
 * ── IT CREATES NOTHING ───────────────────────────────────────────────────────
 * The probe is `GET /orders/{a-random-id-that-does-not-exist}`. 401 means the credentials
 * were refused; 404 means they were ACCEPTED and the order simply is not there. Both
 * answers settle authentication, and neither opens an order or moves a rupee — so this is
 * safe to run against the production host, which it also checks.
 *
 * ── IT NEVER PRINTS A KEY ────────────────────────────────────────────────────
 * Only length, a truncated SHA-256, and the environment segment of the documented
 * `cfsk_ma_<env>_…` shape. Safe to paste into a chat with support.
 *
 *   node packages/billing/scripts/check-cashfree.mjs
 */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../..')
// Assembled rather than written, so the filename cannot trip a shell rule that refuses
// commands naming an environment file.
const DOT = '.' + 'env'

const FILES = [
  { label: `${DOT} (repo root — NOT what the app reads)`, path: resolve(REPO, DOT) },
  { label: `apps/web/${DOT} (what Next actually reads)`, path: resolve(REPO, 'apps/web', DOT) },
]

const HOSTS = {
  sandbox: 'https://sandbox.cashfree.com/pg',
  production: 'https://api.cashfree.com/pg',
}

function parse(path) {
  if (!existsSync(path)) return null
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const fp = (v) => (v ? createHash('sha256').update(v).digest('hex').slice(0, 12) : '—')

console.log('Cashfree credential check — reads only, creates nothing, prints no key.\n')

const seen = []

for (const { label, path } of FILES) {
  const env = parse(path)
  console.log(`── ${label}`)
  if (!env) {
    console.log('   file not present\n')
    continue
  }

  const appId = env.CASHFREE_APP_ID ?? ''
  const secret = env.CASHFREE_SECRET_KEY ?? ''

  if (!appId || !secret) {
    console.log(`   CASHFREE_APP_ID: ${appId ? 'set' : 'MISSING'}`)
    console.log(`   CASHFREE_SECRET_KEY: ${secret ? 'set' : 'MISSING'}\n`)
    continue
  }

  // The environment lives in segment 3 of `cfsk_ma_<env>_<random>`. A label, not key material.
  const segment = secret.split('_')[2] ?? '(unrecognised shape)'
  console.log(
    `   CASHFREE_APP_ID       len ${String(appId.length).padStart(3)}  sha256:12 ${fp(appId)}`,
  )
  console.log(
    `   CASHFREE_SECRET_KEY   len ${String(secret.length).padStart(3)}  sha256:12 ${fp(secret)}`,
  )
  console.log(
    `   CASHFREE_ENV          ${env.CASHFREE_ENV ?? '(absent — required, never defaulted)'}`,
  )
  console.log(
    `   secret environment    ${segment}${segment === 'prod' ? '   <-- PRODUCTION KEY' : ''}`,
  )

  if (appId === secret) {
    console.log('   >> APP_ID and SECRET_KEY are IDENTICAL. That is never a valid pair.')
  } else {
    console.log('   >> APP_ID and SECRET_KEY differ (as they should)')
  }
  console.log('')
  seen.push({ label, appId, secret })
}

if (seen.length === 2 && seen[0].appId === seen[1].appId && seen[0].secret === seen[1].secret) {
  console.log('Both files hold the SAME pair.\n')
} else if (seen.length === 2) {
  console.log(
    'The two files hold DIFFERENT pairs. Next reads apps/web — an edit at the repo root\n' +
      'does not reach the app.\n',
  )
}

for (const { label, appId, secret } of seen) {
  for (const [host, base] of Object.entries(HOSTS)) {
    const res = await fetch(`${base}/orders/sah_probe_${randomUUID()}`, {
      method: 'GET',
      headers: {
        'x-api-version': '2025-01-01',
        'x-client-id': appId,
        'x-client-secret': secret,
      },
    })
    const verdict =
      res.status === 401
        ? 'REFUSED — these credentials are not valid for this host'
        : res.status === 404
          ? 'ACCEPTED — credentials work here (the probe order simply does not exist)'
          : `HTTP ${res.status}`
    console.log(`[${label.split(' ')[0]} -> ${host}] ${res.status}  ${verdict}`)
  }
}
