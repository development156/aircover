import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { PageTitle } from './page-title'

/**
 * THIRTY-TWO SCREENS RENDER THIS AND EXACTLY ONE PASSES A CRUMB.
 *
 * The trail was added for /connections. The risk it introduced is not on that
 * screen: it is on the other thirty-one, where a landmark, a heading change or a
 * layout class would be a silent regression nobody is looking at. So the
 * assertions here are mostly about the case that did NOT change.
 *
 * ── THE LANDMARK ASSERTION IS WIDER THAN IT FIRST WAS ────────────────────────
 * The first version of this file asserted the trail lived in a
 * `<nav aria-label="Location">` and that the plain title did not. A review made
 * the point the component itself already argued in the other direction: NEITHER
 * segment of this trail is a link, so a landmark there announces a navigation
 * region holding nothing to navigate. The assertion was retargeted rather than
 * deleted, and it now holds on BOTH paths — which is a stronger claim, not a
 * weaker one. The day the title becomes an anchor, this is the test that has to
 * be changed deliberately.
 */
describe('PageTitle', () => {
  it('is a bare heading when there is no trail', () => {
    render(<PageTitle sub="A sentence.">Wallet</PageTitle>)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wallet')
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('states the view after the title, and says which segment you are on', () => {
    render(
      <PageTitle crumb="Integrate" sub="A sentence.">
        Connections
      </PageTitle>,
    )

    expect(screen.getByText('Integrate')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Connections')
  })

  it('announces no navigation region, because nothing in the trail navigates', () => {
    render(<PageTitle crumb="Integrate">Connections</PageTitle>)

    // A crumb is only a control if it goes somewhere. Neither segment does, so
    // neither is an anchor and there is no landmark over them. Both halves of
    // that are asserted, because a landmark with no links is the failure and an
    // anchor with no route is the other one.
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('keeps the title as the heading even when a trail follows it', () => {
    render(<PageTitle crumb="Integrate">Connections</PageTitle>)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Connections')
    // NOT the crumb. Anyone navigating this app by heading gets the screen's
    // name, not the view inside it.
    expect(heading).not.toHaveTextContent('Integrate')
  })

  it('adds no layout class to the thirty-one screens that pass no crumb', () => {
    // `min-w-0` lets a flex child shrink below its content width. The trail needs
    // it; a bare title never did, and applying it to every call site would be a
    // layout change thirty-one screens did not ask for and no test on them would
    // catch. This is that guard, and it is the reason the class is conditional.
    const { container: plain } = render(<PageTitle>Wallet</PageTitle>)
    expect(plain.firstElementChild!.className).not.toContain('min-w-0')

    const { container: trailed } = render(<PageTitle crumb="Integrate">Connections</PageTitle>)
    expect(trailed.firstElementChild!.className).toContain('min-w-0')
  })
})

/**
 * ── THE ACTIONS SLOT ─────────────────────────────────────────────────────────
 * Three screens built the title-plus-action row by hand before this prop
 * existed, and they had already drifted apart: /campaigns aligned it with
 * `items-start`, /posts with `items-center`, and /assets nested the title inside
 * a second wrapper so its description was a sibling of the heading rather than
 * the component's own `sub`. The prop exists so the row is one decision.
 *
 * The assertions below are mostly about the case that did NOT change, for the
 * same reason the `min-w-0` guard above is: thirty-two of the thirty-five call
 * sites pass no action, and a wrapper added unconditionally would be a layout
 * change on every one of them that no test on those screens would see.
 */
describe('PageTitle actions', () => {
  it('puts the action on the title row', () => {
    render(
      <PageTitle sub="A sentence." actions={<button type="button">Create post</button>}>
        Posts
      </PageTitle>,
    )

    expect(screen.getByRole('button', { name: 'Create post' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Posts')
  })

  it('adds no wrapper to the thirty-two call sites that pass no action', () => {
    // The heading block must still be the OUTERMOST element when there is no
    // action, byte-for-byte with what those screens rendered before this prop.
    const { container: plain } = render(<PageTitle sub="A sentence.">Wallet</PageTitle>)
    expect(plain.firstElementChild!.className).not.toContain('justify-between')
    expect(plain.firstElementChild!.querySelector('h1')).not.toBeNull()

    const { container: acted } = render(
      <PageTitle actions={<button type="button">Go</button>}>Wallet</PageTitle>,
    )
    expect(acted.firstElementChild!.className).toContain('justify-between')
  })

  it('renders no action row when the screen passes null', () => {
    // Every one of the three call sites passes a CONDITIONAL: the empty state
    // owns the create affordance when there is nothing to list, so the slot is
    // handed `null` on exactly the screens where a second primary would be the
    // bug. `null` must behave as "no action", not as "an empty action row".
    const { container } = render(<PageTitle actions={null}>Posts</PageTitle>)
    expect(container.firstElementChild!.className).not.toContain('justify-between')
  })

  it('holds the description to a readable measure', () => {
    // 70ch on a 1320px band. Without it /admin/brain's three-sentence
    // description sets as one full-width line.
    render(<PageTitle sub="A sentence.">Wallet</PageTitle>)
    expect(screen.getByText('A sentence.').className).toContain('max-w-[70ch]')
  })
})
