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
 *  2. At most ONE primary. Run 17 found four full-width solid-orange primaries on
 *     this one screen; there are now eight tiles, so the rule matters more.
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
      expect(comingSoonCount, `width ${width}: planned channels rendered`).toBe(4)

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

      // ── 2 · ONE PRIMARY AT MOST ───────────────────────────────────────────
      // Counted by RENDERED FILL, not by a class name: a class is a promise and
      // the pixel is the fact. `--brand` is the only solid accent fill in the
      // system, so anything painted with it is claiming to be the primary.
      const brandFilled = await main.evaluate((root) => {
        const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()
        // Resolve the token to the rgb() string the browser actually computes.
        const probe = document.createElement('span')
        probe.style.backgroundColor = brand
        document.body.appendChild(probe)
        const resolved = getComputedStyle(probe).backgroundColor
        probe.remove()

        return Array.from(root.querySelectorAll('button, a[href]')).filter(
          (el) => getComputedStyle(el).backgroundColor === resolved,
        ).length
      })
      expect(brandFilled, `width ${width}: one primary per view (§1.5)`).toBeLessThanOrEqual(1)

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

      // ── 4 · EVERY CHANNEL WE OFFER IS NAMED, IN WORDS ─────────────────────
      // RETARGETED 2026-08-28, and the claim narrowed on purpose rather than the
      // list being trimmed to whatever passes. It read "every channel is named"
      // and included Telegram. `HIDDEN_FROM_OFFER` now withholds telegram,
      // tiktok and slack from a workspace that has not linked them, so the old
      // form asserted the opposite of a deliberate product decision.
      //
      // This workspace has NO connections, so what it can see is the offer. The
      // claim is unchanged in shape — /connections must name what it offers, in
      // words a person recognises, never an internal id — and the two halves
      // below are now stated separately because they are different claims.
      for (const name of [
        'Instagram',
        'LinkedIn',
        'Google Business Profile',
        'Facebook Pages',
        'YouTube',
        'Pinterest',
      ]) {
        expect(text, `width ${width}: ${name} is named`).toContain(name)
      }

      // ── 4b · AND THE WITHHELD ONES ARE NOT OFFERED ────────────────────────
      // The other direction, which is what actually holds the decision in place.
      // Without it, `HIDDEN_FROM_OFFER` could be emptied tomorrow and the only
      // signal would be three tiles quietly reappearing on a live screen.
      //
      // Sound only because this workspace has nothing linked: a workspace that
      // HAD linked one of these must still see it under "Your channels", which
      // is why the filter is not applied to that group. `connections/groups.ts`
      // carries that half, where it can be tested without a browser.
      for (const name of ['Telegram', 'TikTok', 'Slack']) {
        expect(text, `width ${width}: ${name} is not offered`).not.toContain(name)
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
