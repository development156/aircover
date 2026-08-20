import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from './fixtures/seeded-user'

/**
 * THE SEVEN ROADMAP SECTIONS SHOW NO FIGURE ABOUT THE READER'S BUSINESS.
 *
 * ── WHY A BLANKET "NO DIGITS" CHECK WOULD BE THE WRONG TEST ──────────────────
 * `/ads` can be tested that way and is (`campaigns.spec.ts`): it has no price to
 * quote and no sequence to number, so every digit on it would be a lie. These
 * seven are not like that. They legitimately carry two kinds of number:
 *
 *   · A CREDIT PRICE, read from `pricing.config.json` through `creditCost()`.
 *     A price is a published, checkable fact ABOUT SAHODA — the same class of
 *     thing as a channel name — not a claim about the reader.
 *   · AN ORDINAL: the Loop's seven stages, Radar's five competitor slots. Those
 *     number a sequence and a cap, both of which are facts about the product.
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
 * Loop stage or a sixth Radar slot is a decision someone takes here too.
 */
const ALLOWED: ReadonlyArray<readonly [string, readonly number[]]> = [
  // 1–7: the Loop's seven stages, which are a real sequence. Plus the cycle price.
  ['/loop', [1, 2, 3, 4, 5, 6, 7, price('loop_cycle')]],
  ['/playbooks', [price('playbook_run')]],
  // 1–5: the five competitor slots, which are the cap PRD M9 sets.
  ['/radar', [1, 2, 3, 4, 5, price('radar_scan')]],
  // The report names nothing countable at all.
  ['/report', []],
  ['/leads', []],
  ['/studio', [price('carousel')]],
  ['/remix', [price('remix_pack')]],
  ['/brain/audience', [price('twin_preflight')]],
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
        // The Loop's stage cards and Radar's slots ARE inert controls and DO
        // carry their ordinal, so the check here is the same allow-list rather
        // than a blanket ban.
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
