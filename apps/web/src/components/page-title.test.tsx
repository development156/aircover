import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { PageTitle } from './page-title'

/**
 * THIRTY-TWO SCREENS RENDER THIS AND NONE OF THEM PASSES A CRUMB.
 *
 * The trail was added for /connections. The risk it introduced is not on that
 * screen: it is on the other thirty-one, where a landmark or a heading change
 * would be a silent regression nobody is looking at. So the first assertion here
 * is about the case that did NOT change.
 */
describe('PageTitle', () => {
  it('is a bare heading, with no navigation landmark, when there is no trail', () => {
    render(<PageTitle sub="A sentence.">Wallet</PageTitle>)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Wallet')
    // A landmark wrapping one heading announces a navigation region holding
    // nothing to navigate. Thirty-one screens must not grow one.
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('states the view after the title, and says which segment you are on', () => {
    render(
      <PageTitle crumb="Integrate" sub="A sentence.">
        Connections
      </PageTitle>,
    )

    const trail = screen.getByRole('navigation', { name: 'Location' })
    expect(trail).toHaveTextContent('Connections')
    expect(screen.getByText('Integrate')).toHaveAttribute('aria-current', 'page')
  })

  it('offers no link, because there is no other route to offer', () => {
    render(<PageTitle crumb="Integrate">Connections</PageTitle>)

    // The claim: a crumb is only a control if it goes somewhere. Neither segment
    // does, so neither is an anchor. The day a real parent route exists this
    // assertion is what makes someone come back and change it deliberately.
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('keeps the title as the heading even when a trail follows it', () => {
    render(<PageTitle crumb="Integrate">Connections</PageTitle>)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Connections')
    // NOT the crumb. Anyone navigating this app by heading gets the screen's
    // name, not the view inside it.
    expect(heading).not.toHaveTextContent('Integrate')
  })
})
