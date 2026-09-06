import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from './fixtures/seeded-user'
import { leaveOnboarding } from './fixtures/compose'

/**
 * THE FIVE ROADMAP SECTIONS SHOW NO FIGURE ABOUT THE READER'S BUSINESS.
 *
 * ── /studio LEFT ON 2026-08-28, BECAUSE IT WAS BUILT ────────────────────────
 * It was the only entry, and removing it would have emptied the list and made
 * the scan below iterate nothing while reporting green — the exact failure mode
 * this file exists to catch. So the list was REPOINTED at the roadmap screens
 * that are still drawings rather than left empty.
 *
 * The five `/ads/*` screens quote no price at all (MEASURED: no `creditCost`
 * call in any of them), so each carries an EMPTY allow-list: they may show no
 * figure whatsoever. `/radar` is deliberately NOT here — it quotes
 * `creditCost('radar_scan')` and carries no roadmap banner, because it was
 * built, and it left this list earlier for the same reason `/studio` has now.
 *
 * `/studio` renders saved rows: a gallery, a preview drawn by the same function
 * that writes the exported PNG, and an editor. It cannot say "coming soon"
 * because that sentence became false. What replaced this guard for that screen
 * is NARROWER and stronger, because it asserts PROVENANCE rather than a
 * permitted set of digits: `app/(app)/studio/page.test.tsx` requires the four
 * kinds of nothing to stay distinguishable, and has been watched fail against a
 * read failure that claimed the person had no designs.
 *
 * ── THE NUMBER IN THAT SENTENCE IS PART OF THE TEST, AND IT HAD DRIFTED ─────
 * It read SEVEN while `ALLOWED` held six: `/brain/audience` left in the same
 * commit that wrote the paragraph about it and the count was not brought with
 * it. Corrected to FIVE on 2026-08-22, when `/playbooks` left too. A header that
 * miscounts the list below it is the same class of thing this file exists to
 * catch, one level up.
 *
 * ── /remix AND /leads LEFT THIS LIST ON 2026-08-21, BECAUSE THEY WERE BUILT ──
 * (The lane wrote "which makes the word FIVE above true again" here. It did
 * not: /brain/knowledge and /playbooks had already left by the time this
 * merged, so the list is TWO. The word is asserted against the list now —
 * see the test directly above `ALLOWED`.)
 * `/remix` prices a real batch out of pricing.config.json, counts the drafts it
 * will write, charges credits and refuses at a zero balance. `/leads` has both
 * of its doors open — a public form endpoint behind a captcha, and a member
 * promoting a live inbox conversation — so it counts real rows in real columns.
 * Neither can say "coming soon" without lying, and the first assertion in the
 * loop below is what would catch it if either tried.
 *
 * THE REPLACEMENTS ARE NARROWER AND STRONGER, because they can assert
 * PROVENANCE rather than a permitted set of digits:
 * `components/remix/batch-preview.test.tsx` requires every figure on the cost
 * panel to be a credit price, a sum of prices, or a count of rows;
 * `components/leads/board.test.tsx` requires every figure on the pipeline to be
 * a count of rows. Each has been WATCHED FAIL against an injected figure — a
 * fabricated reach on one, a fabricated conversion rate on the other.
 *
 * ── /loop, /report AND NOW /playbooks LEFT THIS LIST, BECAUSE THEY WERE BUILT ─
 * They are not exceptions to the property below; they are no longer roadmap
 * sections. The Loop runs — it opens a cycle, prices a plan, charges credits and
 * writes drafts — so it shows a week number, a credit total and a count of
 * posts, every one of them out of a query. The first assertion in the loop below
 * is what caught it: `/loop` no longer says "coming soon", because that sentence
 * became false.
 *
 * `/playbooks` LEFT ON 2026-08-22 for the same reason. It runs: it opens a run,
 * reads a calendar, prices what it found, halts, charges on approval and writes
 * drafts. So it shows a credit total, a count of proposed drafts and the date a
 * run started, every one of them out of a query.
 *
 * ITS FIRST ASSERTION WOULD HAVE KEPT PASSING, WHICH IS THE TRAP. Four of the
 * five recipes are still blocked and each names the capability it waits on, so
 * `getByText(/coming soon|not built yet/i)` still finds a match on that page —
 * on a CARD, not on the screen. A guard that reads "the screen is a drawing" and
 * is satisfied by "one card is a drawing" is not a weaker guard, it is a
 * different one wearing the same name.
 *
 * WHERE THE PROPERTY LIVES FOR IT NOW: `components/playbooks/run-preview.test.tsx`
 * asserts that every digit the cost preview renders is a credit price from
 * pricing.config.json, a sum of them, or a count of rows — and it is verified by
 * injecting a fabricated engagement figure and watching the scan fail.
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
 * five are not like that. They legitimately carry two kinds of number:
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
 * NOT WIRED YET, AND DELIBERATELY NOT DELETED.
 *
 * `price()` reads `pricing.config.json` and throws on a missing key, so the
 * ALLOWED table below could name its credit figures by ACTION rather than as
 * literals that drift the moment a price changes. Nothing calls it today.
 * Rewiring the table is a real change to what this spec asserts, and the smoke
 * leg has no working environment here to watch it fail in, so it is recorded
 * rather than done half way.
 */
