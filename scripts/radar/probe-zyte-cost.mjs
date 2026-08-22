/**
 * Can Radar learn what a Zyte request actually cost, or only what a price list
 * says it should have cost?
 *
 * Zyte's own documentation states that tiers are assigned automatically per
 * target site and that only successful responses are billed — which means the
 * per-competitor price is a property of that competitor's website and cannot be
 * read off any pricing page. If the cost is not in the response, the fetch log's
 * `cost_micros` would be an estimate wearing the name of a measurement.
 *
 * Prints response headers and probes the usage endpoint. Never prints the key.
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

const auth = 'Basic ' + Buffer.from(`${env.ZYTE_API_KEY}:`).toString('base64')

console.log('── one extract, all response headers ────────────────')
const res = await fetch('https://api.zyte.com/v1/extract', {
  method: 'POST',
  headers: { authorization: auth, 'content-type': 'application/json' },
  body: JSON.stringify({ url: 'https://example.com', httpResponseBody: true }),
})
for (const [k, v] of res.headers) console.log(`  ${k}: ${v}`)
const body = await res.json()
console.log('  body keys:', Object.keys(body).join(', '))

console.log('\n── does an account usage endpoint answer? ───────────')
for (const url of [
  'https://api.zyte.com/v1/stats',
  'https://api.zyte.com/v1/usage',
  'https://app.zyte.com/api/accounts/usage',
]) {
  try {
    const r = await fetch(url, { headers: { authorization: auth } })
    const t = await r.text()
    console.log(`  ${url} -> ${r.status} ${t.slice(0, 160).replace(/\s+/g, ' ')}`)
  } catch (e) {
    console.log(`  ${url} -> ${e.name}`)
  }
}
