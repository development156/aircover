#!/usr/bin/env node
/**
 * A JavaScript budget that FAILS THE BUILD.
 *
 * ── WHY IT RUNS INSIDE `next build` AND NOT AS A SIXTH GATE STAGE ────────────
 * The numbers it checks only exist after a build, and `turbo build` is the gate's
 * last stage. A separate stage after it would have to re-derive the build's own
 * output; running here means the budget is checked by every `pnpm build`,
 * `turbo build` and Vercel deploy, not only by the one command that remembers to.
 *
 * ── WHAT IT MEASURES ────────────────────────────────────────────────────────
 * The bytes a browser must download before a route is interactive: every chunk
 * `app-build-manifest.json` lists for that route, plus the shared entry chunks,
 * de-duplicated, summed from the files on disk. That is Next's own "First Load
 * JS" figure computed from the artifacts rather than scraped from its log.
 *
 * ── WHAT IT CANNOT SEE, STATED SO NOBODY READS SILENCE AS COVERAGE ──────────
 *  · Bytes fetched AFTER load — a dynamic import, a lazily-loaded editor, an
 *    image, a font. A route can pass this budget and still ship 2 MB.
 *  · Anything the SERVER does. A route with one chunk and forty queries is green.
 *  · Compression. These are on-disk bytes; the wire figure is smaller and varies
 *    with the CDN's encoder, so a budget in wire bytes would move without anyone
 *    changing code.
 *  · Routes absent from the manifest, which is why an unknown route is a FAILURE
 *    below rather than a skip.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const NEXT = path.join(WEB, '.next')
const BUDGET_FILE = path.join(WEB, 'scripts/perf/js-budget.json')

/** Chunks every route loads, which the per-route manifest entry does not repeat. */
function sharedChunks() {
  const p = path.join(NEXT, 'build-manifest.json')
  if (!fs.existsSync(p)) return []
  const m = JSON.parse(fs.readFileSync(p, 'utf8'))
  return [...(m.rootMainFiles ?? []), ...(m.polyfillFiles ?? [])].filter(
    // The polyfill bundle is served `nomodule`: a modern browser parses the tag
    // and never fetches it. Counting it would inflate every route by 112 kB of
    // bytes no customer of this product downloads.
    (f) => !f.includes('polyfills'),
  )
}

function bytesOf(files) {
  let total = 0
  for (const f of new Set(files)) {
    const p = path.join(NEXT, f)
    if (fs.existsSync(p)) total += fs.statSync(p).size
  }
  return total
}

function main() {
  const manifestPath = path.join(NEXT, 'app-build-manifest.json')
  if (!fs.existsSync(manifestPath)) {
    console.error(`js-budget: no ${path.relative(WEB, manifestPath)} — run a build first.`)
    return 1
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const shared = sharedChunks()

  const measured = {}
  for (const [key, chunks] of Object.entries(manifest.pages)) {
    // API routes ship no client JS; a budget on them measures the shared entry
    // and nothing about the route, so it would only ever fire as noise.
    if (key.startsWith('/api/')) continue
    const route = key.replace(/\/page$/, '') || '/'
    measured[route] = bytesOf([...shared, ...chunks])
  }

  if (process.env.PERF_BUDGET_WRITE === '1') {
    fs.writeFileSync(BUDGET_FILE, JSON.stringify(measured, null, 2) + '\n')
    console.log(
      `js-budget: wrote ${Object.keys(measured).length} routes to ${path.relative(WEB, BUDGET_FILE)}`,
    )
    return 0
  }

  if (!fs.existsSync(BUDGET_FILE)) {
    console.error(`js-budget: no budget file. Create one with PERF_BUDGET_WRITE=1.`)
    return 1
  }
  const budget = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'))

  /**
   * Headroom, in bytes, before a route is called a regression.
   *
   * Not a percentage: a percentage gives the biggest routes — the ones that can
   * least afford to grow — the largest allowance, which is backwards. 8 kB is
   * roughly one more component, so an ordinary change passes and a new dependency
   * does not.
   */
  const SLACK = 8 * 1024

  const failures = []
  for (const [route, size] of Object.entries(measured)) {
    const allowed = budget[route]
    if (allowed === undefined) {
      // A NEW route is a failure, not a pass. Silence on an unbudgeted route is
      // how a budget file quietly stops covering the app.
      failures.push(
        `  ${route}  NEW ROUTE, no budget (${(size / 1024).toFixed(1)} kB) — add it with PERF_BUDGET_WRITE=1`,
      )
      continue
    }
    if (size > allowed + SLACK) {
      failures.push(
        `  ${route}  ${(size / 1024).toFixed(1)} kB > ${(allowed / 1024).toFixed(1)} kB budget +${(SLACK / 1024).toFixed(0)} kB slack  (+${((size - allowed) / 1024).toFixed(1)} kB)`,
      )
    }
  }
  // A route that DISAPPEARS from the build but stays in the budget file is also a
  // drift, and the quiet kind: the file grows a fiction nobody checks.
  for (const route of Object.keys(budget)) {
    if (measured[route] === undefined) {
      failures.push(`  ${route}  in the budget file but not in this build — remove it`)
    }
  }

  if (failures.length > 0) {
    console.error(`\njs-budget FAILED — ${failures.length} route(s):\n${failures.join('\n')}\n`)
    return 1
  }
  console.log(`js-budget ok: ${Object.keys(measured).length} routes within budget`)
  return 0
}

process.exit(main())
