import type { Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { adminClient, expect, test } from './fixtures/seeded-user'

/**
 * THE SIGNAL RESOLUTION CONSOLE, in a real browser, against a real brain.
 *
 * ── WHY THIS EXISTS ALONGSIDE THE COMPONENT TESTS ────────────────────────────
 * `resolution-console.test.tsx` renders the component in jsdom and proves the
 * behaviour. It cannot prove two things that only exist once a stylesheet has
 * been applied and a server has answered:
 *
 *   1. That the selected checkbox is LEGIBLE IN DARK. The pair
 *      `dark:bg-white dark:text-[var(--canvas)]` is the exact construction that
 *      shipped broken twice as `dark:bg-white dark:text-ink` — white on white —
 *      because `--ink` inverts to `#ffffff` in dark. jsdom has no cascade, so a
 *      class-string assertion there would pass on the broken version too. This
 *      reads the COMPOSITED COLOURS off the rendered element.
 *
 *   2. That the page renders at all against a real `brand_memory` row, with the
 *      real `readBrain` path and the real server action. A console that throws
 *      on a stored payload is not something a mocked action can catch.
 *
 * READ TEXT, NOT BOXES. Every assertion below is on rendered text or on a
 * computed colour — run 13's regression passed every numeric check and shipped
 * a rail rendering the literal string "S Sah".
 */

/** Relative luminance of an `rgb()`/`rgba()` string, per WCAG. */
const CONTRAST = `(a, b) => {
  const parse = (s) => (s.match(/[\\d.]+/g) || []).slice(0, 3).map(Number)
  const lum = (c) => {
    const [r, g, bl] = parse(c).map((v) => {
      const x = v / 255
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const l1 = lum(a)
  const l2 = lum(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}`

/**
 * A resolved Brand Brain, inline.
 *
 * NOT imported from `@sahoda/shared`. Playwright's ESM loader refuses that
 * package because it reaches `pricing.config.json` without an
 * `import attribute of "type: json"`, and no other spec in this suite imports
 * from shared — so adding the first one breaks the whole run at collection for
 * the sake of a fixture. MEASURED: `TypeError: Module ".../pricing.config.json"
 * needs an import attribute of "type: json"`, followed by `No tests found`.
 *
 * A STALE SHAPE CANNOT PASS SILENTLY, which is what makes an inline copy
 * acceptable. This is inserted with the service-role client, so Postgres takes
 * any jsonb — but `readBrain` parses it with `StoredBrandMemorySchema`, and a
 * payload that no longer matches the contract returns `unreadable`. The page
 * then renders the reload notice instead of the console and the first assertion
 * below fails. A contract change breaks this loudly rather than leaving it
 * testing a shape the app no longer has.
 */
const RESOLVED_BRAIN = {
  voice: {
    descriptor: 'Warm and unhurried, the way a regular gets spoken to.',
    formality_label: 'Neutral',
    signature_phrases: ['Freshly out of the oven', 'Nothing bought in', 'See you Saturday'],
    banned_phrases: ['artisanal', 'game-changing'],
  },
  brand_persona: {
    archetype: 'Caregiver',
    one_liner: 'A neighbourhood baker who remembers what you ordered last time.',
    core_values: ['Craft over volume', 'Plain speaking', 'Showing up daily'],
  },
  customer_persona: {
    one_liner: 'People within a mile who buy bread more than once a week.',
    primary_pain_point: 'Supermarket bread that is stale by the evening.',
    primary_fear: 'Turning up and finding the good loaves gone.',
    desired_identity: 'Someone who knows their baker by name.',
  },
  hook: {
    core_promise: 'Bread baked this morning, on this street, by people you can name.',
    primary_emotion: 'Relief',
    sample_hooks: [
      'The sourdough came out at six.',
      'Two trays left, and then that is it.',
      'We start again at four tomorrow.',
    ],
  },
  taboo: {
    red_lines: ['Never claim anything is sugar-free', 'Never joke about allergies'],
  },
  alignment: { signal_lock: 'moderate', note: 'Resolved from a short site read.' },
} as const

/**
 * Bootstrap a workspace and return its id.
 *
 * POLLS THE DATABASE, not the button. Waiting for "Create workspace" to
 * disappear looked right and is not: the button's `disabled` state is a submit
 * indicator, so on a loaded machine it stays visible-and-disabled well past a
 * 30s budget while the row it created already exists. That failure reports as
 * "the bootstrap never happened", which is the opposite of what occurred.
 * The row is the state this test actually needs, so the row is what it waits on.
 */
async function bootstrapWorkspace(
  page: Page,
  admin: SupabaseClient,
  clerkUserId: string,
): Promise<string> {
  await page.goto('/home')
  await page
    .locator('#main')
    .getByRole('button', { name: /create workspace/i })
    .click()

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const { data } = await admin
      .from('workspaces')
      .select('id')
      .eq('created_by', clerkUserId)
      .maybeSingle()
    if (data?.id) return data.id as string
    await page.waitForTimeout(1000)
  }
  throw new Error('the workspace bootstrap never wrote a row')
}

