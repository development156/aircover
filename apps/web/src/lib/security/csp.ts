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

export function cspFor(pathname: string): string {
  return isFrameable(pathname) ? 'frame-ancestors *' : "frame-ancestors 'none'"
}

export function isFrameable(pathname: string): boolean {
  return pathname === '/embed' || pathname.startsWith(FRAMEABLE_PREFIX)
}
