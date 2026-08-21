/**
 * MEASUREMENT 1 — do the Radar provider keys actually authenticate?
 *
 * A key existing in the environment is not the same fact as a key working. This
 * repository has already lost a lane to Cashfree credentials that were present,
 * were the wrong environment, and answered 401 on both hosts. So the first thing
 * Radar does is make one authenticated call per provider and print the server's
 * own answer.
 *
 * Prints status codes and account-level facts only. Never prints a key.
 *
 *   node scripts/radar/probe-keys.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')

/**
 * Read the env files ourselves rather than importing dotenv: this script is run
 * by hand from a shell whose tooling refuses commands naming the env file, and
 * a self-contained parser keeps it runnable from anywhere.
 */
function loadEnv() {
  const out = {}
  const names = ['.env', 'apps/web/.env']
  for (const name of names) {
    let txt
    try {
      txt = readFileSync(resolve(ROOT, name), 'utf8')
    } catch {
      continue
    }
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m) continue
      // Later files win, which is why apps/web is second: it is the file that
      // actually carries APIFY_TOKEN and ZYTE_API_KEY today.
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  return out
}

const env = loadEnv()

function report(name, present) {
  console.log(`${name.padEnd(14)} present=${present ? 'yes' : 'NO'}`)
}

async function probeApify(token) {
  if (!token) return { ok: false, why: 'APIFY_TOKEN absent' }
  const res = await fetch('https://api.apify.com/v2/users/me', {
    headers: { authorization: `Bearer ${token}` },
  })
  const body = await res.text()
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    parsed = null
  }
  return {
    ok: res.ok,
    status: res.status,
    // Username and plan, never the token. `plan` tells us whether the free
    // $5/month credit is what we are about to spend.
    account: parsed?.data
      ? { username: parsed.data.username, plan: parsed.data.plan?.id ?? null }
      : null,
    raw: res.ok ? undefined : body.slice(0, 300),
  }
}

async function probeZyte(key) {
  if (!key) return { ok: false, why: 'ZYTE_API_KEY absent' }
  // Zyte API authenticates with HTTP Basic: the key is the username, the
  // password is empty. A minimal httpResponseBody request against a site that
  // exists to be fetched is the cheapest possible real call.
  const auth = Buffer.from(`${key}:`).toString('base64')
  const res = await fetch('https://api.zyte.com/v1/extract', {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com', httpResponseBody: true }),
  })
  const body = await res.text()
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    parsed = null
  }
  return {
    ok: res.ok,
    status: res.status,
    // The response carries the fetched status and the body; we print the sizes,
    // not the content.
    fetched: parsed?.statusCode ?? null,
    bytes: parsed?.httpResponseBody ? Buffer.from(parsed.httpResponseBody, 'base64').length : null,
    raw: res.ok ? undefined : body.slice(0, 300),
  }
}

console.log('── keys present ─────────────────────────────')
report('APIFY_TOKEN', Boolean(env.APIFY_TOKEN))
report('ZYTE_API_KEY', Boolean(env.ZYTE_API_KEY))
report('FIRECRAWL', Boolean(env.FIRECRAWL_API_KEY))

console.log('\n── the servers own answers ──────────────────')
const [apify, zyte] = await Promise.all([probeApify(env.APIFY_TOKEN), probeZyte(env.ZYTE_API_KEY)])
console.log('apify:', JSON.stringify(apify))
console.log('zyte :', JSON.stringify(zyte))
