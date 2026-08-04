import 'server-only'

/**
 * Run one site's render and convert a throw into `null`.
 *
 * `lib/sites/read.ts` states the rule for this screen: "Every read degrades to
 * null/empty rather than throwing; rows parse per-row so one malformed row
 * cannot take down the screen." The render half never honoured it —
 * `renderBundle` throws by design on an unsafe stylesheet, and
 * `sharedTokensCss` reads from disk — so a single unrenderable site returned
 * HTTP 500 for the entire page.
 *
 * That is the worst possible failure here: the site was PAID FOR (100 credits)
 * and the founder is left with a dead screen, unable to see the draft, retry,
 * or even reach the rest of the app section. A missing preview with honest
 * copy is strictly better.
 *
 * The cause is logged (never surfaced to the user, and never a raw stack) so a
 * render regression stays diagnosable in the function logs.
 */
export function renderPreviewSafely<T>(siteId: string, render: () => T): T | null {
  try {
    return render()
  } catch (error) {
    try {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[sites] preview render failed for site ${siteId}: ${message}`)
    } catch {
      // A logging failure must not change the outcome.
    }
    return null
  }
}
