import type { SupabaseClient } from '@supabase/supabase-js'

import { measureAccentSpend } from './helpers/accent-spend'
import { bootstrapWorkspace } from './fixtures/compose'
import { adminClient, expect, test } from './fixtures/seeded-user'
import { parkPointer } from './helpers/ux-shot'

/**
 * DOCS/37 §16, MADE ENFORCEABLE.
 *
 * §16 already writes the assertions — "exactly one solid-brand-fill element per
 * view · exactly one `type-h1` per view · at most one `type-hero-num` · a page
 * that says the same thing in more than one place says it once". Nothing checked
 * any of them, and every one was being broken on the two screens people judge
 * this product on.
 *
 * ── WHY THIS IS A DOM GUARD AND NOT A PIXEL ONE ──────────────────────────────
 * `helpers/accent-spend.ts` measures how MUCH orange a frame carries and it is
 * the weaker check, because a fraction cannot see where the orange is: 0.3% in
 * one primary button and 0.3% smeared over nine links score identically, and
 * §2.3 is entirely about that difference. This counts ELEMENTS, which is the
 * unit the rule is written in. The two are complements — see the foot of this
 * file for what each cannot see.
 *
 * ── §16 COUNTS ACTIONS, AND THAT READING IS FORCED BY §9 ─────────────────────
 * "Exactly one solid-brand-fill element per view" taken literally contradicts the
 * Certainty System in the same document: §9 gives `.is-real` a SOLID BRAND fill,
 * so a list of three published posts would break §16 by design. This guard found
 * that on its first green run — /home populated at 1024 reported two fills,
 * `Create post 125x38` and an `In review` badge at `79x20`.
 *
 * The badge is a `<span>`. §2.3 states the rule in the words that resolve it:
 * "One primary action per view … Everything else is a secondary or a link", and
 * separately permits the accent for "primary actions, current selection, and
 * state indicators". A certainty mark is a state indicator on a different axis
 * from urgency and from action, and `badge.tsx` says so itself.
 *
 * So this counts elements that are ACTIONS — `<a>`, `<button>`, `role=button`,
 * `role=link`. A decorative solid-orange `<div>` would pass here and is caught
 * instead by the pixel budget below, which does not care what an element is.
 *
 * ── THE STATE IT RUNS IN ─────────────────────────────────────────────────────
 * A bootstrapped workspace with nothing in it. That is not a corner: it is where
 * every account spends its first hour, it is the state both audits found the
 * most in, and it is the state in which /home stated one absence SEVEN times.
 * One Clerk user for the whole file — this suite has minted 12,196 against
 * production and the house pattern of one per (width, theme) is how.
 */

/** `--p` #ff6600. `bg-primary` resolves to exactly this on both themes. */
const BRAND_FILL = 'rgb(255, 102, 0)'

/**
 * Below this a "fill" is a dot, a caret or an antialiasing artefact.
 *
 * 400px² is a 20x20 square. The smallest thing this rule means is a button
 * (~125x38 = 4750) or the FAB (50x50 = 2500).
 */
const FILL_FLOOR = 400

/**
 * Every element painting the solid brand, with its box.
 *
 * `getComputedStyle().backgroundColor` is an element's OWN background, so a
 * label inside an orange button reports `rgba(0, 0, 0, 0)` and is not
 * double-counted. Washes and tints are `--t50`/`--t100`, which are rgba and
 * never match this string — the rule is about SOLID fills and this reads only
 * those.
 */
const SOLID_FILLS = `(() => {
  const out = []
  // Scoped to #main -- see the note above this constant.
  const isAction = (el) =>
    el.tagName === 'A' || el.tagName === 'BUTTON' ||
    el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link'
  const main = document.querySelector('#main') ?? document.body
  for (const el of main.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if (cs.backgroundColor !== '${BRAND_FILL}') continue
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue
    if (!isAction(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width * r.height < ${FILL_FLOOR}) continue
    out.push({
      tag: el.tagName,
      name: (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
      w: Math.round(r.width),
      h: Math.round(r.height),
    })
  }
  return out
})()`

/** The same read, everything OUTSIDE `#main`. See the scoping note above. */
const SHELL_FILLS = `(() => {
  const out = []
  const isAction = (el) =>
    el.tagName === 'A' || el.tagName === 'BUTTON' ||
    el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link'
  const main = document.querySelector('#main')
  for (const el of document.querySelectorAll('body *')) {
    if (main && main.contains(el)) continue
    const cs = getComputedStyle(el)
    if (cs.backgroundColor !== '${BRAND_FILL}') continue
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue
    if (!isAction(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width * r.height < ${FILL_FLOOR}) continue
    out.push({ name: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) })
  }
  return out
})()`

