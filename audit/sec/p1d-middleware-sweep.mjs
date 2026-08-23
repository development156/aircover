/**
 * P1d — `isPublicRoute` decides what Clerk DOES; `config.matcher` decides whether
 * it RUNS. A path in the first but not the second still traverses Clerk's parse of
 * the Authorization header, and `[LIVE 2026-08-09]` a bearer of `aaa.bbb.ccc`
 * threw inside that parse and answered 500 on every matched path.
 *
 * The file now wraps `clerk()` in a try/catch, so the argument that the hole is
 * closed is REASONABLE — and an argument is not a measurement. This sends the
 * header at every route on disk and records what comes back.
 *
 * Routes are enumerated from the FILESYSTEM, not from the two lists, because the
 * fourth mismatch nobody checks is a route in neither list that expected to be
 * public: it 307s to /sign-in forever and reads as a routing bug.
 */
import fs from 'node:fs'
import path from 'node:path'

import { WT } from '../lib/env.mjs'

const BASE = process.env.SEC_BASE ?? 'http://127.0.0.1:3253'
const APP = path.join(WT, 'apps', 'web', 'src', 'app')
const MW = fs.readFileSync(path.join(WT, 'apps', 'web', 'src', 'middleware.ts'), 'utf8')

/** Every page and route handler, as the URL path it serves. */
function routes(dir = APP, url = '') {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Route groups `(app)` never appear in a URL. `@slot` and `_private` do not either.
      const seg = /^\(.*\)$/.test(entry.name) ? '' : `/${entry.name}`
      if (entry.name.startsWith('@') || entry.name.startsWith('_')) continue
      out.push(...routes(full, url + seg))
    } else if (/^(page|route)\.tsx?$/.test(entry.name)) {
      out.push({ url: url || '/', kind: entry.name.startsWith('route') ? 'api' : 'page' })
    }
  }
  return out
}

/**
 * The declared public list, read from the source.
 *
 * COMMENTS ARE STRIPPED FIRST. The first draft did not, and invented a route out
 * of prose: "Zernio's inbound events…" pairs its apostrophe with the next quote
 * and yields a 200-character "path". middleware.ts carries a warning about
 * exactly this and `middleware.test.ts` already strips — so this was a defect in
 * the AUDIT, recorded here rather than reported as a finding in the code.
 */
function declaredPublic() {
  const block = MW.slice(
    MW.indexOf('createRouteMatcher(['),
    MW.indexOf('])', MW.indexOf('createRouteMatcher([')),
  )
  const code = block.replace(/^\s*\/\/.*$/gm, '')
  return [...code.matchAll(/'([^']+)'/g)].map((m) => m[1])
}

/** The paths `config.matcher` excludes — Clerk never runs for these. */
function matcherExclusions() {
  const cfg = MW.slice(MW.indexOf('export const config'))
  return [...cfg.matchAll(/api\/[a-z/]+\$/g)].map((m) => `/${m[0].slice(0, -1)}`)
}

const PUBLIC = declaredPublic()
const EXCLUDED = [...new Set(matcherExclusions())]

const isPublic = (u) =>
  PUBLIC.some((p) => new RegExp(`^${p.replace(/\(\.\*\)/g, '.*').replace(/\//g, '\\/')}$`).test(u))

async function hit(url, headers) {
  try {
    const res = await fetch(`${BASE}${url}`, { headers, redirect: 'manual' })
    return res.status
  } catch (error) {
    return `ERR ${error.cause?.code ?? error.message}`
  }
}

// A dynamic segment cannot be fetched as written; substitute something harmless.
const concrete = (u) => u.replace(/\[\[?\.\.\.([^\]]+)\]\]?/g, 'x').replace(/\[([^\]]+)\]/g, 'x')

