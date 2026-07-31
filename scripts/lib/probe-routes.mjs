/**
 * SL-059 Tier 1 — what a production route is supposed to do (doc 16 §3 P0).
 *
 * Pure. No fetch, no network. `probe-production.mjs` does the I/O and hands the
 * results here, so the judgement is testable without a deployment.
 *
 * WHY THIS EXISTS, in one paragraph, because the next person will be tempted to
 * simplify it: on 31 July production was declared DOWN twice, for 17 users, on
 * the strength of six GETs that returned 404. The site was working. The probes
 * sent `Accept: * /*`, and Clerk's `auth.protect()` redirects DOCUMENT requests
 * and answers 404 for everything else — so the measurement, not the site, was
 * broken. Every request this file describes therefore carries real navigation
 * headers, and every assertion is about where the redirect CHAIN ends rather
 * than what the first hop returned.
 */

/** Headers a browser actually sends when you type a URL and press enter. */
export const DOCUMENT_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
}

/**
 * `public`    — renders itself, signed out.
 * `protected` — sends a signed-out visitor to /sign-in, keeping their destination.
 * `gated`     — answers an empty 404 and NEVER a login upsell (doc 13 §2), so an
 *               anonymous scanner cannot learn the route exists.
 */
export const EXPECTED_ROUTES = [
  { path: '/', kind: 'protected' },
  { path: '/sign-in', kind: 'public' },
  { path: '/home', kind: 'protected' },
  { path: '/wallet', kind: 'protected' },
  { path: '/posts', kind: 'protected' },
  { path: '/admin', kind: 'gated' },
]

const SIGN_IN = '/sign-in'

/**
 * Judge one probed route.
 *
 * `result` is what the runner observed after following redirects:
 *   { status, contentType, body, finalUrl, redirected }
 */
export function judge(route, result) {
  const fail = (reason) => ({ ok: false, path: route.path, kind: route.kind, reason })
  const pass = (note) => ({ ok: true, path: route.path, kind: route.kind, note })

  const path = (() => {
    try {
      return new URL(result.finalUrl).pathname
    } catch {
      return result.finalUrl
    }
  })()

  if (route.kind === 'gated') {
    // The one route that must NOT render. Checked BEFORE the status, because a
    // redirect to sign-in arrives as a 200 and the useful thing to say about it
    // is "this leaks that /admin exists", not "expected 404, got 200".
    if (path === SIGN_IN) return fail('redirected to sign-in — doc 13 §2 forbids a login upsell')
    if (result.status !== 404) return fail(`expected 404, got ${result.status}`)
    if ((result.body ?? '').trim() !== '') return fail('expected an empty body, got markup')
    return pass('empty 404, no upsell')
  }

  if (result.status !== 200) return fail(`expected 200 after redirects, got ${result.status}`)
  if (!/text\/html/i.test(result.contentType ?? '')) {
    return fail(`expected text/html, got ${result.contentType || 'no content-type'}`)
  }
  if (!/<html/i.test(result.body ?? '')) return fail('no rendered markup')
  if (/DEPLOYMENT_NOT_FOUND/.test(result.body ?? '')) return fail('Vercel error page, not the app')

  if (route.kind === 'public') {
    if (path !== route.path) return fail(`expected to stay on ${route.path}, landed on ${path}`)
    return pass('renders signed out')
  }

  // protected
  if (path !== SIGN_IN) {
    // The exact regression this probe exists for: a 404 that never reaches
    // sign-in, which for months no test could see.
    return fail(`expected to land on ${SIGN_IN}, landed on ${path}`)
  }
  // The destination has to survive the round trip, or a signed-in user is
  // dumped on the dashboard having lost where they were going.
  const target = new URL(result.finalUrl).searchParams.get('redirect_url')
  if (route.path !== '/' && !(target ?? '').endsWith(route.path)) {
    return fail(`sign-in did not keep the destination (redirect_url=${target ?? 'absent'})`)
  }
  return pass('redirected to sign-in, destination kept')
}

export function summarise(verdicts) {
  const failed = verdicts.filter((v) => !v.ok)
  return { ok: failed.length === 0, passed: verdicts.length - failed.length, total: verdicts.length, failed }
}
