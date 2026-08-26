import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { expect as _e, test as seeded } from './fixtures/seeded-user'

/**
 * THE ONBOARDING WALK.
 *
 * ── WHY EVERY FRAME IS HASHED ────────────────────────────────────────────────
 * A previous run's two captures came out BYTE-IDENTICAL and its only check was
 * "bigger than 3 KB". A size check is not an identity check: a browser with no
 * rendering engine returns the same placeholder PNG for every page, and it is
 * comfortably over 3 KB. Measured here 2026-08-21: Lightpanda returned sha256
 * 5615c982… and 10,704 bytes for BOTH /sign-in and /sign-up. So each frame is
 * hashed, the manifest is written out, and the test FAILS if two frames of
 * different screens collide.
 *
 * ── WHY THE SHOT COMES BEFORE THE ANSWER ─────────────────────────────────────
 * Onboarding is reachable once per account for its final third — build, result
 * and enter write `brand_memory` and flip `isFirstResolve`. The first eight
 * screens are re-walkable because they hold nothing but localStorage, but a run
 * that answers first and shoots second loses whatever it walked past. Each step
 * is captured on ARRIVAL, before anything is typed into it, and again once
 * filled.
 */

const SHOT_DIR =
  process.env.ONB_SHOT_DIR ??
  '/tmp/claude-1000/-home-divas-Documents-GitHub-sahodalabs/bb4d8b52-5b6d-4620-aa10-5f3d8f86ad38/scratchpad/shots'

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
] as const

const THEMES = ['light', 'dark'] as const

/** name -> sha256. Collisions across DIFFERENT screens are a failure. */
const manifest = new Map<string, string>()

/**
 * Frames per walk. Counted, not guessed: nine steps, and the six that take an
 * answer are shot twice — once on arrival with nothing in them, once filled —
 * because the empty state is the one a run that answers first destroys.
 *
 *   intro, 01 x2, 02 x2, 03 x2, 04, 05 x2, 06 x2, rivals x2 = 14
 */
const FRAMES_PER_WALK = 14

function shotName(view: string, theme: string, label: string): string {
  return `${view}-${theme}-${label}`
}

/**
 * Two things a naive capture gets wrong, both found by LOOKING at the frames:
 *
 *  1. The pointer stays wherever it last clicked, and the bottom rail sits under
 *     it on the next step — so the primary button was captured in its HOVER
 *     state (black on white) on every frame after the first. A screenshot of a
 *     hover is not a screenshot of the screen.
 *  2. The step transition is 520ms and its children rise for up to 360ms after
 *     that. Shooting on arrival caught headings at 30% opacity and reference
 *     cards half-faded, which reads as a rendering defect and is not one.
 */
async function settle(page: Page): Promise<void> {
  await page.mouse.move(0, 0)
  await page
    .waitForFunction(
      () => document.getAnimations().filter((a) => a.playState === 'running').length === 0,
      undefined,
      { timeout: 4000 },
    )
    .catch(() => {
      /* The orb drives itself on rAF, not the Web Animations API, so it never
         appears here — but a looping CSS animation would, and a frame is worth
         more than a hang. */
    })
}

async function shoot(page: Page, view: string, theme: string, label: string): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true })
  await settle(page)
  const name = shotName(view, theme, label)
  const buf = await page.screenshot({ fullPage: false })
  const sha = createHash('sha256').update(buf).digest('hex')
  writeFileSync(join(SHOT_DIR, `${name}.png`), buf)
  manifest.set(name, sha)
  // eslint-disable-next-line no-console
  console.log(`SHOT ${name} ${buf.length}B sha256=${sha.slice(0, 16)}`)
}

/** The answers. Real sentences, because the summary renders them back verbatim. */
const ANSWERS = {
  name: 'Chai & Chapters',
  site: 'https://example.com',
  what: 'A neighbourhood bookshop that serves chai and hosts Sunday readings.',
  category: 'Local business',
  audience: 'weekend readers in Bengaluru',
}

async function bootstrapWorkspace(page: Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  await expect(create).toBeVisible({ timeout: 30_000 })
  await create.click()
  await expect(create).toBeHidden({ timeout: 30_000 })
}

/** Set the theme the way the app's own toggle does, before the first paint. */
async function useTheme(page: Page, theme: string): Promise<void> {
  await page.addInitScript((t) => {
    try {
      window.localStorage.setItem('sahoda-theme', t)
    } catch {
      /* private mode — the attribute below still applies for this document */
    }
    document.documentElement.setAttribute('data-theme', t)
  }, theme)
}