/** Seed a brain exactly as a resolve leaves it: filled, unconfirmed, `resolved`. */
async function seedResolvedBrain(admin: SupabaseClient, workspaceId: string): Promise<void> {
  const { error } = await admin.from('brand_memory').insert({
    workspace_id: workspaceId,
    version: 1,
    status: 'active',
    source: 'resolved',
    payload: RESOLVED_BRAIN,
  })
  if (error) throw new Error(`seeding the brain failed: ${error.message}`)
}

/**
 * Prove the page really is in dark, WITHOUT pinning a palette value.
 *
 * Both call sites used to assert `--canvas === '#0b0b0c'`. The INTENT was right
 * and is kept — in light, `--ink` is black and both pairs are legible, so a
 * theme that failed to apply would make these tests pass on the one state the
 * bug never existed in. The IMPLEMENTATION was brittle: it pinned v4's exact
 * dark canvas, so v5 moving it to the reference's measured #0d0d0d failed two
 * tests that were not testing the palette at all.
 *
 * What the tests actually need is "the ground is dark", so that is what this
 * measures — relative luminance, not a string. It survives any future retune of
 * the ladder and still catches a theme that never applied (light's canvas
 * measures ~0.96).
 */
async function expectDarkGround(page: import('@playwright/test').Page): Promise<void> {
  const lum = await page.evaluate(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()
    const hex = raw.replace('#', '')
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)
  })
  expect(
    lum,
    `--canvas has a relative luminance of ${lum.toFixed(4)} — the page is not in dark, so anything ` +
      `measured on it would be measuring the state this test does not cover`,
  ).toBeLessThan(0.05)
}

