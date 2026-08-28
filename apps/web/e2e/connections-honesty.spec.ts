import { expect, test } from './fixtures/seeded-user'
import { leaveOnboarding } from './fixtures/compose'

/**
 * /CONNECTIONS, CHECKED IN A REAL BROWSER, BY TEXT.
 *
 * READ TEXT, NOT BOXES. Run 13's regression asserted widths, offsets and overflow
 * flags, went green at every width, and shipped a rail rendering the literal
 * string "S Sah". Everything below reads rendered text, roles and computed
 * styles — never a box size.
 *
 * The four properties, each of which was a real defect before it was a test:
 *
 *  1. A channel with no adapter offers NO control. `docs/26` §10.2 — a disabled
 *     button is still announced as a button, so the user takes an action that
 *     does nothing and reads the result as a broken app.
 *  2. At most one primary PER CARD, and none on a connected one. Run 17 found
 *     four full-width solid-orange primaries on a screen that had no primary at
 *     all. The unit moved from the view to the card on the founder's 28 August
 *     ruling — the reasoning is at the assertion, not here. (This line used to
 *     say "there are now eight tiles"; the catalogue holds FIFTEEN.)
 *  3. Readiness and connection are stated SEPARATELY. `docs/27` §3.3 measured two
 *     vocabularies sharing one slot, with the stronger treatment on the less
 *     important status.
 *  4. Every channel is named. Nine unnamed links is what a `display:none` label
 *     looked like the last time this was not checked.
 */

const WIDTHS = [1440, 1024, 768, 390] as const