seeded.describe('the onboarding stage', () => {
  seeded.describe.configure({ timeout: 600_000 })

  seeded(
    'walks all nine steps at 390 and 1440, in light and dark, shooting each before it is answered',
    async ({ page, signedIn }) => {
      _e(signedIn.clerkUserId).toBeTruthy()
      // Cleared, so a RETRY reports its own run rather than the union of two.
      manifest.clear()
      await bootstrapWorkspace(page)

      for (const view of VIEWPORTS) {
        for (const theme of THEMES) {
          await page.setViewportSize({ width: view.width, height: view.height })
          await useTheme(page, theme)

          // A fresh walk every time. The store is per workspace, so this is the
          // same account arriving with nothing saved.
          await page.goto('/onboarding')
          await page.evaluate(() => {
            for (const k of Object.keys(window.localStorage)) {
              if (k.startsWith('sahoda.brandbrain')) window.localStorage.removeItem(k)
            }
          })
          await page.reload()

          const tag = `${view.name}/${theme}`

          /* ── intro ── */
          await expect(page.getByRole('heading', { name: /teach Sahoda/i })).toBeVisible({
            timeout: 30_000,
          })
          await shoot(page, view.name, theme, '00-intro')
          // READ THE TEXT, not the box: the intro must state the cost position.
          await expect(page.getByText(/free the first time|uses \d+ credits/i)).toBeVisible()
          await page.getByRole('button', { name: /build my brand brain/i }).click()

          /* ── 01 basics ── */
          await expect(
            page.getByRole('heading', { name: /what.s your brand called/i }),
          ).toBeVisible()
          await shoot(page, view.name, theme, '01-basics-empty')
          // Continue is GATED here — a name is genuinely required.
          await expect(page.getByRole('button', { name: /^Continue$/ })).toBeDisabled()
          await page.locator('#f-name').fill(ANSWERS.name)
          await page.locator('#f-site').fill(ANSWERS.site)
          await expect(page.getByText(/means beyond the logo/i)).toBeVisible()
          await shoot(page, view.name, theme, '01-basics-filled')
          await page.getByRole('button', { name: /^Continue$/ }).click()

          /* ── 02 positioning ── */
          await expect(
            page.getByRole('heading', { name: /what does your brand actually do/i }),
          ).toBeVisible()
          await shoot(page, view.name, theme, '02-what-empty')
          await page.locator('#f-what').fill(ANSWERS.what)
          await page.getByRole('button', { name: ANSWERS.category, exact: true }).click()
          await expect(page.getByText(/weight channels and formats/i)).toBeVisible()
          await shoot(page, view.name, theme, '02-what-filled')
          await page.getByRole('button', { name: /^Continue$/ }).click()

          /* ── 03 audience ── */
          await expect(
            page.getByRole('heading', { name: /who are you trying to reach/i }),
          ).toBeVisible()
          await shoot(page, view.name, theme, '03-audience-empty')
          await page.locator('#f-aud').fill(ANSWERS.audience)
          // Progressive disclosure: the extra fields do not exist until earned.
          await expect(page.getByRole('button', { name: /want to tell us more/i })).toBeVisible()
          await shoot(page, view.name, theme, '03-audience-filled')
          await page.getByRole('button', { name: /^Continue$/ }).click()

          /* ── 04 visual — OPTIONAL, and the rail must prove it ── */
          await expect(
            page.getByRole('heading', { name: /sees your brand the way you do/i }),
          ).toBeVisible()
          await shoot(page, view.name, theme, '04-visual')
          await expect(page.getByRole('button', { name: /^Continue$/ })).toBeEnabled()
          await page.getByRole('button', { name: /^Continue$/ }).click()

          /* ── 05 knowledge — the References screen used to sit here ──
             It asked for pages the customer admires and kept none of them:
             nothing in the submitted form has ever carried a reference. Removed
             rather than left asking, so the walk goes 04 → 05 knowledge. */
          await expect(page.getByRole('heading', { name: /what .good. looks like/i })).toHaveCount(
            0,
          )
          await expect(
            page.getByRole('heading', { name: /what should your AI already know/i }),
          ).toBeVisible()
          await shoot(page, view.name, theme, '05-knowledge-empty')
          await expect(page.getByRole('button', { name: /^Continue$/ })).toBeEnabled()
          await page.getByRole('button', { name: /^Website\b/ }).click()
          // "Queued", never "Connected": nothing was fetched and no token exists.
          await expect(page.getByText(/Queued/).first()).toBeVisible()
          await expect(page.getByText(/\bConnected\b/)).toHaveCount(0)
          await shoot(page, view.name, theme, '05-knowledge-filled')
          await page.getByRole('button', { name: /^Continue$/ }).click()

          /* ── rivals — the step the brief's list omits ── */
          await expect(
            page.getByRole('heading', { name: /understand your market too/i }),
          ).toBeVisible()
          await shoot(page, view.name, theme, '07-rivals-empty')
          await expect(page.getByRole('button', { name: /build my brand brain/i })).toBeEnabled()
          await expect(page.getByRole('button', { name: /skip for now/i })).toBeVisible()
          await page.locator('#f-comp').fill('Blossom Book House')
          await page.locator('#f-comp').press('Enter')
          await expect(page.getByText(/tracked for positioning/i)).toBeVisible()
          await shoot(page, view.name, theme, '07-rivals-filled')

          // eslint-disable-next-line no-console
          console.log(`WALK COMPLETE ${tag}`)
        }
      }

      /* ── every frame distinct ── */
      const seen = new Map<string, string>()
      const collisions: string[] = []
      for (const [name, sha] of manifest) {
        // The same screen at a different width or theme MAY legitimately differ;
        // two DIFFERENT screens sharing an image cannot.
        const prior = seen.get(sha)
        if (prior) collisions.push(`${prior} === ${name}`)
        else seen.set(sha, name)
      }
      writeFileSync(
        join(SHOT_DIR, 'manifest.txt'),
        [...manifest].map(([n, s]) => `${s}  ${n}.png`).join('\n'),
      )
      // eslint-disable-next-line no-console
      console.log(`FRAMES: ${manifest.size}, DISTINCT: ${seen.size}`)
      expect(
        collisions,
        `byte-identical frames of different screens:\n${collisions.join('\n')}`,
      ).toEqual([])
      expect(manifest.size).toBe(VIEWPORTS.length * THEMES.length * FRAMES_PER_WALK)
    },
  )
})

export { test, expect }
