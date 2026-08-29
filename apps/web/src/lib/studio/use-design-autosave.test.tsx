import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { DesignDocument } from '@sahoda/shared'

import type { DesignDraft } from '@/lib/studio/autosave'
import { useDesignAutosave } from '@/lib/studio/use-design-autosave'

/**
 * THE FOUR WAYS OFF THIS SCREEN, AND THE ONE THAT ALMOST SHIPPED UNCOVERED.
 *
 * `useFlushOnLeave` handles Back, a backgrounded tab and a real unload. None of
 * those fire on a forward `<Link>` click, which is what "All designs" at the
 * top of the editor is and the commonest deliberate way out. This file exists
 * because that hole is invisible by reading: the hook LOOKS complete, and the
 * three events it subscribes to are all real.
 */

const doc = (text: string): DesignDocument => ({
  v: 1,
  templateId: 'bold-statement',
  pages: [{ slots: { headline: { kind: 'text', text } } }],
})

const draftOf = (text: string): DesignDraft => ({
  title: 'A poster',
  doc: doc(text),
  isTemplate: false,
})

const save = vi.fn()

/** A harness that starts clean and is made dirty by pressing "type". */
function Harness() {
  const [text, setText] = useState('one')
  const [blank, setBlank] = useState(false)
  const autosave = useDesignAutosave({
    // A trailing space the server trims, so "what was sent" and "what came
    // back" are genuinely different documents once anything is typed.
    draft: {
      ...draftOf(text),
      title: blank ? '' : text === 'one' ? 'A poster' : 'A poster ',
    },
    initial: draftOf('one'),
    save,
  })
  return (
    <div>
      <button type="button" onClick={() => setText('two')}>
        type
      </button>
      <button type="button" onClick={() => setBlank(true)}>
        clear the name
      </button>
      {/* Something to press that is not a link and not an edit. */}
      <button type="button" onClick={() => undefined}>
        poke
      </button>
      {/* Stands in for "All designs": a plain forward link. */}
      <a href="/studio">All designs</a>
      <span data-testid="dirty">{autosave.dirty ? 'dirty' : 'clean'}</span>
      <span data-testid="blocked">{autosave.blocked ?? 'none'}</span>
    </div>
  )
}

beforeEach(() => {
  save.mockReset()
  save.mockResolvedValue({ ok: true, saved: draftOf('two') })
})

describe('useDesignAutosave', () => {
  test('a forward link click writes the work down before leaving', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'type' }))
    expect(screen.getByTestId('dirty')).toHaveTextContent('dirty')
    expect(save).not.toHaveBeenCalled()

    await user.click(screen.getByRole('link', { name: 'All designs' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0]![0]).toMatchObject({ doc: doc('two') })
  })

  /**
   * A modified click opens a new tab and leaves this page exactly where it is,
   * so it is not a way out and must not spend a write.
   */
  test('a click that opens a new tab does not spend a write', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'type' }))

    await user.keyboard('[ControlLeft>]')
    await user.click(screen.getByRole('link', { name: 'All designs' }))
    await user.keyboard('[/ControlLeft]')

    expect(save).not.toHaveBeenCalled()
  })

  test('clicking a link with nothing typed writes nothing', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('link', { name: 'All designs' }))
    expect(save).not.toHaveBeenCalled()
  })

  /**
   * Pressed WHILE dirty, so the listener is attached and chooses not to fire.
   * An earlier version of this test clicked before the first edit had landed in
   * state, so the listener was not subscribed yet and the test passed whatever
   * the listener did.
   */
  test('a click on something that is not a link writes nothing', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'type' }))
    expect(screen.getByTestId('dirty')).toHaveTextContent('dirty')

    await user.click(screen.getByRole('button', { name: 'poke' }))
    expect(save).not.toHaveBeenCalled()
  })

  /**
   * THE SNAPSHOT IS WHAT CAME BACK, NOT WHAT WAS SENT.
   *
   * The server normalises: `TitleSchema` is `z.string().trim()`, so a draft
   * whose title ends in a space comes back trimmed and can NEVER equal what was
   * sent. Comparing them raw leaves the design dirty forever, which is one row
   * write every 1.2 seconds for as long as the tab is open. This test was
   * written expecting the opposite and failed, which is how the loop was found.
   */
  test('a title the server will trim does not owe an endless write', async () => {
    save.mockResolvedValue({ ok: true, saved: { ...draftOf('two'), title: 'A poster' } })
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'type' }))
    await user.click(screen.getByRole('link', { name: 'All designs' }))
    await waitFor(() => expect(screen.getByTestId('dirty')).toHaveTextContent('clean'))
  })

  /**
   * A refused save leaves the design dirty, which is what makes the next pause
   * try again rather than the editor believing an older document is stored.
   */
  test('a refused save leaves the work owed', async () => {
    save.mockResolvedValue({ ok: false, message: 'Sahoda could not save.' })
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'type' }))
    await user.click(screen.getByRole('link', { name: 'All designs' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('dirty')).toHaveTextContent('dirty')
  })

  /**
   * The write is not attempted at all. MEASURED: `TitleSchema` refuses an empty
   * name, and the server's answer names nothing the person can act on, so with
   * an autosave it would arrive every 1.2 seconds until the box was filled.
   */
  test('an empty name stops the write rather than retrying a refusal', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'clear the name' }))
    expect(screen.getByTestId('blocked')).not.toHaveTextContent('none')

    await user.click(screen.getByRole('link', { name: 'All designs' }))
    expect(save).not.toHaveBeenCalled()
  })
})