test.describe('connections is honest about every channel @smoke', () => {
  test.slow()

  test('every rule holds, at four widths', async ({ page, signedIn }) => {
    void signedIn

    // The bootstrap. Without it the page renders the workspace-less branch, and
    // `docs/26` §11 is explicit that measuring THAT state proves nothing about
    // the real one — it is three items short.
    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    await leaveOnboarding(page)

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/connections')
      await expect(page.locator('#main')).toBeVisible({ timeout: 30_000 })

      const main = page.locator('#main')

      // ── 1 · A COMING-SOON TILE HAS NOTHING TO PRESS ───────────────────────
      const comingSoon = main.locator('[data-coming-soon="true"]')
      await expect(comingSoon.first()).toBeVisible()
      const comingSoonCount = await comingSoon.count()
      // ── THE FROZEN NUMBER IS GONE, AND IT HAD ALREADY ROTTED ──────────────
      // This read `.toBe(4)`. MEASURED against `lib/connections/catalogue.ts:99`:
      // `PLANNED_CHANNELS = ['snapchat']`, so the page renders exactly ONE
      // coming-soon tile and has done since the catalogue was rewritten. The
      // assertion could not pass, which means every property BELOW it — the
      // primary count, the two vocabularies, the channel names — has not run
      // either. A hard `expect` aborts the test at this line.
      //
      // The count was never this section's property. The heading says it: a
      // coming-soon tile has NOTHING TO PRESS. That is checked by the loop
      // underneath and does not care how many there are. Asserting presence
      // keeps the guard honest against a page that renders none at all, without
      // re-freezing a figure the catalogue is free to change.
      expect(comingSoonCount, `width ${width}: planned channels rendered`).toBeGreaterThan(0)

      for (let i = 0; i < comingSoonCount; i += 1) {
        const tile = comingSoon.nth(i)
        expect(
          await tile.evaluate((el) => el.tagName),
          `width ${width}: a coming-soon tile must be a div`,
        ).toBe('DIV')
        expect(
          await tile.locator('button, a, [role="button"], [aria-disabled]').count(),
          `width ${width}: a coming-soon tile must offer no control`,
        ).toBe(0)
      }

      // ── 2 · ONE PRIMARY PER CARD, AND NONE ON A CONNECTED ONE ─────────────
      // Counted by RENDERED FILL, not by a class name: a class is a promise and
      // the pixel is the fact. `--brand` is the only solid accent fill in the
      // system, so anything painted with it is claiming to be a primary.
      //
      // ── WHAT THIS REPLACED, AND WHY ───────────────────────────────────────
      // This asserted ONE brand fill in the whole view (§1.5, "one primary per
      // view"). Founder's ruling, 28 August 2026: the first Connect on a channel
      // is that channel's primary and is painted `--brand`. Fifteen cards means
      // fifteen fills, so the old number could not survive the ruling.
      //
      // It is retargeted rather than deleted, because the DEFECT it was written
      // for is still real — run 17 found four full-width orange primaries on a
      // screen that had no primary at all. What changed is the unit. §1.5 is
      // about a view where the reader must pick ONCE; this screen asks the
      // reader to pick independently, per card, up to fifteen times. So the
      // budget moves from the view to the card, and two new claims replace the
      // one that went:
      //
      //   a. no card carries more than one brand fill — catches Details,
      //      Disconnect or a chip being painted primary alongside Connect;
      //   b. a CONNECTED card carries none — the founder's "connected accounts
      //      use a subtle secondary" as a check rather than a preference. This
      //      is the half that keeps the orange MEANINGFUL: it marks "not yet
      //      connected", so it is information and not decoration;
      //   c. the page furniture outside the cards keeps the old ceiling of one,
      //      which is the connection-health banner's own primary.
      //
      // This is weaker than the original in one way and stronger in two, and
      // saying so is the point: the total is no longer bounded, but per-card
      // discipline and the connected/unconnected distinction were not checked
      // by the old assertion at all.
      const fills = await main.evaluate((root) => {
        const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()
        // Resolve the token to the rgb() string the browser actually computes.
        const probe = document.createElement('span')
        probe.style.backgroundColor = brand
        document.body.appendChild(probe)
        const resolved = getComputedStyle(probe).backgroundColor
        probe.remove()

        const isBrand = (el: Element) => getComputedStyle(el).backgroundColor === resolved
        const controls = (scope: Element) =>
          Array.from(scope.querySelectorAll('button, a[href]')).filter(isBrand).length

        // ── `[data-channel]` ALONE IS THE WRONG SET, AND IT WAS MEASURED ───
        // `channel-logo.tsx:91,106` puts `data-channel` on the MARK as well as
        // the tile, so the bare attribute matched 22 elements for 15 tiles when
        // this was first run — the same attribute collision `channel-tile.tsx`
        // records at :248 for `data-readiness`, one screen later. Every extra
        // match reported zero fills, so the per-card ceiling passed by
        // measuring things that were never going to carry a button, and the
        // `outside` subtraction below double-counted their parents.
        //
        // Only the tile carries BOTH, which is why `connections-widths.spec.ts`
        // already selects it this way.
        const cards = Array.from(root.querySelectorAll('[data-channel][data-connected]'))
        return {
          cards: cards.length,
          perCard: cards.map((c) => ({
            channel: c.getAttribute('data-channel') ?? '?',
            connected: c.getAttribute('data-connected') === 'true',
            brandFills: controls(c),
          })),
          // Everything NOT inside a card. Counted by subtraction so a control
          // that moves out of a card cannot escape the check by moving.
          outside: controls(root) - cards.reduce((sum, c) => sum + controls(c), 0),
        }
      })

      // A run that found no cards would satisfy every claim below by measuring
      // nothing, which is the failure mode this whole file was written against.
      expect(fills.cards, `width ${width}: cards were found to measure`).toBeGreaterThan(0)

      for (const card of fills.perCard) {
        expect(
          card.brandFills,
          `width ${width}: ${card.channel} carries more than one primary`,
        ).toBeLessThanOrEqual(1)
        if (card.connected) {
          expect(
            card.brandFills,
            `width ${width}: ${card.channel} is connected, so its control is not a primary`,
          ).toBe(0)
        }
      }

      expect(
        fills.outside,
        `width ${width}: page furniture outside the cards spends at most one primary`,
      ).toBeLessThanOrEqual(1)

      // ── 3 · TWO AXES, STATED SEPARATELY ───────────────────────────────────
      // Readiness is a claim about Sahoda; connection is a claim about the
      // customer. Both must be present as WORDS, on the same screen.
      const text = (await main.innerText()).replace(/\s+/g, ' ')
      expect(text, `width ${width}: readiness stated`).toMatch(
        /Publishes today|Not proven live|Coming soon/,
      )
      expect(text, `width ${width}: connection stated`).toMatch(/Not connected|Connected|Needs you/)

      // Both unproven channels say so, and neither claims to have been verified.
      expect(text).toContain('Not proven live')
      expect(text).not.toMatch(/verified live/i)

      // ── 4 · EVERY CHANNEL IS NAMED, IN WORDS ──────────────────────────────
      for (const name of [
        'Instagram',
        'LinkedIn',
        'Google Business Profile',
        'Facebook Pages',
        'YouTube',
        'Pinterest',
        'Telegram',
      ]) {
        expect(text, `width ${width}: ${name} is named`).toContain(name)
      }

      // ── 5 · THE X METER IS A REAL FRACTION ────────────────────────────────
      // A numerator, the word "of", and a denominator that exists — the shape
      // `100 of —` failed. The count is whatever the database says; the
      // denominator is Sahoda's declared ration.
      expect(text, `width ${width}: the X allowance is rendered`).toMatch(
        /X posts this month \d+ of \d+/i,
      )
      // And it is attributed. X imposes no monthly write allowance, so a meter
      // that read as X's would be inventing a limit X does not have.
      expect(text).toMatch(/allowance is ours rather than X/)

      // ── 6 · NOTHING IS TRUNCATED TO NONSENSE ──────────────────────────────
      // "S Sah" was every number being right and the pixels being wrong.
      expect(text).not.toMatch(/\b\w{1,2}…/)
    }
  })

  test('the two quiet readiness rungs stay apart IN DARK @smoke', async ({ page, signedIn }) => {
    void signedIn

    // ── WHY THIS TEST EXISTS AND WHY TEXT CANNOT COVER IT ────────────────────
    // `docs/26` §3.1 measures `.is-committed` and `.is-proposed` at 6/1000 and
    // 3/1000 greyscale luminance in dark — a THREE THOUSANDTHS gap. The tint is
    // invisible there, so "the hairline is doing 100% of the work". This screen
    // is the one place both rungs render side by side, on tiles a reader is
    // comparing directly, so if the edges ever collapse to the same treatment
    // the two claims become one claim in dark and nothing above would notice:
    // every rendered-text assertion passes either way.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('sahoda-theme', 'dark')
      } catch {
        /* storage blocked — best effort, the assertion below still runs */
      }
    })

    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    await leaveOnboarding(page)
    await page.goto('/connections')
    await expect(page.locator('#main')).toBeVisible({ timeout: 30_000 })

    const edgeOf = async (readiness: string) =>
      page
        .locator(`#main [data-readiness-chip="${readiness}"]`)
        .first()
        .evaluate((el) => {
          const s = getComputedStyle(el)
          return { style: s.borderTopStyle, width: s.borderTopWidth, color: s.borderTopColor }
        })

    const committed = await edgeOf('built-not-proven')
    const proposed = await edgeOf('not-built')

    // The structural separator, asserted as the browser computed it.
    expect(committed.style).toBe('solid')
    expect(proposed.style).toBe('dashed')
    // And neither edge may be absent — "no border" is how a rung stops existing.
    expect(committed.width).not.toBe('0px')
    expect(proposed.width).not.toBe('0px')

    // The theme really was dark, so the above was measured where it matters.
    const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const [r, g, b] = canvas.match(/\d+/g)!.map(Number) as [number, number, number]
    expect(r + g + b, `body background ${canvas} should be dark`).toBeLessThan(200)
  })

  test('every interactive control on the screen has an accessible name @smoke', async ({
    page,
    signedIn,
  }) => {
    void signedIn

    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    await leaveOnboarding(page)

    // 390 specifically: labels go `sr-only` at narrow widths, and `display:none`
    // would remove the node from the accessibility tree and take the name with
    // it (`docs/26` §9). That bug looked like nine unnamed links.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/connections')
    await expect(page.locator('#main')).toBeVisible({ timeout: 30_000 })

    const unnamed = await page.locator('#main').evaluate(
      (root) =>
        Array.from(root.querySelectorAll('button, a[href]'))
          .filter((el) => ((el as HTMLElement).innerText ?? '').trim() === '')
          .filter((el) => !el.getAttribute('aria-label') && !el.querySelector('.sr-only')).length,
    )
    expect(unnamed, 'every control on /connections is named').toBe(0)
  })
})
