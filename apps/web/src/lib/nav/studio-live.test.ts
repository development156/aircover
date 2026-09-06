import { describe, expect, it } from 'vitest'

import { ALL_SECTIONS, RAIL_GROUPS } from './sections'

/**
 * STUDIO IS BUILT, SO THE SIDEBAR LISTS IT.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY ─────────────────────────────────────────
 * These two assertions used to live beside the Home Studio card, which the
 * founder removed on 2026-09-07. The card going does not make the nav fix
 * wrong — Studio has a working server action (`queueGeneration`) and its own
 * charge test, and `e2e/roadmap-honesty.spec.ts` recorded it as built on
 * 2026-08-28 while `sections.ts` still carried `state: 'soon'`.
 *
 * `RAIL_GROUPS` filters the rail to `live`, so that stale flag kept a finished,
 * charging feature out of the sidebar entirely: reachable only from the command
 * palette and the phone's More sheet. Deleting the card's test file would have
 * quietly deleted the only thing watching that, which is how a fix gets undone
 * six weeks later by somebody tidying flags.
 */
describe('the sidebar agrees with what Studio actually is', () => {
  it('lists Studio in the rail', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: `state` put back to `'soon'`. Nothing else
     * in the product would go red — the page keeps working, the palette keeps
     * finding it — and Studio would simply stop appearing in the sidebar again.
     */
    const inRail = RAIL_GROUPS.flatMap((group) => group.items).some(
      (item) => item.href === '/studio',
    )
    expect(inRail).toBe(true)
  })

  it('does not mark Studio as coming soon anywhere', () => {
    const studio = ALL_SECTIONS.find((section) => section.href === '/studio')
    expect(studio).toBeDefined()
    expect(studio!.state).toBe('live')
  })
})
