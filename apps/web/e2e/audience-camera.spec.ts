import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'

import { adminClient, expect, test } from './fixtures/seeded-user'

/**
 * The camera for `/brain/audience`, and for the three states it can be put into.
 *
 * NOT a test — it asserts nothing except that no two frames came out identical.
 * The design-audit camera shoots every route once; this one shoots ONE route in
 * every state it has, which is the thing worth looking at here: the screen's most
 * common state is imposed by a platform and cannot be reached by clicking.
 *
 * ── HOW THE STATES ARE REACHED ───────────────────────────────────────────────
 * `not-connected`  is the fixture's own state — a fresh workspace with nothing
 *                  linked, which is every beta user's first visit.
 * `reconnect`      by writing an INACTIVE connection row. Nothing else changes.
 * `suppressed` and `ready` cannot be staged from here at all: they need Instagram
 *                  to answer about a real account, and this fixture's workspace
 *                  has none. Both are shot from `/design-system`, whose
 *                  "Measured, and worked out" section renders the same components
 *                  — see `audience-layers.spec.ts`, which also measures them.
 *
 * ── EVERY FRAME IS HASHED ────────────────────────────────────────────────────
 * A size check is not an identity check. Two frames that came out byte-identical
 * would pass any "bigger than N kilobytes" gate while proving nothing, which has
 * happened on this project before.
 *
 * Run: AUDIENCE_CAMERA=1 pnpm exec playwright test audience-camera
 */

const OUT = process.env.AUDIENCE_CAMERA_OUT ?? 'design-audit/audience-states'

const VIEWPORTS = [
  { w: 1440, h: 900, name: '1440' },
  // The band a two-width audit misses. A peer's 1440+390 pass missed two defects
  // that only appear between 768 and 1279.
  { w: 900, h: 1000, name: '900' },
  { w: 390, h: 844, name: '390' },
] as const

const THEMES = ['light', 'dark'] as const

test.describe('audience camera', () => {
  test.skip(process.env.AUDIENCE_CAMERA !== '1', 'set AUDIENCE_CAMERA=1 to shoot')
  test.setTimeout(10 * 60_000)

  test('shoot /brain/audience in every state it can be put into', async ({
    page,
    signedIn,
    browser,
  }) => {
    // Bootstrap a real workspace through the app's own RPC path.
    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 60_000 })

    const admin = adminClient()
    if (!admin) throw new Error('the audience camera needs SUPABASE_SERVICE_ROLE_KEY')
    const { data: ws } = await admin
      .from('workspaces')
      .select('id')
      .eq('created_by', signedIn.clerkUserId)
      .limit(1)
    const workspaceId = ws?.[0]?.id as string | undefined
    if (!workspaceId) throw new Error('workspace bootstrap did not produce a row')

    const seen = new Map<string, string>()
    const state = await page.context().storageState()

    async function shoot(label: string): Promise<void> {
      for (const theme of THEMES) {
        const context = await browser.newContext()
        await context.addCookies(state.cookies)
        const shot = await context.newPage()
        await shot.addInitScript((t) => {
          try {
            window.localStorage.setItem('sahoda-theme', t as string)
          } catch {
            /* storage blocked — best effort */
          }
        }, theme)

        for (const vp of VIEWPORTS) {
          await shot.setViewportSize({ width: vp.w, height: vp.h })
          const dir = `${OUT}/${theme}-${vp.name}`
          mkdirSync(dir, { recursive: true })
          const file = `${dir}/${label}.png`
          await shot.goto('/brain/audience', { waitUntil: 'domcontentloaded', timeout: 45_000 })
          await shot.waitForTimeout(1500)
          await shot.screenshot({ path: file, fullPage: true })

          const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16)
          const prior = seen.get(hash)
          // eslint-disable-next-line no-console
          console.log(
            `[camera] ${label.padEnd(14)} ${theme.padEnd(5)} ${vp.name.padEnd(5)} sha256:${hash}` +
              (prior ? `  ** IDENTICAL TO ${prior} **` : ''),
          )
          // `expect`, not `throw`. The check was always real — it just was not
          // legible to `scripts/lint.mjs`, whose assertionless-test rule reads a
          // file for `expect(` and reported this one as "runs, reports green, and
          // checks nothing". It was not; it was checking with the wrong verb. The
          // fix is to say it in the language the tool reads, never to excuse the
          // file — an exception here would have retired the one guard that stops
          // a placeholder PNG being filed as evidence.
          expect(
            prior,
            `${label}/${theme}/${vp.name} is byte-identical to ${prior} — ` +
              'a size check is not an identity check, and two identical frames ' +
              'prove nothing about the state each claims to show.',
          ).toBeUndefined()
          seen.set(hash, `${label}/${theme}/${vp.name}`)
        }
        await context.close()
      }
    }

    // ── 1 · no account connected. The fixture's own state, unmodified.
    await shoot('not-connected')

    // ── 2 · a connection that has lapsed. One row, and the screen must stop
    //        saying "connect" — advice that is useless to someone who already did.
    const { error } = await admin.from('connections').insert({
      workspace_id: workspaceId,
      platform: 'instagram',
      status: 'expired',
      external_account: { id: 'a'.repeat(24), profileId: 'b'.repeat(24) },
      created_by: signedIn.clerkUserId,
    })
    if (error) throw new Error(`staging the lapsed connection failed: ${error.message}`)
    await shoot('reconnect')

    // eslint-disable-next-line no-console
    console.log(`[camera] ${seen.size} distinct frames, none repeated`)
  })
})
