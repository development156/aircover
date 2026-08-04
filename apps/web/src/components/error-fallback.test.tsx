import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { ErrorFallback } from './error-fallback'

// A Sentry event id is the only technical string a user should ever be asked to
// carry. Shaped like a real one (32 hex chars) so a test failure reads like the
// production string it stands in for.
const EVENT_ID = 'a3f19c7e4b8d42a1b6c05e7d9f381a2c'

describe('ErrorFallback', () => {
  test('speaks to the user in plain words when given nothing at all', () => {
    // The bare render is the case that actually ships: an error boundary that
    // caught something it cannot describe renders <ErrorFallback /> with no
    // props. Defaults are the product, not a fallback for the fallback.
    render(<ErrorFallback />)

    // Queried by ROLE and by the words a human reads — not a test id. A test id
    // would keep passing while the heading rendered as an empty <h2>, or while
    // the copy drifted into "Oops! Error 500". The assertion has to be able to
    // see what the user sees.
    expect(screen.getByRole('heading')).toHaveTextContent("This screen didn't load")
    expect(
      screen.getByText(
        'Something broke on our side, not yours. Try again in a moment — if it keeps happening, contact support.',
      ),
    ).toBeInTheDocument()
  })

  test('announces itself to assistive tech instead of failing silently', () => {
    // A crash swaps the page contents without moving focus or changing route,
    // so a screen reader user gets no signal that anything happened. role=alert
    // is what makes the swap audible. Without it the component is invisible to
    // exactly the users least able to guess that something broke.
    render(<ErrorFallback />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  test('offers a retry action that fires exactly once per click', async () => {
    const onRetry = vi.fn()
    render(<ErrorFallback onRetry={onRetry} />)

    // user-event, not fireEvent: it drives a real pointer sequence and so
    // catches an affordance that is visually a button but unclickable (covered
    // by an overlay, pointer-events:none, or disabled). fireEvent dispatches
    // straight at the node and would pass on all three.
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    // Exactly once. A double-bound handler (onClick plus a form submit, say)
    // would re-run a mutation the user believes they triggered a single time.
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  test('renders no action at all when there is nothing to retry', () => {
    // House rule: no fake affordances. A "Try again" button that the parent
    // gave no handler for is a button that does nothing when pressed — worse
    // than no button, because the user reads the silence as a second failure.
    render(<ErrorFallback />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('shows the event id so a user can quote it to support', () => {
    render(<ErrorFallback eventId={EVENT_ID} />)

    // Asserted against the live region's text content rather than an exact text
    // node, because the id will sit inside a label ("Reference: <id>") and may
    // be split across elements. What matters is that the characters are on
    // screen and readable — that is the whole point of surfacing it.
    expect(screen.getByRole('alert')).toHaveTextContent(EVENT_ID)
  })

  test('renders no reference line when there is no event id to quote', () => {
    render(<ErrorFallback eventId={undefined} />)

    // An empty "Reference:" label is a dead end: it invites the user to quote
    // something that is not there. Absent id means absent line.
    expect(screen.queryByText(/reference/i)).not.toBeInTheDocument()
  })

  test('cannot leak technical detail, because its props carry none', () => {
    // The contract is negative, so it is pinned in two places at once.
    //
    // 1. COMPILE TIME. If anyone later widens the props with `error`, `stack`,
    //    `digest`, `cause` or `errorInfo`, this Extract stops resolving to
    //    `never` and `pnpm typecheck` fails on the line below. That is the real
    //    enforcement — a leak gets caught when the prop is added, not when a
    //    stack trace has already been rendered to a customer.
    type Props = React.ComponentProps<typeof ErrorFallback>
    type LeakyProp = Extract<keyof Props, 'error' | 'stack' | 'digest' | 'cause' | 'errorInfo'>
    const propsCarryNoErrorDetail: [LeakyProp] extends [never] ? true : false = true
    expect(propsCarryNoErrorDetail).toBe(true)

    // 2. RUN TIME. Types vanish at the boundary — an error boundary written in
    //    JS, or one that spreads `{...errorInfo}`, hands over whatever it holds.
    //    Force-feeding those fields proves the component ignores what it was
    //    never designed to accept, rather than quietly rendering it.
    const hostileProps = {
      error: new Error('DB connection string postgres://admin:hunter2@10.0.0.4/prod'),
      stack: 'at handler (/srv/app/.next/server/app/api/route.js:41:17)',
      digest: '2847193045',
    } as unknown as React.ComponentProps<typeof ErrorFallback>

    const { container } = render(<ErrorFallback {...hostileProps} />)

    expect(container).not.toHaveTextContent('hunter2')
    expect(container).not.toHaveTextContent('/srv/app')
    expect(container).not.toHaveTextContent('2847193045')
  })
})
