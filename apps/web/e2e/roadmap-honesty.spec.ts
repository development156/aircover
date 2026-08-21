import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from './fixtures/seeded-user'

/**
 * THE FIVE ROADMAP SECTIONS SHOW NO FIGURE ABOUT THE READER'S BUSINESS.
 *
 * ── /loop AND /report LEFT THIS LIST ON 2026-08-20, BECAUSE THEY WERE BUILT ──
 * (Which makes the word SEVEN above true again: the list had grown to nine.)
 * They are not exceptions to the property below; they are no longer roadmap
 * sections. The Loop runs — it opens a cycle, prices a plan, charges credits and
 * writes drafts — so it shows a week number, a credit total and a count of
 * posts, every one of them out of a query. The first assertion in the loop below
 * is what caught it: `/loop` no longer says "coming soon", because that sentence
 * became false.
 *
 *
 * ── /brain/knowledge LEFT THIS LIST ON 2026-08-22, FOR THE SAME REASON ──────
 * It has a store now: `knowledge_documents`, `knowledge_chunks` and a full-text
 * index behind them. So it shows figures — how many documents are ready to quote
 * from, how many passages a document holds, how many places in it are written as
 * if to address an assistant — and every one comes out of a query rather than
 * out of a reference design. The screen it replaced said outright that "no table
 * in the database holds a document, a fact or a citation"; that sentence is now
 * false, which is exactly what the first assertion in the loop below detected.
 *
 * WIDENING `ALLOWED` FOR IT WOULD HAVE BEEN THE WRONG REPAIR, as it was for
 * /loop. Where the property lives for it now: `lib/knowledge/store.ts` returns
 * `null` rather than zero when a read fails, so the count renders the Unmeasured
 * mark instead of a figure; `page.test.tsx`-style coverage sits in
 * `lib/knowledge/*.test.ts` and `packages/research/src/knowledge/*`, where the
 * chunk counts, the passage counts and the instruction count are each asserted
 * against what was actually stored; and `add-document.test.tsx` holds the one
 * number on the screen that is NOT from a query — the credit price — to
 * `pricing.config.json` by deriving it from `MESH_TASK_ACTION`.
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
  ['/playbooks', [price('playbook_run')]],
  // 1–5: the five competitor slots, which are the cap PRD M9 sets.
  ['/radar', [1, 2, 3, 4, 5, price('radar_scan')]],
  ['/leads', []],
  ['/studio', [price('carousel')]],
  ['/remix', [price('remix_pack')]],
  // `/brain/audience` IS NOT IN THIS LIST ANY MORE, and the removal is the point
  // rather than a loosening. This guard exists to stop screens that are DRAWINGS
  // from inventing figures. That tab is no longer a drawing: it reads
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
