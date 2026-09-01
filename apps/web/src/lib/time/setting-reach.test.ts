import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * WHAT THE TIME ZONE SETTING REACHES, HELD TO WHAT THE SETTINGS SCREEN CLAIMS.
 *
 * ── THE TWO WAYS THIS GOES WRONG, AND THEY ARE OPPOSITE ──────────────────────
 * For as long as nothing read `workspaces.timezone`, the settings row said so,
 * and that was right. The row became WRONG the moment Posts and the Planner
 * started reading it — a setting that quietly does something, still described as
 * doing nothing, teaches a customer to ignore a control that works.
 *
 * The other direction is the one that costs more. If somebody deletes the
 * disclosure entirely, or widens it to "every time in Sahoda", the row promises
 * a reach the code does not have: the picker still builds on the reader's own
 * device clock, and 25 files still name IST outright. That is the overclaim this
 * codebase exists to refuse.
 *
 * So the guard is two-sided, and it pins the CLAIM rather than the wording:
 * rewrite the sentence freely, but it must go on naming a reach, and the code
 * must go on having one.
 */

const WEB = join(__dirname, '../../')
const read = (rel: string): string => readFileSync(join(WEB, rel), 'utf8')

describe('the time zone setting’s reach', () => {
  it('is claimed by the settings screen, in both halves', () => {
    const settings = read('app/(app)/settings/page.tsx')

    // The half that is now true: some screen follows the zone. Named, so the
    // reader knows where to look rather than being told a vague "some screens".
    expect(settings).toMatch(/Posts and Planner/)

    // The half that is still not true, and must not be quietly dropped: the
    // picker follows the device, so a customer whose device disagrees with this
    // setting needs to know before they schedule something.
    expect(settings).toMatch(/device clock/i)

    // ── THE CARVE-OUT, WHICH THIS GUARD USED TO MISS ────────────────────────
    // "Posts and Planner" on its own read as the whole Planner, and the week
    // grid is not in it: `week-window.ts` places every card by
    // PLANNER_GRID_ZONE, so a card's column and row are IST facts whatever the
    // workspace set. This assertion is what stops "the Planner" quietly meaning
    // "all of the Planner" again.
    expect(settings).toMatch(/week grid is\s+still laid out in IST/i)
  })

  it('is not claimed by a screen that still hardcodes the zone', () => {
    // The claim is only as good as the wiring, in the other direction too.
    // `PlannerUpcoming` sat on the same screen with its own `Asia/Kolkata`
    // formatters and a literal "IST", so a Dubai workspace read two different
    // times for one post, side by side, under a setting claiming both.
    const upcoming = read('components/planner/planner-upcoming.tsx')
    expect(upcoming).not.toMatch(/timeZone: 'Asia\/Kolkata'/)
    expect(upcoming).toMatch(/resolveDisplayZone/)

    // And the week grid's caption must read in the zone it is DRAWN in, or the
    // card contradicts itself.
    const timeline = read('components/planner/week-timeline.tsx')
    expect(timeline).toMatch(/formatScheduledTime\(post\.scheduled_at, PLANNER_GRID_ZONE\)/)
  })

  it('is not described as doing nothing, now that it does something', () => {
    const settings = read('app/(app)/settings/page.tsx')
    expect(settings).not.toMatch(/does\s+not\s+change\s+them\s+yet/i)
    expect(settings).not.toMatch(/nothing in the product reads this/i)
  })

  it('is actually read by the code the claim names', () => {
    // The claim is only as good as the wiring. Both screens must pass a zone
    // into the formatter, or the sentence above is the overclaim rather than the
    // improvement.
    for (const page of ['app/(app)/posts/page.tsx', 'app/(app)/planner/page.tsx']) {
      expect(read(page)).toMatch(/zone=\{zone\}/)
      expect(read(page)).toMatch(/workspace\?\.timezone/)
    }
  })

  it('leaves the formatter able to render a workspace that set no zone', () => {
    // MEASURED 2026-08-26: 32 of 33 workspaces have no timezone. If the zone
    // argument were ever made required, those screens would stop rendering, and
    // the fallback is the whole reason this change moves nobody's times.
    const formatter = read('lib/posts/schedule-format.ts')
    expect(formatter).toMatch(/zone\?:\s*string \| null/)
  })
})
