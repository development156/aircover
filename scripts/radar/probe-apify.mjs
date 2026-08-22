/**
 * MEASUREMENT 3 — what does one competitor's social check ACTUALLY cost?
 *
 * Not what a pricing page says. Apify reports `usageTotalUsd` on the run itself,
 * so this makes one real request against one real Indian small-business Instagram
 * account and prints the number Apify charged, plus what the run returned — which
 * decides what a snapshot payload can honestly contain.
 *
 * Spends real money: about a fifth of a US cent. Run once.
 *
 *   node scripts/radar/probe-apify.mjs [handle]
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
const handle = process.argv[2] || 'bluetokaicoffee'
const ACTOR = 'apify~instagram-profile-scraper'

console.log(`running ${ACTOR} for @${handle} …`)
const started = Date.now()

const run = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/runs?waitForFinish=180`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ usernames: [handle] }),
})
const runBody = await run.json()
if (!run.ok) {
  console.log('run failed:', run.status, JSON.stringify(runBody).slice(0, 400))
  process.exit(1)
}
const d = runBody.data

console.log('\n── the run ──────────────────────────────────')
console.log('  status          ', d.status)
console.log('  wall clock      ', ((Date.now() - started) / 1000).toFixed(1) + 's')
console.log('  usageTotalUsd   ', d.usageTotalUsd)
console.log('  computeUnits    ', d.stats?.computeUnits)
console.log('  datasetId       ', d.defaultDatasetId)

const items = await (
  await fetch(`https://api.apify.com/v2/datasets/${d.defaultDatasetId}/items`, {
    headers: { authorization: `Bearer ${token}` },
  })
).json()

console.log('\n── what it returned ─────────────────────────')
console.log('  items:', items.length)
const p = items[0] ?? {}
console.log('  top-level keys:', Object.keys(p).sort().join(', '))
for (const k of [
  'username',
  'fullName',
  'followersCount',
  'followsCount',
  'postsCount',
  'verified',
  'businessCategoryName',
]) {
  console.log(`    ${k.padEnd(22)} ${JSON.stringify(p[k])}`)
}
const posts = p.latestPosts ?? p.posts ?? []
console.log(`  latestPosts: ${posts.length}`)
if (posts[0]) {
  console.log('    post keys:', Object.keys(posts[0]).sort().join(', '))
  console.log(
    '    first post:',
    JSON.stringify({
      id: posts[0].id ?? posts[0].shortCode,
      timestamp: posts[0].timestamp,
      likes: posts[0].likesCount,
      comments: posts[0].commentsCount,
      caption: String(posts[0].caption ?? '').slice(0, 80),
    }),
  )
}

const micros = Math.round(Number(d.usageTotalUsd) * 1_000_000)
console.log('\n── the number the founder needs ─────────────')
console.log(`  one social check = $${d.usageTotalUsd} = ${micros} micros`)
console.log(
  `  per competitor per YEAR at daily cadence = $${(Number(d.usageTotalUsd) * 365).toFixed(2)}`,
)
