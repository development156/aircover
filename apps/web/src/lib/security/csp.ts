/**
 * Framing policy (doc 13 §5, §16).
 *
 * `/embed/beta` is handed to third-party landing pages as an iframe, so it — and
 * only it — may be framed by anyone. Every other route must refuse, including
 * `/admin`, which is the surface an attacker would most like to clickjack.
 *
 * This is the repo's first Content-Security-Policy header. It deliberately does
 * NOT set X-Frame-Options alongside it: the two headers disagree by design here,
 * and `frame-ancestors` supersedes X-Frame-Options in every browser that supports
 * CSP. Setting both would mean maintaining an exception in two places, and the
 * one that cannot express "allow any origin for this path only" would win.
 *
 * Pure function so the policy is unit-testable without booting middleware.
 */

/** The embeddable surface. A prefix, so `/embed/beta?src=…` and future embeds match. */
const FRAMEABLE_PREFIX = '/embed/'

/**
 * The directives that apply on every path.
 *
 * ── WHY THESE TWO AND NOT A REAL SCRIPT POLICY ──────────────────────────────
 * MEASURED 2026-08-23, on `next start` and on https://app.sahodalabs.com: the
 * whole header was `frame-ancestors` and nothing else, so the CSP was a
 * clickjacking control and not a content policy.
 *
 * `script-src` is the one that would matter most and it is not here: it needs
 * per-request nonces threaded through Next's inline bootstrap, which is a piece
 * of work with a live breakage risk rather than a line in an audit. These two
 * carry real value and cannot break a page that was not already being attacked:
 *
 *   object-src 'none'  — no plugins, no <embed>, no legacy Flash-shaped vector.
 *   base-uri 'self'    — an injected <base href="//evil"> silently repoints
 *                        EVERY relative URL on the page, including form posts
 *                        and script srcs. Nothing legitimate here sets one.
 *
 * `form-action` is deliberately absent: sign-in posts cross-origin to Clerk, and
 * `'self'` would break the login flow in the week nobody was watching.
 */
const BASE_DIRECTIVES = "object-src 'none'; base-uri 'self'"

export function cspFor(pathname: string): string {
  const frame = isFrameable(pathname) ? 'frame-ancestors *' : "frame-ancestors 'none'"
  return `${frame}; ${BASE_DIRECTIVES}`
}

export function isFrameable(pathname: string): boolean {
  return pathname === '/embed' || pathname.startsWith(FRAMEABLE_PREFIX)
}
