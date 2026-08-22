/**
 * Where does a PAY-PER-EVENT Apify actor report what it charged?
 *
 * The first measurement printed `usageTotalUsd: 0` for a run that plainly did
 * work — 12 posts and a follower count came back. `usageTotalUsd` covers platform
 * COMPUTE, and the Instagram actors are billed per RESULT instead, so a run can
 * do real chargeable work and still report zero there. Writing that 0 into
 * `radar_fetch_log.cost_micros` would be a fabricated zero in the founder's cost
 * report — the exact failure this codebase keeps having to unlearn.
 *
 * So: dump the whole run object and the account's usage, and find the field that
 * knows.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const env = {}
for (const name of ['.env', 'apps/web/.env']) {
  let txt
  try {
    txt = readFileSync(resolve(ROOT, name), 'utf8')
  } catch {
    continue
  }
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
const token = env.APIFY_TOKEN
const H = { authorization: `Bearer ${token}` }

const runs = await (
  await fetch('https://api.apify.com/v2/actor-runs?limit=1&desc=1', { headers: H })
).json()
const runId = runs.data.items[0].id
console.log('most recent run:', runId)

const full = (
  await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, { headers: H })).json()
).data

console.log('\n── every field on the run that mentions cost/charge/usage ──')
for (const [k, v] of Object.entries(full)) {
  if (/usage|charge|price|cost|tier/i.test(k)) {
    console.log(`  ${k}:`, JSON.stringify(v))
  }
}
console.log('\n  all run keys:', Object.keys(full).sort().join(', '))

console.log('\n── account usage this month ────────────────────')
for (const path of ['/v2/users/me/usage/monthly', '/v2/users/me/limits']) {
  const r = await fetch(`https://api.apify.com${path}`, { headers: H })
  const t = await r.text()
  console.log(`  ${path} -> ${r.status}`)
  if (r.ok) {
    const j = JSON.parse(t).data
    // Print only the money, never the whole blob.
    const interesting = Object.fromEntries(
      Object.entries(j).filter(([k]) => /usd|usage|credit|limit|current/i.test(k)),
    )
    console.log('   ', JSON.stringify(interesting).slice(0, 900))
  } else {
    console.log('   ', t.slice(0, 200))
  }
}
