/**
 * The status page's content, as a pure function of what the probes measured.
 *
 * ── WHY IT IS NOT AN APP ROUTE ───────────────────────────────────────────────
 * A status page served by the thing it reports on answers "is it up?" with "I
 * cannot reach the page", which is the one moment it exists for. So this is a
 * static file, built and published by GitHub Actions and served by GitHub Pages:
 * a different company, a different network, a different failure domain from
 * Vercel, Supabase and Upstash.
 *
 * ── AND WHAT IT STILL CANNOT SEE ─────────────────────────────────────────────
 * GitHub Actions is not a monitoring service. A run is best-effort and is
 * regularly 10-30 minutes late under load; if GitHub itself is down, the page
 * simply stops updating. That is why every page states the time it was BUILT and
 * how stale it is, rather than showing a green tick with no date — a status page
 * frozen on "all systems operational" is worse than none, because it is
 * confidently wrong at exactly the wrong time.
 *
 * It also proves nothing about signed-in behaviour: the probes are unauthenticated.
 * "The routes answer correctly to a signed-out visitor and the crons are
 * reachable" is the whole claim.
 */

/** `checks` = [{ name, ok, detail }]. `builtAt` is an ISO string, passed in. */
export function renderStatusPage({ builtAt, checks, host }) {
  // `c.ok === false`, NOT `!c.ok`. `null` is falsy, so the loose form counted an
  // UNMEASURED check as a failure — the exact conflation this page exists to
  // avoid, reproduced in the renderer that reports it. Caught by its own test.
  const failing = checks.filter((c) => c.ok === false)
  const unmeasured = checks.filter((c) => c.ok === null)
  const headline =
    failing.length > 0
      ? `${failing.length} of ${checks.length} checks failing`
      : unmeasured.length > 0
        ? `${unmeasured.length} of ${checks.length} checks could not be measured`
        : `all ${checks.length} checks passing`

  const rows = checks
    .map((c) => {
      const mark = c.ok === null ? '—' : c.ok ? 'ok' : 'FAIL'
      const cls = c.ok === null ? 'unknown' : c.ok ? 'ok' : 'fail'
      return `      <tr class="${cls}"><td>${mark}</td><td>${esc(c.name)}</td><td>${esc(c.detail)}</td></tr>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sahoda status</title>
<style>
  :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
  body { margin: 0 auto; max-width: 46rem; padding: 2rem 1rem; line-height: 1.5; }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
  .when { color: #666; font-size: .875rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; font-size: .875rem; }
  td, th { text-align: left; padding: .5rem .75rem; border-top: 1px solid #8883; vertical-align: top; }
  tr.fail td:first-child { color: #b00020; font-weight: 700; }
  tr.ok td:first-child { color: #0a7; }
  tr.unknown td:first-child { color: #888; }
  td:first-child { width: 4rem; }
  footer { margin-top: 2rem; color: #666; font-size: .8125rem; }
</style></head>
<body>
  <h1>Sahoda status — ${esc(headline)}</h1>
  <p class="when">Built <time datetime="${esc(builtAt)}">${esc(builtAt)}</time>. Target ${esc(host)}.</p>
  <table>
    <thead><tr><th></th><th>Check</th><th>What was measured</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <footer>
    <p>Built by GitHub Actions and served by GitHub Pages, deliberately: a status
    page hosted on the infrastructure it reports on cannot answer during the one
    event it exists for.</p>
    <p>If the build time above is old, this page is stale rather than green — no
    check here refreshes on its own, and a scheduled run is best-effort. These
    probes are unauthenticated: they say the public routes behave and the crons
    are reachable, and nothing about signed-in behaviour, publishing or billing.</p>
  </footer>
</body></html>
`
}

function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  )
}

/**
 * How stale is stale. Exported so the workflow and the page agree on one number
 * rather than each having an opinion.
 */
export const STALE_AFTER_MINUTES = 60

export function stalenessNote(builtAtMs, nowMs) {
  const minutes = Math.floor((nowMs - builtAtMs) / 60_000)
  if (!Number.isFinite(minutes) || minutes < 0) return 'the build time cannot be read'
  return minutes > STALE_AFTER_MINUTES
    ? `last built ${minutes} minutes ago — STALE, treat every row as unknown`
    : `last built ${minutes} minutes ago`
}
