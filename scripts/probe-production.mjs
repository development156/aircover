#!/usr/bin/env node
import { DOCUMENT_HEADERS, EXPECTED_ROUTES, judge, summarise } from './lib/probe-routes.mjs'

/**
 * SL-059 Tier 1 — the post-deploy production probe (doc 16 §3 P0 gate).
 *
 *   node scripts/probe-production.mjs [https://host]
 *
 * Exits 0 when every route behaves, non-zero otherwise, so CI can gate on it
 * (SL-033) and a human can run it by hand after a deploy.
 *
 * It follows redirects with a cookie jar of one, because a Clerk DEVELOPMENT
 * instance answers every first hop with a handshake to
 * `…clerk.accounts.dev/v1/client/handshake?…__clerk_hs_reason=dev-browser-missing`
 * before the app is reached at all. Asserting on the first status would
 * therefore be asserting on Clerk's plumbing. A production Clerk instance skips
 * that hop and redirects straight to /sign-in — this probe passes on both,
 * because it only judges where the chain ENDS.
 *
 * KNOWN LIMITATION: some sandboxes block Node's fetch egress while allowing
 * curl. There the runner reports `fetch failed` on every route — that is the
 * PROBE failing, not production, and it is deliberately reported as a failure
 * rather than skipped, because a probe that goes quiet when it cannot measure
 * is the exact failure mode this card exists to remove. The judgement in
 * `lib/probe-routes.mjs` is unit-tested independently and does not need the
 * network.
 */

const HOST = (process.argv[2] ?? process.env.PROBE_HOST ?? 'https://sahodalabs.vercel.app').replace(
  /\/$/,
  '',
)
const TIMEOUT_MS = 45_000

async function probe(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    // `redirect: 'follow'` handles the handshake chain; fetch carries no cookie
    // jar, but Clerk's handshake sets its dev-browser cookie via the redirect
    // URL itself, so the chain still resolves.
    const response = await fetch(`${HOST}${path}`, {
      headers: DOCUMENT_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    })
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      body: await response.text(),
      finalUrl: response.url || `${HOST}${path}`,
    }
  } catch (error) {
    // A network failure is a probe failure, never a silent pass.
    return {
      status: 0,
      contentType: '',
      body: '',
      finalUrl: `${HOST}${path}`,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

const verdicts = []
for (const route of EXPECTED_ROUTES) {
  const result = await probe(route.path)
  const verdict = judge(route, result)
  verdicts.push(verdict)

  const mark = verdict.ok ? 'PASS' : 'FAIL'
  const where = (() => {
    try {
      return new URL(result.finalUrl).pathname
    } catch {
      return result.finalUrl
    }
  })()
  console.log(
    `  ${mark}  ${route.path.padEnd(9)} ${String(result.status).padEnd(4)} → ${where.padEnd(10)} ${
      verdict.ok ? verdict.note : `${verdict.reason}${result.error ? ` (${result.error})` : ''}`
    }`,
  )
}

const summary = summarise(verdicts)
console.log(`\n  ${summary.passed}/${summary.total} routes behave · ${HOST}`)

if (!summary.ok) {
  console.error('\nProduction probe FAILED:')
  for (const f of summary.failed) console.error(`  ${f.path} (${f.kind}) — ${f.reason}`)
  process.exit(1)
}
