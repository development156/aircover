import { describe, expect, it } from 'vitest'

import { ZERNIO_PLATFORM_NAME } from '../adapters/zernio'
import { recoveryPlatform } from './recovery'

/**
 * WHY INSTAGRAM AND LINKEDIN WORKED WHILE X AND GOOGLE BUSINESS DID NOT.
 *
 * ── THE FOUNDER'S QUESTION, AND IT HAS ONE ANSWER ────────────────────────────
 * Asked on 2026-08-27, after nine rounds of connect defects: "check instagram and
 * linkedin why are they perfectly working?"
 *
 * Because **their name is the same string in every Zernio vocabulary, and there
 * are FOUR.** Every bug in this integration that was about a platform NAME was
 * invisible on those two and live on the other two, so the two channels anybody
 * tested by hand were exactly the two that could not reveal it. Three separate
 * defects shipped that way:
 *
 *   · `connectUrl` was given `x`, and `GET /v1/connect/x` answers 400. Both
 *     buttons said "Couldn't start the connection" on every press.
 *   · `reconcileAccounts` filtered `account.platform === 'x'` against a stored
 *     value of `twitter`. A real, completed X connect wrote no row and the screen
 *     truthfully said "Not connected".
 *   · `health.ts` read X's two-hour rotating token as a sixty-day deadline and
 *     told a customer their working account had run out.
 *
 * ── AND THE FOUR VOCABULARIES ARE REAL, NOT AN ACCIDENT TO BE TIDIED ─────────
 * The most tempting change in this package is to collapse these maps into one.
 * It would break publishing or recovery, and which one it broke would depend on
 * which map won. This test exists to make that a red suite instead of an outage.
 *
 * Every value below is MEASURED against the live API, and the publish row is the
 * surprising one: `POST /v1/posts` genuinely takes `x` and `google`, marked
 * [LIVE] in `recovery.ts` because real posts have gone out through those exact
 * strings. `googlebusiness` on that endpoint is NOT a safer synonym for `google`,
 * and `twitter` is not a safer synonym for `x`.
 */
describe('Zernio speaks four vocabularies, and only two channels are spelled the same in all of them', () => {
  it('spells X differently on publish than everywhere else', () => {
    // The publish endpoint is the odd one out, and it is the one nobody expects.
    expect(ZERNIO_PLATFORM_NAME.x).toBe('x')
    // Recovery refuses that spelling by name.
    expect(recoveryPlatform('x', 'edit')).toBe('twitter')
    expect(recoveryPlatform('x', 'unpublish')).toBe('twitter')
  })

  it('spells Google Business three different ways across two endpoints', () => {
    expect(ZERNIO_PLATFORM_NAME.gbp).toBe('google')
    expect(recoveryPlatform('gbp', 'edit')).toBe('googlebusiness')
    expect(recoveryPlatform('gbp', 'unpublish')).toBe('googlebusiness')
  })

  it('spells Instagram and LinkedIn the SAME in every one of them', () => {
    // THIS is the answer to the question. Nothing about these two is more
    // finished or better built; the four maps simply cannot disagree about them,
    // so a bug in any one map is invisible on the two channels most people test.
    expect(ZERNIO_PLATFORM_NAME.linkedin).toBe('linkedin')
    expect(recoveryPlatform('linkedin', 'edit')).toBe('linkedin')
    expect(recoveryPlatform('linkedin', 'unpublish')).toBe('linkedin')

    expect(ZERNIO_PLATFORM_NAME.instagram).toBe('instagram')
    // Instagram is absent from BOTH recovery enums — a real gap in Zernio, not a
    // spelling difference, and stated rather than papered over.
    expect(recoveryPlatform('instagram', 'edit')).toBeNull()
    expect(recoveryPlatform('instagram', 'unpublish')).toBeNull()
  })

  it('refuses to let the publish map and the recovery map agree about X or GBP', () => {
    // The mutation this whole file exists to catch: somebody unifies the maps.
    // Written as a DISAGREEMENT assertion rather than as two equality checks,
    // because a tidy-up would satisfy equality checks by rewriting them both.
    for (const channel of ['x', 'gbp'] as const) {
      expect(recoveryPlatform(channel, 'edit')).not.toBe(ZERNIO_PLATFORM_NAME[channel])
      expect(recoveryPlatform(channel, 'unpublish')).not.toBe(ZERNIO_PLATFORM_NAME[channel])
    }
  })
})
