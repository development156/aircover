import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { toChannelSet, type Channel } from '@sahoda/shared'

import { SendControls } from './send-controls'

/**
 * THE TWO ENDINGS, AND WHAT EACH ONE PROMISES.
 *
 * These two buttons replace a save that floated over the page in a sticky bar
 * and a send that lived four screens below it. The founder's ask was to bring
 * them together, show the channels beside them, and make both of them save
 * everything. Each of those three is a claim a reader will act on, so each is
 * pinned here.
 *
 * The expensive mistake this guards is SILENT DIVERGENCE between the label and
 * the act: a "Save as draft" that saved the post but not the versions would look
 * identical on screen and lose four channel variants.
 */

const set = (...channels: Channel[]) => new Set<Channel>(channels)

function controls(overrides: Partial<Parameters<typeof SendControls>[0]> = {}): {
  container: HTMLElement
  onSaveDraft: ReturnType<typeof vi.fn>
} {
  const onSaveDraft = vi.fn(async () => true)
  const { container } = render(
    <SendControls
      channels={toChannelSet(['instagram', 'linkedin'])}
      live={['instagram', 'linkedin']}
      connected={set('instagram', 'linkedin')}
      unsavedVersions={0}
      onSaveDraft={onSaveDraft}
      onSendNow={vi.fn()}
      sending={false}
      {...overrides}
    />,
  )
  return { container, onSaveDraft }
}

describe('SendControls — the pair, and where the post is going', () => {
  test('lists the channels above the buttons, not only on the schedule route', () => {
    // The founder's second ask, verbatim: "here also show connected platform
    // where it is going just like schedule". It was on one of the two routes.
    const { container } = controls()

    expect(container.querySelector('[data-channel-readout]')).not.toBeNull()
    expect(container.querySelectorAll('[data-channel-status]')).toHaveLength(2)
  })

  test('offers both endings at rest, and neither has fired', () => {
    const { container, onSaveDraft } = controls()

    expect(container.querySelector('[data-send-save-draft]')).not.toBeNull()
    expect(container.querySelector('[data-send-now]')).not.toBeNull()
    expect(onSaveDraft).not.toHaveBeenCalled()
  })

  test('hides Send now when no channel can receive the post, and keeps the draft', () => {
    // A button that cannot work is worse than no button. Work still has to be
    // safe, so the other half stays.
    const { container } = controls({ live: [], connected: set() })

    expect(container.querySelector('[data-send-now]')).toBeNull()
    expect(container.querySelector('[data-send-save-draft]')).not.toBeNull()
  })
})

describe('SendControls — Save as draft', () => {
  test('saves, and says which of the two buttons was pressed', async () => {
    // "Saved" alone, beside a button marked Send now, leaves a reader unsure
    // which one they hit on the one screen where that matters.
    const { container, onSaveDraft } = controls()

    fireEvent.click(container.querySelector('[data-send-save-draft]')!)

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByText(/Saved as a draft\. Nothing has gone out\./)).toBeInTheDocument(),
    )
  })

  test('a refused save is reported as a refusal, never as Saved', async () => {
    // THE ONE THAT MATTERS. `saveAllAndWait` resolves false when a version did
    // not reach its row. Printing "Saved" over that is the half-truth this
    // product exists to refuse, and the reader would close the tab on work that
    // only ever existed on screen.
    const onSaveDraft = vi.fn(async () => false)
    const { container } = render(
      <SendControls
        channels={toChannelSet(['linkedin'])}
        live={['linkedin']}
        connected={set('linkedin')}
        unsavedVersions={2}
        onSaveDraft={onSaveDraft}
        onSendNow={vi.fn()}
        sending={false}
      />,
    )

    fireEvent.click(container.querySelector('[data-send-save-draft]')!)

    await waitFor(() => expect(screen.getByText(/couldn’t save everything/i)).toBeInTheDocument())
    expect(screen.queryByText(/Saved as a draft/)).not.toBeInTheDocument()
  })

  test('says in advance that it writes the versions too', async () => {
    // A reader who does not know this presses Save out of caution and then
    // wonders what the other button skipped.
    controls({ unsavedVersions: 3 })

    expect(screen.getByText(/every version you have written/i)).toBeInTheDocument()
  })
})

