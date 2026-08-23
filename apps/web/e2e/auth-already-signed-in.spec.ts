import { expect, test } from './fixtures/seeded-user'

/**
 * A SIGNED-IN VISITOR WHO LANDS ON /sign-in IS SENT ON, AND FAST.
 *
 * ── HOW THIS WAS FOUND, AND THE CLAIM THAT DID NOT SURVIVE ───────────────────
 * `page-rest-frames.spec.ts` asserts that two DIFFERENT routes never photograph
 * identically. On 2026-08-23 it reported /sign-in and /sign-up as byte-equal at
 * all three widths in both themes. Opening the frames showed a branded page with
 * the lockup, one line of product copy, and nothing else — Clerk's <SignIn/>
 * renders nothing for a session that is already authenticated.
 *
 * The first reading of that was "a dead end", and IT WAS WRONG. The first
 * version of this guard was written to prove it and came back GREEN: Clerk
 * redirects to /home from the client, so there is a way out and always was. The
 * capture had simply photographed the transition, having waited 500ms after
 * `load`.
 *
 * What the instrumented probe then MEASURED is real, and smaller:
 *
 *   /sign-in   load 249ms → settled on /home 1581ms
 *   /sign-up   load 245ms → settled on /home 1306ms
 *
 * against `next start` on localhost with no network in the loop. A person who
 * taps a bookmark or presses back after signing in looks at a contentless page
 * for about 1.1-1.3 seconds, and it looks like a page that failed. docs/37 §0
 * puts responsiveness third and spells it "everything answers immediately,
 * including no". The pages now redirect on the SERVER.
 *
 * ── WHAT IT ASSERTS ──────────────────────────────────────────────────────────
 * Two things, and the second is the one that matters. First, the visitor ends up
 * somewhere with a way forward — the property, which a client redirect also
 * satisfied. Second, the page HAS ALREADY LEFT by the time `load` fires, which
 * only a server redirect can do, and which is what makes the difference visible
 * to a person rather than only to a stopwatch.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * 1. A SIGNED-OUT visitor's view. `unauthenticated.spec.ts` owns that, and this
 *    file would pass on a /sign-in that had lost its form entirely.
 * 2. Real latency. Locally the client redirect took 1.3s; this asserts the
 *    server one, which is bounded by one request rather than by a round trip
 *    plus a hydration plus a second navigation. The GAP is what it measures, not
 *    the absolute number.
 * 3. Whether /home is the right destination.
 */

for (const route of ['/sign-in', '/sign-up'] as const) {
  test(`${route} sends a signed-in visitor on before it paints @smoke`, async ({
    page,
    signedIn,
  }) => {
    void signedIn

    await page.goto(route, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load').catch(() => {})

    // NO WAIT HERE, and its absence is the assertion. A client-side redirect
    // needs time to run; a server-side one has already happened. Adding a
    // settle here would make this guard pass on exactly the behaviour it exists
    // to refuse — which is what the first version of it did.
    const landed = new URL(page.url()).pathname
    expect(
      landed,
      `${route}: still here at load. A signed-in visitor is looking at a page with no form and no message while a client-side redirect catches up.`,
    ).not.toMatch(/^\/sign-(in|up)/)

    // And wherever it landed, there is a way forward.
    const controls = await page.locator('a[href], button').count()
    expect(controls, `${landed}: no link and no control`).toBeGreaterThan(0)
  })
}
