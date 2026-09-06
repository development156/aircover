/**
 * The origin the lead-form embed snippet points at.
 *
 * MEASURED 2026-09-06 on the wt-core preview: the snippet on /leads read
 * `https://sahodalabs.vercel.app//embed/lead?site=…` — `NEXT_PUBLIC_APP_URL`
 * is set with a trailing slash there, and the page appended `/embed/lead` to it
 * verbatim. A shop owner pastes that line into their own site; a double slash
 * is the kind of thing that looks broken even when it resolves.
 *
 * Trailing slashes are stripped; an empty or unset value falls back to the
 * production host, which is where a customer's form should land.
 */
export const DEFAULT_APP_ORIGIN = 'https://app.sahodalabs.com'

export function embedOrigin(configured: string | undefined): string {
  const trimmed = (configured ?? '').trim().replace(/\/+$/, '')
  return trimmed === '' ? DEFAULT_APP_ORIGIN : trimmed
}