test.describe('signal resolution console @smoke', () => {
  test('a resolved brain arrives as a queue of guesses, and a batch can be confirmed', async ({
    page,
    signedIn,
  }) => {
    const admin = adminClient()
    test.skip(admin === null, 'needs SUPABASE_SERVICE_ROLE_KEY to seed a brain')

    // ── A workspace, through the app's own bootstrap. Seeding one directly
    //    would skip the membership and the credit grant the real path creates.
    const workspaceId = await bootstrapWorkspace(page, admin!, signedIn.clerkUserId)
    await seedResolvedBrain(admin!, workspaceId)

    await page.goto('/brain/resolve')

    // ── The origin, read off `brand_memory.source` and not invented.
    await expect(page.getByRole('heading', { name: /written by sahoda/i })).toBeVisible()

    // ── The absence of per-field evidence, stated rather than left to assume.
    await expect(page.getByText(/cannot show which sentence led to which field/i)).toBeVisible()

    // ── The finding, as TEXT, with numbers a query produced.
    const finding = page.getByRole('heading', { name: /fields are still Sahoda/i })
    await expect(finding).toBeVisible()
    expect(await finding.innerText()).toMatch(/\b15\b.*\b15\b/s)

    // ── Nothing is pre-ticked, and the one primary is inert until something is.
    const boxes = page.getByRole('checkbox')
    await expect(boxes).toHaveCount(15)
    for (const box of await boxes.all()) await expect(box).not.toBeChecked()
    await expect(page.getByRole('button', { name: /confirm selected · free/i })).toBeDisabled()

    // ── NO ROW CLAIMS A SOURCE. Asserted over rendered text, because a source
    //    claim could arrive from a copy edit in any of three files.
    const rowText = await page.locator('[data-field]').allInnerTexts()
    expect(rowText.length).toBe(15)
    for (const text of rowText) {
      expect(text).not.toMatch(/\b(from|on) your (site|website|page|pdf|document)/i)
    }

    // ── NOR DOES A GROUP HEADER. The entitlement sentence moved out of the
    //    rows and into one header per group, so the scan above no longer reaches
    //    it — scanned separately rather than by widening the locator, because
    //    the row count of 15 above has to stay exact.
    const groupText = await page.locator('[id^="console-group-"]').allInnerTexts()
    expect(groupText.length).toBeGreaterThan(0)
    for (const text of groupText) {
      expect(text).not.toMatch(/\b(from|on) your (site|website|page|pdf|document)/i)
    }

    // ── Tick two, and confirm exactly those two.
    await boxes.nth(0).check()
    await boxes.nth(1).check()
    const primary = page.getByRole('button', { name: /confirm 2 selected · free/i })
    await expect(primary).toBeEnabled()
    await primary.click()

    await expect(page.getByRole('status')).toContainText(/confirmed 2 fields/i, {
      timeout: 30_000,
    })

    /**
     * The strongest available proof that the write was real and was ONE write:
     * a single new version, not two. Nothing on any screen renders this number.
     *
     * ── WHY A NEW VERSION EXISTS AT ALL ──────────────────────────────────────
     * Worth pinning, because the bulk path passes `brain.active` COMPLETELY
     * UNCHANGED — it confirms wording, it never edits it — and
     * `resolve_brand_memory` has a content-idempotency branch that returns
     * `replayed: true` without inserting. If that branch compared only the six
     * validated sections, this whole action would be a silent no-op and the ring
     * would never move; every jsdom test mocks the action away, so none of them
     * could see it.
     *
     * It does not. The migration compares `v_cur.payload = p_payload` — full
     * jsonb equality over the WHOLE column — and `field_meta` is written INSIDE
     * `p_payload` by `saveBrandMemory`. Confirming changes `confirmed: false` to
     * `true` for the named paths, so the payloads differ and the insert runs.
     * This assertion is what keeps that true: a future change that moved
     * `field_meta` out of the payload, or narrowed the comparison to the model
     * sections, would leave `version` at 1 here.
     */
    const { data: versions } = await admin!
      .from('brand_memory')
      .select('version, source')
      .eq('workspace_id', workspaceId)
      .order('version', { ascending: false })
    expect(versions?.[0]?.version).toBe(2)
    expect(versions?.[0]?.source).toBe('manual')
    expect(versions).toHaveLength(2)

    // ── And the queue is two shorter, read back from the server render.
    await page.reload()
    await expect(page.getByRole('checkbox')).toHaveCount(13)

    /**
     * AND THE ORIGIN FOLLOWS THE COLUMN. The confirm wrote `source = 'manual'`,
     * so the header must stop calling this a model resolve. This is the whole
     * point of reading `brand_memory.source` rather than assuming: a brain that
     * a person has edited is a different claim from one a model wrote, and the
     * page has to change its mind when the row does.
     */
    await expect(page.getByRole('heading', { name: /last edited by a person/i })).toBeVisible()

    /**
     * ── THE WIDTHS, INCLUDING THE BAND NOBODY SAMPLES ────────────────────────
     * `docs/27_Design_Audit.md` measured 16 routes at 1440 and 390 and missed
     * defects in between; the shell's own proof runs six widths for that reason.
     * 768 and 1024 are where this screen is most likely to break, because the
     * row header carries a label, a certainty chip and a two-button group on one
     * flex line, and that is exactly the arrangement that overflows before it
     * wraps.
     *
     * Asserted as DOCUMENT overflow rather than per-element geometry: a row that
     * pushes the page sideways is the failure a user feels, and it is the one
     * `scrollWidth > clientWidth` catches without knowing which element did it.
     */
    for (const width of [390, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      /*
        Re-assert something real at each width, so a blank render cannot pass the
        overflow check by having nothing in it.

        NOT the origin heading. This runs after the bulk confirm, and the confirm
        writes `source = 'manual'` — so `brand_memory.source` genuinely changes
        and the header correctly stops saying "Resolved by Sahoda" and starts
        saying "Last edited by hand". An earlier draft asserted the old heading
        here and failed, which is the origin note doing exactly its job: it
        reports the stored column rather than remembering what the page said a
        moment ago. The queue heading is the stable thing at this point.
      */
      await expect(page.getByRole('heading', { name: /^still to check$/i })).toBeVisible()
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(
        overflow.scrollWidth,
        `horizontal overflow at ${width}px: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`,
      ).toBeLessThanOrEqual(overflow.clientWidth)
    }
  })

  /**
   * THE DARK-MODE PAIR, MEASURED.
   *
   * The selected checkbox uses `bg-ink text-white dark:bg-white
   * dark:text-[var(--canvas)]` — the same construction that shipped as
   * `dark:text-ink` in `pick-chips.tsx` and `step-rail.tsx`, where `--ink`
   * inverts to white and the tick vanished into its own fill.
   *
   * This asserts the composited colours, not the class list. A screenshot of
   * white-on-white looks like an empty checkbox, which is exactly how the bug
   * survived review.
   */
  test('the selected checkbox stays legible in dark', async ({ page, signedIn }) => {
    const admin = adminClient()
    test.skip(admin === null, 'needs SUPABASE_SERVICE_ROLE_KEY to seed a brain')

    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('sahoda-theme', 'dark')
      } catch {
        /* best effort */
      }
    })

    const workspaceId = await bootstrapWorkspace(page, admin!, signedIn.clerkUserId)
    await seedResolvedBrain(admin!, workspaceId)

    await page.goto('/brain/resolve')
    await expect(page.getByRole('heading', { name: /written by sahoda/i })).toBeVisible()

    // Confirm the page really is in dark before measuring anything on it —
    // otherwise a theme that failed to apply would make this pass on the light
    // palette, which is the state the bug never existed in.
    await expectDarkGround(page)

    await page.getByRole('checkbox').first().check()

    /**
     * WAIT FOR THE TICK TO SETTLE BEFORE MEASURING IT.
     *
     * The box carries `transition-micro`, and `getComputedStyle` DURING a
     * transition returns the composited intermediate, not the destination.
     * MEASURED 2026-08-22 at integration: at +0ms the pair reads
     * `rgb(152, 152, 152)` on `rgba(255, 255, 255, 0.424)` — a ratio of 2.88,
     * under this test's own 3:1 floor — and from +100ms onward it reads
     * `rgb(11, 11, 12)` on `rgb(255, 255, 255)`, which is 19.67. The colours were
     * never wrong. The test was sampling a fade.
     *
     * It has always been that race; it simply started losing it, so it failed
     * looking exactly like a dark-mode contrast regression.
     *
     * Waiting for the animations to drain, rather than polling until the
     * assertion passes: a poll would ALSO go green on a pair that is illegible
     * for 900ms and correct at the very end, and "the selected checkbox stays
     * legible" is a claim about what a person sees, not about where it lands.
     * This asserts the settled value exactly once.
     */
    await page.waitForFunction(
      () => document.getAnimations().every((a) => a.playState !== 'running'),
      undefined,
      { timeout: 4000 },
    )

    const measured = await page.evaluate(
      ([contrastSrc]) => {
        const box = document.querySelector('[data-field] input[type=checkbox]')
          ?.nextElementSibling as HTMLElement | null
        if (!box) return null
        const cs = getComputedStyle(box)
        const contrast = eval(contrastSrc as string) as (a: string, b: string) => number
        return {
          color: cs.color,
          background: cs.backgroundColor,
          ratio: contrast(cs.color, cs.backgroundColor),
        }
      },
      [CONTRAST],
    )

    expect(measured).not.toBeNull()
    // eslint-disable-next-line no-console
    console.log('[dark tick]', measured!.color, 'on', measured!.background, measured!.ratio)

    // The broken pair measures 1.00:1 — identical colours. The floor here is the
    // WCAG 1.4.11 3:1 for a non-text UI indicator; the repair measures far above
    // it, so a regression to `dark:text-ink` cannot squeak past.
    expect(measured!.color).not.toBe(measured!.background)
    expect(measured!.ratio).toBeGreaterThan(3)
  })
})