/**
 * How many separate elements announce an absence.
 *
 * This is the founder's own metric — "five cards explaining an absence the page
 * could state once" — counted rather than eyeballed. It matches the ways this
 * product says nothing, taken from the copy that actually shipped, and it counts
 * ELEMENTS with their own text so one sentence is not reported by every ancestor
 * up to <body>.
 */
const ABSENCE_STATEMENTS = `((scope) => {
  const RE = /\\bnothing\\b|\\bno .{0,24}\\byet\\b|\\bnot connected\\b|hasn['\\u2019]t\\b|does ?n['\\u2019]?o?t know|\\bnone of\\b|there is no\\b|\\bno history\\b/i
  const main = document.querySelector('#main')
  const inMain = (el) => Boolean(main && main.contains(el))
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    if (scope === 'page' && !inMain(el)) continue
    if (scope === 'shell' && inMain(el)) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') continue
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(' ')
      .replace(/\\s+/g, ' ')
      .trim()
    if (!own || !RE.test(own)) continue
    out.push(own.slice(0, 90))
  }
  return out
})`

/**
 * The ceiling, per route.
 *
 * /home is 1 because a setup screen has exactly one thing to say. /analytics is
 * 2: the readiness line, plus `performance-over-time`'s "Sahoda has started
 * keeping a history", which is a statement about the PRODUCT's state rather than
 * about this workspace's absence and is the sentence `analytics-history.spec.ts`
 * depends on. Both were measured at 7 and 6 respectively on 2026-08-23.
 */
const ABSENCE_CEILING: Record<string, number> = { '/home': 1, '/analytics': 2 }

/**
 * Brand-hue saturated pixels as a percentage of a fixed viewport, LIGHT, on a
 * bootstrapped-but-empty workspace. Measured on this branch; ~20% headroom.
 * See the test below for why these are constants and not a regenerable file.
 */
const ACCENT_CEILING: Record<string, number> = {
  '/home@390': 3.51, // measured 3.190% — 2625px in 5 regions
  '/home@1024': 1.05, // measured 0.950% — 1867px in 5 regions
  '/home@1440': 0.67, // measured 0.606% — 1962px in 6 regions
  '/analytics@390': 2.83, // measured 2.571% — 2116px in 4 regions
  '/analytics@1024': 0.81, // measured 0.734% — 1443px in 5 regions
  '/analytics@1440': 0.54, // measured 0.485% — 1571px in 7 regions
}

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const

