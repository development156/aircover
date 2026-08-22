/**
 * MEASUREMENT 2 — is a cheap-check actually cheap, and does it actually work?
 *
 * The whole cost argument for Radar rests on one claim: most days, a competitor's
 * website has not changed, and we can find that out for far less than the price of
 * rendering it. This script tests that claim against real small-business sites
 * instead of assuming it, because three separate things can make it false and each
 * one inverts the economics:
 *
 *   1. THE SERVER MAY NOT SUPPORT CONDITIONAL GET. If it sends no ETag and no
 *      Last-Modified, there is no 304 to be had and we must hash the body.
 *
 *   2. THE HASH MAY NOT HOLD STILL. A raw-HTML hash churns on CSRF tokens, cache
 *      -busting asset query strings, rotating testimonials and build ids. If the
 *      hash moves every day on its own, "only render when the hash moves" means
 *      rendering every day, at full price, forever.
 *
 *   3. THE PAGE MAY NOT BE THE PAGE. A datacenter IP gets bot-challenged by a real
 *      fraction of sites, and a challenge is served with HTTP 200. A challenge page
 *      hashes perfectly stably — so a system that only compares hashes would report
 *      "nothing changed" every single day while never once having seen the site.
 *      That is a silent false negative wearing a perfect hit rate, and it is why
 *      this script classifies the response BEFORE it hashes it.
 *
 * Two passes, minutes apart, with no real change in between. Anything that differs
 * between the passes is the page's own noise, which is exactly what we need to
 * measure.
 *
 *   node scripts/radar/probe-cheap-check.mjs [--gap 180]
 */
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const GAP_SECONDS = Number(process.argv[process.argv.indexOf('--gap') + 1]) || 180

/**
 * Real Indian small-business / D2C sites — the market Radar is for. A synthetic
 * fixture would answer a question nobody asked: static test pages hash stably by
 * construction, which is the result we are trying not to assume.
 */
const SITES = [
  'https://bluetokaicoffee.com/',
  'https://www.thewholetruthfoods.com/',
  'https://sleepyowl.co/',
  'https://bombayshavingcompany.com/',
  'https://mamaearth.in/',
  'https://chaayos.com/',
  'https://paperboatdrinks.com/',
  'https://www.boat-lifestyle.com/',
]

const UA =
  'Mozilla/5.0 (compatible; SahodaRadar/1.0; +https://sahoda.site/radar) AppleWebKit/537.36'

/**
 * Does this 200 look like a bot wall rather than the site? Deliberately
 * conservative: it looks for the interstitials' own markers, not for "the page
 * seems short", so a genuinely small homepage is not misfiled as blocked.
 */
function looksLikeChallenge(html, headers) {
  const h = html.slice(0, 4000).toLowerCase()
  if (headers.get('cf-mitigated') === 'challenge') return 'cf-mitigated header'
  if (h.includes('cf-browser-verification')) return 'cloudflare jschl'
  if (h.includes('/cdn-cgi/challenge-platform')) return 'cloudflare challenge platform'
  if (h.includes('just a moment')) return 'cloudflare interstitial'
  if (h.includes('enable javascript and cookies to continue')) return 'cloudflare interstitial'
  if (h.includes('checking your browser before accessing')) return 'cloudflare interstitial'
  if (h.includes('px-captcha') || h.includes('perimeterx')) return 'perimeterx'
  if (h.includes('incapsula incident id')) return 'imperva'
  if (h.includes('are you a robot') || h.includes('access denied')) return 'generic bot wall'
  return null
}

/**
 * The normaliser the cheap-check hashes over.
 *
 * Scripts, styles, comments and every attribute are removed, leaving the visible
 * words. The attributes are the point: a cache-busting `?v=1755820000` on a
 * stylesheet href changes the raw bytes on every deploy — and often on every
 * request — while the page a customer reads is identical. Hashing the words is
 * what makes "did anything change" mean what a founder thinks it means.
 */
function normalise(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)