/**
 * THE DARK TOKEN PAIR, MEASURED WITHOUT SIGNING IN.
 *
 * The test above proves the console's own checkbox in situ, but it needs a
 * Clerk session, a workspace and a seeded brain — three things that can be
 * unavailable for reasons that have nothing to do with this defect. The defect
 * itself is one line of CSS resolution, and it can be measured on any page that
 * loads the stylesheet.
 *
 * `/design-system` is public (it reads nothing), so this runs with no sign-in
 * and is therefore the arm that keeps working when the environment does not.
 * It measures the EXACT class strings used by `pick-chips.tsx`, `step-rail.tsx`
 * and the console's row selector, under the real cascade, in dark.
 *
 * WHAT IT COVERS: that `dark:text-[var(--canvas)]` resolves to a colour that is
 * legible on `dark:bg-white`, and that the pair which shipped broken does not.
 * WHAT IT DOES NOT COVER: that any particular component still carries the right
 * class — `src/lib/design/dark-ink-on-white.test.ts` owns that, over source.
 */
test.describe('dark ink on a white fill @smoke', () => {
  test('the repaired pair is legible and the shipped pair is not', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('sahoda-theme', 'dark')
      } catch {
        /* best effort */
      }
    })
    await page.goto('/design-system')
    await expect(page.getByRole('heading', { name: 'Design system', level: 1 })).toBeVisible()

    // Prove the page really is in dark before measuring. In light, `--ink` is
    // black and BOTH pairs are legible — so a theme that failed to apply would
    // make this pass on the one state the bug never existed in.
    await expectDarkGround(page)

    const measured = await page.evaluate(
      ([contrastSrc]) => {
        const contrast = eval(contrastSrc as string) as (a: string, b: string) => number
        const read = (className: string) => {
          const el = document.createElement('span')
          el.className = className
          el.textContent = 'x'
          document.body.append(el)
          const cs = getComputedStyle(el)
          const out = {
            color: cs.color,
            background: cs.backgroundColor,
            ratio: contrast(cs.color, cs.backgroundColor),
          }
          el.remove()
          return out
        }
        return {
          repaired: read('bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'),
          shipped: read('bg-ink text-white dark:bg-white dark:text-ink'),
        }
      },
      [CONTRAST],
    )

    /* eslint-disable no-console */
    console.log(
      '[repaired]',
      measured.repaired.color,
      'on',
      measured.repaired.background,
      measured.repaired.ratio.toFixed(2),
    )
    console.log(
      '[shipped ]',
      measured.shipped.color,
      'on',
      measured.shipped.background,
      measured.shipped.ratio.toFixed(2),
    )
    /* eslint-enable no-console */

    // THE REPAIR. Ink on white in dark — the same reading the light theme gets.
    expect(measured.repaired.color).not.toBe(measured.repaired.background)
    expect(measured.repaired.ratio).toBeGreaterThan(4.5)

    /**
     * THE GUARD, SHOWN BITING. `--ink` inverts to white in dark, so the pair
     * that shipped is white on white — 1.00:1, literally invisible. Asserting
     * this rather than only the repair is what proves the measurement can see
     * the defect at all: a `getComputedStyle` that silently returned the same
     * string for everything would pass the assertions above.
     */
    expect(measured.shipped.color).toBe(measured.shipped.background)
    expect(measured.shipped.ratio).toBeCloseTo(1, 2)
  })
})