test.describe('hierarchy on the two screens people judge this product on @smoke', () => {
  test.slow()

  /**
   * ── ONE WALK, NOT THREE ──────────────────────────────────────────────────
   * The fill count, the h1 count, the hero-number count, the absence count, the
   * accent ceiling and the doubled-prefix check all describe the SAME rendered
   * page in the SAME state. Split across three `test()` blocks they cost three
   * Clerk users and three bootstraps per gate run, against production, forever.
   * They are one walk. The assertions stay independent — each names its route
   * and width — so a failure still says which check and where.
   */
  test('one fill leads, one h1 titles, one sentence states it, and the accent stays inside its ceiling', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    await bootstrapWorkspace(page)

    for (const route of ['/home', '/analytics'] as const) {
      for (const { width, height } of WIDTHS) {
        await page.setViewportSize({ width, height })
        await page.goto(route)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })
        // The harness parks Playwright's pointer at (836,406) otherwise, and
        // `hover:bg-ink` turns the primary BLACK — which is how three separate
        // captures photographed this product's primary action as a black button.
        // A hover state would take it out of the fill count entirely.
        await parkPointer(page)

        const where = `${route} @ ${width}`

        // ── ONE SOLID BRAND FILL, COUNTING ACTIONS ─────────────────────────
        const fills = (await page.evaluate(SOLID_FILLS)) as { name: string; w: number; h: number }[]
        expect(
          fills.length,
          `${where}: docs/37 §2.3 allows ONE primary action carrying the solid brand fill; found ${fills.length} — ${fills
            .map((f) => `${f.name || '(unnamed)'} ${f.w}x${f.h}`)
            .join(' · ')}`,
        ).toBeLessThanOrEqual(1)

        // ── AND THE SHELL ADDS AT MOST ONE, WHICH IS THE FAB ───────────────
        // The #main scoping is only honest if what it excludes is bounded.
        const shellFills = (await page.evaluate(SHELL_FILLS)) as { name: string }[]
        expect(
          shellFills.length,
          `${where}: the shell may paint the FAB and nothing else — found ${shellFills
            .map((f) => f.name || '(unnamed)')
            .join(' · ')}`,
        ).toBeLessThanOrEqual(width < 700 ? 1 : 0)

        // ── ONE h1 ─────────────────────────────────────────────────────────
        expect(
          await page.getByRole('heading', { level: 1 }).count(),
          `${where}: exactly one h1 per view`,
        ).toBe(1)

        // ── AT MOST ONE HERO NUMBER ────────────────────────────────────────
        expect(
          await page.locator('.type-hero-num').count(),
          `${where}: at most one type-hero-num per view`,
        ).toBeLessThanOrEqual(1)

        // ── ONE ABSENCE, ONE STATEMENT ─────────────────────────────────────
        const said = (await page.evaluate(`${ABSENCE_STATEMENTS}('page')`)) as string[]
        expect(
          said.length,
          `${where}: ${said.length} separate statements of absence — ${said.join(' | ')}`,
        ).toBeLessThanOrEqual(ABSENCE_CEILING[route] as number)

        // THIS GUARD FOUND ONE ON ITS FIRST RUN: at 1024 and 1440 the topbar's
        // ring reads "No brain yet", which on an empty /home is a second
        // statement of the fact the page has just made — the founder's "says the
        // same thing in more than one place", spanning shell and page rather than
        // living inside either. It is the shell's chip, this lane does not own
        // it, so it is bounded at ONE and logged in docs/40 §6.
        const shellSaid = (await page.evaluate(`${ABSENCE_STATEMENTS}('shell')`)) as string[]
        expect(
          shellSaid.length,
          `${where}: the shell states ${shellSaid.length} absences — ${shellSaid.join(' | ')}`,
        ).toBeLessThanOrEqual(1)

        // ── AND SAHODA NEVER INTRODUCES ITSELF TWICE ───────────────────────
        // `EmptyState` prefixes its tip with "Sahoda: " and /analytics passed one
        // that already carried the prefix, so it shipped doubled on every empty
        // analytics frame at every width in both themes. A grep for `tip="Sahoda`
        // would catch that instance and miss one assembled from a variable; this
        // reads what a person actually sees.
        expect((await page.locator('body').innerText()).replace(/\s+/g, ' '), where).not.toMatch(
          /Sahoda:\s*Sahoda:/i,
        )

        // ── THE PIXEL CEILING ──────────────────────────────────────────────
        // The fill count is about ACTIONS and cannot see a decorative orange
        // div, an accent link that became a bar, or a tint that got heavier.
        // This does not care what an element is.
        const spend = measureAccentSpend(
          await page.screenshot({ clip: { x: 0, y: 0, width, height } }),
        )
        const ceiling = ACCENT_CEILING[`${route}@${width}`]
        expect(ceiling, `no ceiling declared for ${route}@${width}`).toBeDefined()
        expect(
          Number(spend.brandFraction.toFixed(3)),
          `${where}: ${spend.brandFraction.toFixed(3)}% brand-hue (${spend.brandPixels}px in ${spend.regions} regions) against a ceiling of ${ceiling}%. Biggest: ${spend.top
            .slice(0, 3)
            .map((t) => `${t.share}% at (${t.x},${t.y}) ${t.w}x${t.h}`)
            .join(' · ')}`,
        ).toBeLessThanOrEqual(ceiling as number)
      }
    }
  })

  /**
   * AND THE SAME RULE ON A WORKSPACE THAT HAS SOMETHING IN IT.
   *
   * ── THE HOLE THIS CLOSES, FOUND BY A MUTANT THAT SURVIVED ────────────────
   * The walk above runs on an empty workspace, where /home renders `GetStarted`
   * — so `GreetingBanner` never appears in it. A mutation restoring the banner's
   * duplicate `Create post` at 390 therefore SURVIVED: not because the fill
   * guard is weak, but because the mutation landed on a component the guard's
   * only data state does not render. A guard whose state never reaches the code
   * it is aimed at is the "nothing broke / nothing ran" failure with extra steps.
   *
   * One post is the cheapest thing that crosses `workspaceHasStarted`, and it is
   * enough: the banner, the queue and the week strip all render from it. Seeded
   * through `adminClient()` under the workspace the app itself bootstrapped, so
   * the fixture's cleanup removes it.
   *
   * The ABSENCE ceiling is deliberately not asserted here. A populated page has
   * legitimately more to say about what it does not yet have, that number was
   * never measured, and a ceiling picked to make a run pass is not a measurement.
   */
  test('and one post later, the page still leads with one thing', async ({ page, signedIn }) => {
    const admin = adminClient()
    test.skip(admin === null, 'no service key in this environment')
    await bootstrapWorkspace(page)

    const { data } = await (admin as SupabaseClient)
      .from('workspaces')
      .select('id')
      .eq('created_by', signedIn.clerkUserId)
      .limit(1)
    const workspaceId = data?.[0]?.id as string | undefined
    expect(workspaceId, 'the app did not bootstrap a workspace').toBeTruthy()

    await (admin as SupabaseClient).from('posts').insert({
      workspace_id: workspaceId,
      title: 'Tuesday roast is on the shelf',
      body: 'Ethiopian Guji, roasted 48 hours ago.',
      status: 'review',
      channels: ['instagram'],
      created_by: signedIn.clerkUserId,
    })

    for (const { width, height } of WIDTHS) {
      await page.setViewportSize({ width, height })
      await page.goto('/home')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })
      await parkPointer(page)

      const fills = (await page.evaluate(SOLID_FILLS)) as { name: string; w: number; h: number }[]
      expect(
        fills.length,
        `/home populated @ ${width}: docs/37 §16 allows ONE solid brand fill per view; found ${fills.length} — ${fills
          .map((f) => `${f.name || '(unnamed)'} ${f.w}x${f.h}`)
          .join(' · ')}`,
      ).toBeLessThanOrEqual(1)

      expect(
        await page.getByRole('heading', { level: 1 }).count(),
        `/home populated @ ${width}: exactly one h1 per view`,
      ).toBe(1)
    }
  })
})