const all = routes().sort((a, b) => a.url.localeCompare(b.url))
const rows = []
for (const r of all) {
  const u = concrete(r.url)
  const plain = await hit(u, {})
  const bearer = await hit(u, { Authorization: 'Bearer aaa.bbb.ccc' })
  const cookie = await hit(u, { Cookie: '__session=aaa.bbb.ccc' })
  rows.push({
    url: r.url,
    kind: r.kind,
    public: isPublic(r.url),
    clerkSkipped: EXCLUDED.includes(r.url),
    plain,
    bearer,
    cookie,
  })
}

const out = path.join(WT, 'audit', 'out', 'p1d-middleware.json')
fs.writeFileSync(
  out,
  JSON.stringify({ base: BASE, declaredPublic: PUBLIC, matcherExcluded: EXCLUDED, rows }, null, 1),
)

const crashed = rows.filter((r) => r.bearer === 500 || r.cookie === 500 || r.plain === 500)
const publicNotExcluded = rows.filter((r) => r.public && !r.clerkSkipped)
const excludedNotPublic = EXCLUDED.filter((u) => !isPublic(u))

console.log(
  `routes on disk: ${rows.length}   declared public: ${PUBLIC.length}   clerk-skipped: ${EXCLUDED.length}`,
)
console.log(`\n500s under a malformed credential: ${crashed.length}`)
for (const r of crashed)
  console.log(`  ${r.url}  plain=${r.plain} bearer=${r.bearer} cookie=${r.cookie}`)
console.log(
  `\npublic but NOT excluded from the matcher (Clerk still parses the header): ${publicNotExcluded.length}`,
)
for (const r of publicNotExcluded)
  console.log(`  ${r.url.padEnd(32)} plain=${r.plain} bearer=${r.bearer} cookie=${r.cookie}`)
console.log(
  `\nexcluded from the matcher but NOT in the public list: ${excludedNotPublic.join(', ') || '(none)'}`,
)
console.log(`\nAPI routes in NEITHER list, answering something other than a redirect:`)
for (const r of rows.filter((x) => x.kind === 'api' && !x.public))
  console.log(`  ${r.url.padEnd(46)} plain=${r.plain} bearer=${r.bearer}`)
console.log(`\n→ ${out}`)

/**
 * ── THE SECOND HALF: POST, WHICH IS HOW A WEBHOOK ACTUALLY ARRIVES ──────────
 * A GET at a POST-only route answers 405, and a 405 already proves the request
 * reached the handler — so middleware did not crash. But the crash is in Clerk's
 * header parse, which runs before the method is looked at, and asserting on the
 * shape nobody uses is how a sweep passes without covering the traffic.
 */
const POSTABLE = [
  '/api/webhooks/zernio',
  '/api/webhooks/cashfree',
  '/api/webhooks/clerk',
  '/api/public/beta-apply',
  '/api/public/site-lead',
  '/api/admin/devops/ingest',
  '/api/cron/sweeps',
  '/api/cron/metrics',
  '/api/cron/loop',
  '/api/cron/playbooks',
]
console.log('\n── POST, with a malformed bearer ──')
for (const u of POSTABLE) {
  const post = async (headers) => {
    try {
      const res = await fetch(`${BASE}${u}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: '{}',
        redirect: 'manual',
      })
      return res.status
    } catch (e) {
      return `ERR ${e.cause?.code ?? e.message}`
    }
  }
  const plain = await post({})
  const bearer = await post({ Authorization: 'Bearer aaa.bbb.ccc' })
  const twoPart = await post({ Authorization: 'Bearer aaa.bbb' })
  const wellFormed = await post({ Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.x' })
  console.log(
    `  ${u.padEnd(30)} plain=${plain} bearer(3-part junk)=${bearer} 2-part=${twoPart} well-formed=${wellFormed}`,
  )
}

console.log('\n── declared public entries with no route on disk ──')
const onDisk = new Set(all.map((r) => r.url))
for (const p of PUBLIC) {
  const base = p.replace('(.*)', '')
  const found = [...onDisk].some((u) => u === base || u.startsWith(`${base}/`))
  if (!found) console.log(`  ${p}  ← no page.tsx or route.ts serves this`)
}
