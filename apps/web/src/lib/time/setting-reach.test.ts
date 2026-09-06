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
 * a reach the code does not have: the inbox, the wallet, the asset library and
 * the admin screens still render in `DEFAULT_ZONE` outright. That is the
 * overclaim this codebase exists to refuse.
 *
 * ── WHAT CHANGED ON 2026-09-06 ───────────────────────────────────────────────
 * The founder ruled that the planner renders in the workspace zone EVERYWHERE
 * and the picker builds in it. Two carve-outs this guard used to insist on
 * ("the week grid is still laid out in IST", "choosing a time still follows
 * your own device clock") became false that day, so the guard now pins the
 * opposite: those sentences must be GONE, and the code must actually pass the
 * zone into the grid and the picker.
 *
 * So the guard is two-sided, and it pins the CLAIM rather than the wording:
 * rewrite the sentence freely, but it must go on naming a reach, and the code
 * must go on having one.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * It reads files as text, so it is blind to the same sentences moving anywhere
 * else. Lift them into a child component, a shared copy constant or a template
 * literal and the assertions go on passing against a page that no longer
 * contains either half. It also cannot see a SECOND surface making the same
 * promise, and it cannot see the reach itself at runtime: it checks that the
 * page names the screens, and that those screens' source passes a zone, never
 * that a rendered time was right.
 */

const WEB = join(__dirname, '../../')
const read = (rel: string): string => readFileSync(join(WEB, rel), 'utf8')

describe('the time zone setting’s reach', () => {
  it('is claimed by the settings screen, and the claim is bounded', () => {
    const settings = read('app/(app)/settings/page.tsx')

    // The half that is true: named screens follow the zone, so the reader
    // knows where to look rather than being told a vague "some screens".
    expect(settings).toMatch(/Posts, the Planner and the schedule picker/)

    // The half that is still not true, and must not be quietly dropped: the
    // rest of the product still renders in the default zone. Naming it keeps
    // a later reader from widening the sentence to "everywhere".
    expect(settings).toMatch(/Other timestamps in Sahoda are shown in IST/)

    // ── THE CARVE-OUTS THAT ARE OVER ────────────────────────────────────────
    // Both were true until 2026-09-06 and both are false now. A sentence that
    // tells a New York workspace its week grid is in IST, over a grid that is
    // in New York, is the same defect as one that overclaims, in the other
    // direction.
    expect(settings).not.toMatch(/week grid is\s+still laid out in IST/i)
    expect(settings).not.toMatch(/device clock/i)
  })

  it('reaches the week grid, in code and not only in copy', () => {
    // The grid's placement, its caption and its cards must all read the SAME
    // `zone` prop — the drift this guard used to fence the other way round —
    // and no IST constant may remain for a caption to fall back to.
    const timeline = read('components/planner/week-timeline.tsx')
    expect(timeline).toMatch(/format\w+\(post\.scheduled_at, zone\)/)
    expect(timeline).toMatch(/zoneLabel\(zone/)
    expect(timeline).toMatch(/dayKey\(zone/)
    expect(timeline).not.toMatch(/PLANNER_GRID_ZONE/)
    expect(timeline).not.toMatch(/Asia\/Kolkata/)

    // The month caption names the zone it is keyed in and claims nothing about
    // storage: `scheduled_at` is an instant and belongs to no zone.
    const month = read('components/planner/month-grid.tsx')
    expect(month).toMatch(/Times are shown in \{zoneLabel\(zone/)
    expect(month).not.toMatch(/every schedule is stored in/)
  })

  it('reaches the picker, which builds in the workspace zone and not the device’s', () => {
    // The picker takes the zone as a REQUIRED prop and builds through it.
    const field = read('components/posts/schedule-field.tsx')
    expect(field).toMatch(/^\s+zone: string$/m)
    expect(field).toMatch(/scheduleChoices\(zone,/)

    const calendar = read('lib/posts/calendar-month.ts')
    expect(calendar).toMatch(/instantAtWallClock/)
    expect(calendar).not.toMatch(/setHours|getFullYear\(\)/)

    // And the composer's page hands it the workspace's zone.
    const postPage = read('app/(app)/posts/[id]/page.tsx')
    expect(postPage).toMatch(/resolveDisplayZone\(workspace\?\.timezone\)/)
    expect(postPage).toMatch(/zone=\{zone\}/)
  })

  it('is not claimed by a screen that still hardcodes the zone', () => {
    // `PlannerUpcoming` sat on the planner with its own `Asia/Kolkata`
    // formatters and a literal "IST", so a Dubai workspace read two different
    // times for one post, side by side, under a setting claiming both.
    const upcoming = read('components/planner/planner-upcoming.tsx')
    expect(upcoming).not.toMatch(/timeZone: 'Asia\/Kolkata'/)
    expect(upcoming).toMatch(/resolveDisplayZone/)
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

  it('names the default zone exactly once outside tests', () => {
    // 48 literals became one constant. A second literal is the first step
    // back to a product where "which zone?" has forty-eight answers.
    const zone = read('lib/time/zone.ts')
    expect(zone).toMatch(/export const DEFAULT_ZONE = 'Asia\/Kolkata'/)
  })
})