async function probe(url, validators) {
  const started = Date.now()
  const headers = { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' }
  // Pass 2 replays the validators pass 1 was given. A 304 here is the cheapest
  // possible answer to "did it change" — no body transferred at all.
  if (validators?.etag) headers['if-none-match'] = validators.etag
  if (validators?.lastModified) headers['if-modified-since'] = validators.lastModified

  let res
  try {
    res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(25_000) })
  } catch (err) {
    return { url, outcome: 'could_not_check', why: `transport: ${err.name}` }
  }

  if (res.status === 304) {
    return { url, outcome: 'unchanged', via: '304', ms: Date.now() - started, bytes: 0 }
  }
  if (!res.ok) {
    return { url, outcome: 'could_not_check', why: `http ${res.status}`, ms: Date.now() - started }
  }

  const html = await res.text()
  const challenge = looksLikeChallenge(html, res.headers)
  if (challenge) {
    // Classified BEFORE hashing, on purpose. See the header comment.
    return { url, outcome: 'could_not_check', why: `challenge: ${challenge}`, bytes: html.length }
  }

  const text = normalise(html)
  return {
    url,
    outcome: 'fetched',
    ms: Date.now() - started,
    bytes: html.length,
    words: text.split(' ').length,
    rawHash: sha(html),
    textHash: sha(text),
    etag: res.headers.get('etag'),
    lastModified: res.headers.get('last-modified'),
  }
}

async function pass(label, priors) {
  console.log(`\n── ${label} ──────────────────────────────────`)
  const out = []
  for (const url of SITES) {
    const prior = priors?.find((p) => p.url === url)
    const r = await probe(
      url,
      prior?.outcome === 'fetched'
        ? { etag: prior.etag, lastModified: prior.lastModified }
        : undefined,
    )
    out.push(r)
    const tag =
      r.outcome === 'fetched'
        ? `raw=${r.rawHash} text=${r.textHash} words=${r.words} etag=${r.etag ? 'yes' : 'no'} lm=${r.lastModified ? 'yes' : 'no'}`
        : r.outcome === 'unchanged'
          ? `304 (free)`
          : r.why
    console.log(`${r.outcome.padEnd(15)} ${url.padEnd(42)} ${tag}`)
  }
  return out
}

const one = await pass('PASS 1', null)

console.log(`\nwaiting ${GAP_SECONDS}s so pass 2 is a genuine second look…`)
await new Promise((r) => setTimeout(r, GAP_SECONDS * 1000))

const two = await pass('PASS 2 (replaying pass 1 validators)', one)

console.log('\n── VERDICT: what a day with no real change costs ─────────────────')
let stableRaw = 0
let stableText = 0
let free304 = 0
let couldNotCheck = 0
let churned = 0

for (const a of one) {
  const b = two.find((x) => x.url === a.url)
  if (b.outcome === 'unchanged') {
    free304 += 1
    stableRaw += 1
    stableText += 1
    console.log(`304-free        ${a.url}`)
    continue
  }
  if (a.outcome !== 'fetched' || b.outcome !== 'fetched') {
    couldNotCheck += 1
    console.log(`could-not-check ${a.url}  (${a.why ?? b.why})`)
    continue
  }
  const rawSame = a.rawHash === b.rawHash
  const textSame = a.textHash === b.textHash
  if (rawSame) stableRaw += 1
  if (textSame) stableText += 1
  if (!textSame) churned += 1
  console.log(
    `raw=${rawSame ? 'stable' : 'CHURN '} text=${textSame ? 'stable' : 'CHURN '}  ${a.url}`,
  )
}

const n = SITES.length
console.log(`\nsites               ${n}`)
console.log(`free 304s           ${free304}`)
console.log(`could-not-check     ${couldNotCheck}   <- these are GAPS, never "unchanged"`)
console.log(`raw-HTML  stable    ${stableRaw}/${n}`)
console.log(`normalised stable   ${stableText}/${n}`)
console.log(`normalised churned  ${churned}`)

writeFileSync(
  new URL('./cheap-check-measurement.json', import.meta.url),
  JSON.stringify({ gapSeconds: GAP_SECONDS, one, two }, null, 2),
)
console.log('\nwrote scripts/radar/cheap-check-measurement.json')
