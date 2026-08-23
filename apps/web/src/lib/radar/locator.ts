import { ipLiteral, isPrivateAddress } from '@sahoda/research'

/**
 * THE WATCH-LIST DOOR'S OWN CHECK — and it is FEEDBACK, not the control.
 *
 * It lives in its own file rather than inside the `'use server'` action for a
 * blunt reason: a server-action module may only export async functions, so a
 * pure helper defined there can never be reached by a test. A guard that cannot
 * be executed by a test is a guard nobody can mutate, and this codebase has
 * already shipped one of those.
 *
 * ── WHAT IT DOES AND DOES NOT PROMISE ────────────────────────────────────────
 * Refusing `http://169.254.169.254/` while somebody is typing is worth doing:
 * they get a sentence instead of a source that silently records a gap every
 * night forever. It is NOT what stops the fetch. A Radar source is stored once
 * and read for months, and the DNS record behind `their-site.example` is free to
 * answer 169.254.169.254 tomorrow without this row changing a character. The
 * control is `guardedFetch`, which decides at the socket, on the night, at every
 * redirect hop — see `RadarPassOptions.fetchPage`.
 *
 * `new URL` is what makes one literal check cover the encodings: it normalises
 * `http://2852039166/`, `http://0xA9FEA9FE/` and `http://0251.0376.0251.0376/`
 * all to `169.254.169.254` before this sees them, and an IPv6 literal to its
 * bracketed hextet form, which `ipLiteral` unwraps.
 */
export function normalizeUrl(raw: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return null
  }
  // A `javascript:` or `data:` value entered here would be stored and later
  // rendered as a link, and the collector would be handed a scheme it has no
  // business fetching.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  // Credentials in a URL are never how a customer writes their own site, and
  // they are how a request gets aimed at something that trusts them.
  if (parsed.username || parsed.password) return null
  const literal = ipLiteral(parsed.hostname)
  if (literal && isPrivateAddress(literal.address, literal.family)) return null
  return parsed.toString()
}