void price

/**
 * route → every number that may legitimately appear in `#main`.
 *
 * Ordinals are listed explicitly rather than as a range, so adding an eighth
 * Loop stage is a decision someone takes here too.
 */
const ALLOWED: ReadonlyArray<readonly [string, readonly number[]]> = [
  // `/playbooks` IS NOT IN THIS LIST ANY MORE, and the removal is the point
  // rather than a loosening — see the header. `playbook_run` stays in
  // pricing.config.json and the screen still quotes it; the screen that quoted
  // it as a promise is now a screen that charges it.
  // `/radar` IS NOT IN THIS LIST ANY MORE, and the removal is the point rather
  // than a loosening — the same move `/playbooks`, `/brain/audience`, `/remix`,
  // `/leads` and `/brain/knowledge` each made when they stopped being drawings.
  //
  // The entry's own reasoning said why it belonged: "with the `competitors`
  // table absent … `/radar` renders one honest panel saying the scan is not
  // built yet. It still says so, so it stays on this list." Both halves of that
  // are now false. The table is present — wt-radar applied its migrations to the
  // shared database — and as of 20260823030000 a signed-in member can actually
  // SUBSCRIBE: `public.radar_subscribe` is granted to `authenticated`, and
  // `lib/radar/store.ts` is bound to it. `read()` returns `watch-list-only`, not
  // `absent`, so the screen no longer draws "The weekly scan is not built yet".
  //
  // What it draws instead is narrower and still honest: "Your watch list is
  // stored, and the weekly readings are not wired into this screen yet. This is
  // not 'nothing changed' — it is Radar not being able to tell you either way."
  // A screen that reads a real table and states precisely which half of itself
  // is unbound is not a roadmap section, and holding it to a "coming soon" it no
  // longer says would be asserting a sentence back into existence.
  //
  // THE PER-SCAN PRICE IT QUOTES IS NOW UNCHECKED BY THIS FILE. That is the cost
  // of the removal and it is stated rather than absorbed: `/radar` invents no
  // figure today, and nothing here will notice if it starts.
  // Each allows NOTHING: these five quote no price, so any digit on them is one
  // they invented. `/studio` used to sit here allowing `price('carousel')`; it
  // was built on 2026-08-28 and no longer quotes a figure at all.
  // `/ads` carries the gates ladder (components/ads/gates-ladder.tsx): three
  // steps labelled "Step 1" to "Step 3". Ordinals of Sahoda's own process, not
  // a claim about the reader's business. MEASURED run 34012814133.
  ['/ads', [1, 2, 3]],
  ['/ads/creative', []],
  ['/ads/targeting', []],
  ['/ads/budget', []],
  ['/ads/performance', []],
  // `/brain/audience` IS NOT IN THIS LIST ANY MORE, and the removal is the point
  // rather than a loosening. This guard exists to stop screens that are DRAWINGS
  // from inventing figures. That tab is no longer a drawing: it reads
]

/** A standalone run of digits. Excludes ones welded into a word or a dash-run. */
const FIGURE = /(?<![\w—–-])\d[\d,]*(?![\w—–-])/g

/**
 * THE HEADER'S NUMBER IS NOW DERIVED, BECAUSE PROSE DRIFTS AND HAS.
 *
 * The header opens "THE <N> ROADMAP SECTIONS", and its own paragraph claims that
 * number "is part of the test". It was not — nothing read it. MEASURED: it said
 * SEVEN over a list of six, was corrected to FIVE, and by the time
 * /brain/knowledge, /playbooks, /remix and /leads had all left it would have
 * said FIVE over a list of TWO. A header that miscounts the list beneath it is
 * the same class of thing this file exists to catch, one level up, so it is
 * asserted here rather than merely asserted about.
 */
const HEADER_COUNTS: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  SEVEN: 7,
}

test('@smoke the number in the header is the length of the list below it', () => {
  const source = readFileSync(fileURLToPath(import.meta.url), 'utf8')
  const word = /THE ([A-Z]+) ROADMAP SECTIONS? SHOWS? NO FIGURE/.exec(source)?.[1]
  expect(word, 'the header sentence this test reads has been reworded').toBeDefined()
  expect(HEADER_COUNTS[word!], `"${word}" is not a number word this test knows`).toBe(
    ALLOWED.length,
  )
})

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
    await leaveOnboarding(page)

    // ── A SCAN OVER AN EMPTY LIST IS NOT A PASS ──────────────────────────
    // If the last roadmap screen is ever built, this loop iterates zero times
    // and reports green forever, which is the failure mode it exists to catch.
    // It says so instead. Retire this file, or give it a route.
    expect(
      ALLOWED.length,
      'every roadmap section has been built, so this scan guards nothing. Retire this file or add a route.',
    ).toBeGreaterThan(0)

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
