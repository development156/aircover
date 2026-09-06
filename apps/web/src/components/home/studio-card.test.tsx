import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { StudioCard } from './studio-card'
import { RAIL_GROUPS, ALL_SECTIONS } from '@/lib/nav/sections'

/**
 * STUDIO IS BUILT, IT CHARGES, AND UNTIL NOW THE SIDEBAR DID NOT LIST IT.
 *
 * `lib/nav/sections.ts` carried `state: 'soon'` on Studio and `RAIL_GROUPS`
 * filters the rail to `live`, so a feature with a working server action and its
 * own charge test was reachable only from the command palette and the phone's
 * More sheet. `e2e/roadmap-honesty.spec.ts` had already caught it from the
 * other end and recorded the date it was built.
 *
 * ── WHAT THIS CANNOT SEE ─────────────────────────────────────────────────────
 * Whether Studio WORKS. These pin that the product says one thing about it in
 * both places, and that the card describes the screen it opens.
 */
describe('the Studio entry', () => {
  it('opens the Studio page', () => {
    const { container } = render(<StudioCard />)
    const form = container.querySelector('form')
    expect(form?.getAttribute('action')).toBe('/studio')
    // A GET form, so the result is a shareable URL and the route reads the
    // description off the query string. `method` unset IS get.
    expect(form?.getAttribute('method')).toBeNull()
  })

  it('carries what was typed, so the box is not a decoration', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: the field losing its `name`, or the form
     * losing its action — either turns a box you can type into on the busiest
     * screen in the product into one that throws the words away on submit. The
     * founder's standing instruction is "no fake UI or dead interactions", and
     * that is what this pins.
     *
     * `describe` is the parameter `app/(app)/studio/page.tsx` reads into the
     * workbench's opening value.
     */
    render(<StudioCard />)
    const field = screen.getByLabelText(/describe a picture/i)
    expect(field.getAttribute('name')).toBe('describe')
  })

  it('describes what Studio does, not a chat it does not have', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: the brief's own copy — "Chat with Sahoda.
     * Plan, create and get things done." Studio's page subtitle is "Describe a
     * picture and Sahoda draws it", its action is `queueGeneration` and its
     * reads are `readGenerations` and `readLibraryPictures`. It is an image
     * generator. A card promising a conversation that opens a drawing tool is
     * the same defect as a remedy that cannot work.
     */
    const { container } = render(<StudioCard />)
    const field = screen.getByLabelText(/describe a picture/i) as HTMLInputElement
    expect(field.placeholder).toMatch(/draws it/i)
    expect((container.textContent ?? '') + field.placeholder).not.toMatch(/chat/i)
  })

  it('spends no brand fill, so the header keeps the screen`s one primary', () => {
    // docs/37 §16: one solid brand fill per view, and Create post beside this
    // already spends it. A wash and a firmer edge carry the weight instead.
    const { container } = render(<StudioCard />)
    expect(container.querySelector('.bg-brand')).toBeNull()
    expect(container.querySelector('.bg-brand-wash')).not.toBeNull()
  })
})

describe('the sidebar and the home card agree about Studio', () => {
  it('lists Studio in the rail, because it is built', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: `state` put back to `'soon'`. A prominent
     * home card pointing at a screen the sidebar calls "Soon" is the product
     * contradicting itself inside one viewport — and `RAIL_GROUPS` would drop
     * Studio out of the sidebar entirely while the card still promoted it.
     */
    const inRail = RAIL_GROUPS.flatMap((g) => g.items).some((i) => i.href === '/studio')
    expect(inRail).toBe(true)
  })

  it('does not mark Studio as coming soon anywhere', () => {
    const studio = ALL_SECTIONS.find((s) => s.href === '/studio')
    expect(studio).toBeDefined()
    expect(studio!.state).toBe('live')
  })
})
