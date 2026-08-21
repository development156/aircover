import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from './fixtures/seeded-user'

/**
 * THE SIX ROADMAP SECTIONS SHOW NO FIGURE ABOUT THE READER'S BUSINESS.
 *
 * ── /loop AND /report LEFT THIS LIST ON 2026-08-20, BECAUSE THEY WERE BUILT ──
 * (And `/brain/audience` left later for the same reason — see its note below.
 * The heading said SEVEN until 2026-08-22 while the list held six; the count is
 * now derived by reading it, which is the only way it stays true.)
 * They are not exceptions to the property below; they are no longer roadmap
 * sections. The Loop runs — it opens a cycle, prices a plan, charges credits and
 * writes drafts — so it shows a week number, a credit total and a count of
 * posts, every one of them out of a query. The first assertion in the loop below
 * is what caught it: `/loop` no longer says "coming soon", because that sentence
 * became false.
 *
 * WIDENING `ALLOWED` FOR THEM WOULD HAVE BEEN THE WRONG REPAIR, and the more
 * tempting one. It is the same move this repo already recorded as a mistake in
 * LEARNINGS (2026-08-13, `ALPHA_GATE.failingCodes`): editing the expected number
 * until the check passes, rather than recording what actually changed. Every
 * screen still on this list is still a drawing, and the property is exactly as
 * strict for them as it was.
 *
 * WHERE THE PROPERTY LIVES FOR THEM NOW. `/loop`'s cost preview has its own
 * digit scan — `components/loop/cost-preview.test.tsx` asserts every number it
 * renders is a credit price from pricing.config.json, a sum of them, or a count
 * of rows, and it is verified by injecting a fabricated reach figure. `/report`
 * has NO equivalent automated guard yet; its figures come from
 * `lib/loop/report.ts`, which returns null rather than zero when it has nothing,
 * and it withholds a ranking below two measured posts. That gap is stated here
 * rather than left for someone to discover.
 *
 * ── WHY A BLANKET "NO DIGITS" CHECK WOULD BE THE WRONG TEST ──────────────────
 * `/ads` can be tested that way and is (`campaigns.spec.ts`): it has no price to
 * quote and no sequence to number, so every digit on it would be a lie. The
 * six below are not like that. They legitimately carry two kinds of number:
 *
 *   · A CREDIT PRICE, read from `pricing.config.json` through `creditCost()`.
 *     A price is a published, checkable fact ABOUT SAHODA — the same class of
 *     thing as a channel name — not a claim about the reader.
 *   · AN ORDINAL: the Loop's seven stages. Those number a sequence, which is a
 *     fact about the product. (Radar's five competitor slots used to be the
 *     other example. They were a cap nothing defined — see its entry below.)
 *
 * Banning all digits would have forced those out and made the screens vaguer
 * without making them more honest. So the property is stronger and narrower:
 * **the set of numbers on each screen is exactly the set written down here**,
 * and any number that appears for any other reason fails.
 *
 * ── THE EXPECTATION IS HAND-WRITTEN, WHICH IS THE POINT ──────────────────────
 * It would be shorter to build the allow-list by scraping the same
 * `creditCost()` calls the pages make. That test would pass whatever those calls
 * return, including a number invented somewhere else and routed through one —
 * self-consistent under any mutation, which is the defect the assets lane
 * measured on `LOCKING_POST_STATUSES` (LEARNINGS, 2026-08-20). Written out, a
 * reach figure, a lead count, a predicted score or a competitor total appears
 * here as an unexpected number and fails by name.
 *
 * The prices themselves are READ FROM `pricing.config.json` rather than written
 * as literals, for the opposite reason: the price list is allowed to change, and
 * pinning a literal would make this file the second place a price lives.
 *
 * Read with `fs` rather than through `creditCost()` from `@sahoda/shared`, which
 * is where the app gets it. Importing the package into a spec fails —
 * `pricing.config.json needs an import attribute of "type: json"` under
 * Playwright's loader — so the file is read directly and by the same path. It is
 * still one source; only the reader differs.
 */

const PRICES: Record<string, number> = JSON.parse(
  readFileSync(
    join(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), 'pricing.config.json'),
    'utf8',
  ),
).actions

/** Named so a missing key fails loudly here rather than silently allowing NaN. */
function price(action: string): number {
  const value = PRICES[action]
  if (typeof value !== 'number') throw new Error(`no price for "${action}" in pricing.config.json`)
  return value
}

/**
 * route → every number that may legitimately appear in `#main`.
 *
 * Ordinals are listed explicitly rather than as a range, so adding an eighth
 * Loop stage is a decision someone takes here too.
 */