/**
 * ── WHAT THIS GUARD CANNOT SEE ───────────────────────────────────────────────
 *
 * 1. A SOLID BRAND FILL THAT IS NOT AN ACTION. A decorative orange `<div>`, or a
 *    certainty mark that grew to the size of a button, both pass. That is the
 *    price of the §9 reconciliation above, and the pixel budget is what covers it.
 * 2. A SECOND fill that is not `--p`. It matches one colour string, so a button
 *    painted `--acc` (#bd4b00 light) or a customer theme's own brand is invisible
 *    to it. Brand Skin is cut, so no such theme exists today; if one ships, this
 *    reads the wrong colour and passes.
 * 3. ANYTHING BELOW 400px². The count badge (18x18) and a caret are deliberately
 *    exempt, and so is a 19x19 fill that should not be there.
 * 4. THE SHELL, except for its count. Anything `#main` does not contain is
 *    checked only for HOW MANY fills it has, never for which — a rail item that
 *    turned solid orange would be caught, a rail item that turned solid ink
 *    would not, and neither is this lane's to fix.
 * 5. A fill BELOW THE FOLD. `getBoundingClientRect` is document-relative here and
 *    `querySelectorAll` walks the whole DOM, so this DOES count off-screen fills
 *    — which is right for a budget and means a page can fail on something the
 *    reader never reaches.
 * 6. WHETHER THE ONE FILL IS THE RIGHT ONE. It counts to one; it cannot say the
 *    survivor is the action the screen exists for. That judgement is docs/40's
 *    and no test replaces it.
 * 7. AN ABSENCE PHRASED AROUND THE PATTERNS. "Your week is clear" states an
 *    absence and matches nothing in the regex. The count is a floor on repetition,
 *    not a proof of singularity — it catches the failure that actually shipped
 *    (seven near-identical "nothing yet" sentences) and would miss seven
 *    creatively-worded ones.
 * 8. WHETHER THE SHELL'S ONE STATEMENT DUPLICATES THE PAGE'S. It bounds the
 *    count at one on each side of `#main` and cannot see that "No brain yet" and
 *    "Nothing has happened in this workspace yet" are the same fact.
 * 9. ONE DATA STATE. It runs on an empty workspace only. A populated page can
 *    still repeat itself and this will not notice; `page-dash-frames.spec.ts`
 *    photographs that state and a person reads it.
 */