describe('SendControls — Send now confirms before it sends', () => {
  test('the first press sends nothing, it only asks', () => {
    // Sending is the one irreversible act on this screen.
    const onSendNow = vi.fn()
    const { container } = controls({ onSendNow })

    fireEvent.click(container.querySelector('[data-send-now]')!)

    expect(onSendNow).not.toHaveBeenCalled()
    expect(container.querySelector('[data-send-confirm]')).not.toBeNull()
  })

  test('the second press is the one that sends', () => {
    const onSendNow = vi.fn()
    const { container } = controls({ onSendNow })

    fireEvent.click(container.querySelector('[data-send-now]')!)
    fireEvent.click(container.querySelector('[data-send-confirm-go]')!)

    expect(onSendNow).toHaveBeenCalledTimes(1)
  })

  test('Cancel takes the question away without sending', () => {
    const onSendNow = vi.fn()
    const { container } = controls({ onSendNow })

    fireEvent.click(container.querySelector('[data-send-now]')!)
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }))

    expect(container.querySelector('[data-send-confirm]')).toBeNull()
    expect(onSendNow).not.toHaveBeenCalled()
  })

  test('names every channel the press will reach, not a count alone', () => {
    // "Confirm" over a list the reader has to scroll back to is a word that
    // could mean anything by the time they get to it.
    const { container } = controls()

    fireEvent.click(container.querySelector('[data-send-now]')!)

    expect(
      screen.getByText(/This posts to Instagram and LinkedIn for real, straight away/),
    ).toBeInTheDocument()
  })

  test('names the single channel by name rather than as "1 channels"', () => {
    const { container } = controls({
      channels: toChannelSet(['linkedin']),
      live: ['linkedin'],
      connected: set('linkedin'),
    })

    fireEvent.click(container.querySelector('[data-send-now]')!)

    expect(screen.getByRole('button', { name: /Confirm and send to LinkedIn/ })).toBeInTheDocument()
  })

  test('counts them when there are several, because four names is not a label', () => {
    const { container } = controls({
      channels: toChannelSet(['instagram', 'linkedin', 'x']),
      live: ['instagram', 'linkedin', 'x'],
      connected: set('instagram', 'linkedin', 'x'),
    })

    fireEvent.click(container.querySelector('[data-send-now]')!)

    expect(
      screen.getByRole('button', { name: /Confirm and send to 3 channels/ }),
    ).toBeInTheDocument()
    // The names are still stated, in the sentence above the button.
    expect(screen.getByText(/Instagram, LinkedIn and X/)).toBeInTheDocument()
  })

  test('warns about Instagram’s wait only when Instagram is in the send', () => {
    const withIg = controls()
    fireEvent.click(withIg.container.querySelector('[data-send-now]')!)
    expect(screen.getByText(/fifteen seconds/i)).toBeInTheDocument()
  })

  test('and not when it is absent', () => {
    const { container } = controls({
      channels: toChannelSet(['linkedin', 'x']),
      live: ['linkedin', 'x'],
      connected: set('linkedin', 'x'),
    })

    fireEvent.click(container.querySelector('[data-send-now]')!)

    expect(screen.queryByText(/fifteen seconds/i)).not.toBeInTheDocument()
  })

  test('while a send is in flight neither button can be pressed again', () => {
    // A second press mid-publish is a second publish. The API is not idempotent
    // from the client's side and the reader has no way to know that.
    const { container } = controls({ sending: true })

    expect(container.querySelector<HTMLButtonElement>('[data-send-save-draft]')!.disabled).toBe(
      true,
    )
    expect(container.querySelector<HTMLButtonElement>('[data-send-now]')!.disabled).toBe(true)
  })
})