const ALLOWED: ReadonlyArray<readonly [string, readonly number[]]> = [
  ['/playbooks', [price('playbook_run')]],
  // `/radar` IS STILL HERE, AND ITS ALLOWANCE JUST GOT NARROWER, NOT WIDER.
  //
  // The screen was built (wt-radar-ui): it has a watch list, a day-grouped
  // change feed, a competitor detail view and a path from an observation to a
  // draft. What was NOT built in that lane is the weekly scan that fills it —
  // that is wt-radar's — so with the `competitors` table absent, which is the
  // state every environment this suite runs in is in, `/radar` renders one
  // honest panel saying the scan is not built yet. It still says so, so it stays
  // on this list and this property still holds it.
  //
  // The five numbered slots are GONE, and with them the 1–5 allowance. They drew
  // a cap that the entitlement surface does not define: `PlanLimits` in
  // packages/shared has channels, sites, seats, loopLevel and twinSize, and no
  // competitor dimension at all. The two docs that mention one disagree — PRD
  // §7.1 says "Growth: Radar (3 comps)", PRD/FSD M9 both say "1–5" — so drawing
  // either was picking an entitlement rather than reading one. An owner ruling
  // is owed; until it lands the watch list is uncapped and states the per-scan
  // price instead, which is a fact about Sahoda rather than a claim about anyone.
  //
  // What remains is the price, which is what the panel quotes.
  ['/radar', [price('radar_scan')]],
  ['/leads', []],
  ['/studio', [price('carousel')]],
  ['/remix', [price('remix_pack')]],
  // `/brain/audience` IS NOT IN THIS LIST ANY MORE, and the removal is the point
  // rather than a loosening. This guard exists to stop screens that are DRAWINGS
  // from inventing figures. That tab is no longer a drawing: it reads
  // `audience_snapshots` and Instagram, and every number on it — a follower count,
  // Meta's 100-follower floor, a collection date — came from a platform or from a
  // published rule. Widening its allowance to admit them would have turned a guard
  // about roadmap screens into a guard about nothing.
  //
  // What replaces it is narrower and stronger, because it can assert PROVENANCE
  // rather than a permitted set of digits: `page.test.tsx` holds the screen to a
  // figure per state, `audience-layers.spec.ts` measures the measured/inferred
  // split, and the collector refuses to store a number no platform reported.
  // `twin_preflight` stays in pricing.config.json — the price is still real, the
  // screen that quoted it is not.
  ['/brain/knowledge', []],
]

/** A standalone run of digits. Excludes ones welded into a word or a dash-run. */
const FIGURE = /(?<![\w—–-])\d[\d,]*(?![\w—–-])/g

test.describe('the roadmap sections invent nothing @smoke', () => {
  test.slow()

  test('no number appears that is not a price or an ordinal', async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(300_000)

    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })

    const problems: string[] = []

    for (const [route, allowed] of ALLOWED) {
      await page.goto(route)
      const main = page.locator('#main')
      await expect(main).toBeVisible({ timeout: 60_000 })

      // The claim is made once per screen, before anything below it can be
      // mistaken for live.
      await expect(main.getByText(/coming soon|not built yet/i).first()).toBeVisible()

      // ── NO PICTURE-OF-A-CONTROL IS ANNOUNCED AS A CONTROL ────────────────
      // A `<button disabled>` is still announced as a button: a screen reader
      // offers the action, the reader takes it, nothing happens, and the failure
      // reads as a broken app rather than an unbuilt feature.
      const disabled = await main.locator('button:disabled, [aria-disabled="true"]').count()
      if (disabled > 0) problems.push(`${route}: ${disabled} disabled control(s) for unbuilt work`)

      // ── AND NO INERT CONTROL CARRIES A FIGURE ────────────────────────────
      const inert = main.locator('[data-inert-control]')
      for (let i = 0; i < (await inert.count()); i += 1) {
        const text = await inert.nth(i).innerText()
        // A roadmap screen's inert controls may carry an ordinal, so the check
        // here is the same allow-list rather than a blanket ban.
        for (const found of text.match(FIGURE) ?? []) {
          if (!allowed.includes(Number(found.replace(/,/g, '')))) {
            problems.push(`${route}: an inert control carries "${found}" — "${text.slice(0, 60)}"`)
          }
        }
      }

      // ── THE WHOLE SCREEN ─────────────────────────────────────────────────
      const text = (await main.innerText()).replace(/\s+/g, ' ')
      const seen = new Set((text.match(FIGURE) ?? []).map((n) => Number(n.replace(/,/g, ''))))
      for (const n of seen) {
        if (!allowed.includes(n)) {
          problems.push(`${route}: shows ${n}, which is neither a price nor an ordinal`)
        }
      }
    }

    expect(
      problems,
      'A container is a promise about Sahoda; a figure inside it is a claim about the ' +
        "reader's business. If one of these is legitimate, add it to ALLOWED with the reason.",
    ).toEqual([])
  })
})
