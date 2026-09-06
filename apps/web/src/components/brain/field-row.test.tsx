import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { BRAIN_FIELDS } from '@/lib/brand/fields'

import { FieldRow } from './field-row'

const confirmBrainField = vi.hoisted(() => vi.fn())
vi.mock('@/app/actions/brand-field', () => ({ confirmBrainField }))

const TEXT_FIELD = BRAIN_FIELDS.find((f) => f.path === 'hook.primary_emotion')!
const LIST_FIELD = BRAIN_FIELDS.find((f) => f.path === 'taboo.red_lines')!

beforeEach(() => {
  vi.clearAllMocks()
  confirmBrainField.mockResolvedValue({ ok: true, version: 4, unchanged: false })
})

describe('FieldRow', () => {
  test('a guessed field is marked as a guess, not left unlabelled', () => {
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    expect(screen.getByText('Guess')).toBeInTheDocument()
    expect(screen.getByText('Relief')).toBeInTheDocument()
  })

  test('a confirmed field says so', () => {
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="confirmed" />)
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
  })

  /**
   * The certainty treatment must be the Certainty System's own, not a bespoke
   * one — UI_RULES_v3 forbids a fifth. Asserted through `data-certainty` so the
   * test pins the LEVEL rather than a class list that may be restyled.
   */
  test('uses the Certainty System levels: proposed for a guess, real once confirmed', () => {
    const { rerender } = render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)
    expect(screen.getByText('Guess')).toHaveAttribute('data-certainty', 'proposed')

    rerender(<FieldRow field={TEXT_FIELD} value="Relief" state="confirmed" />)
    expect(screen.getByText('Confirmed')).toHaveAttribute('data-certainty', 'real')
  })

  test('editing a field and saving confirms it', async () => {
    const user = userEvent.setup()
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    await user.click(screen.getByRole('button', { name: /edit/i }))
    const input = screen.getByLabelText(TEXT_FIELD.label)
    await user.clear(input)
    await user.type(input, 'Confidence')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(confirmBrainField).toHaveBeenCalledWith(TEXT_FIELD.path, 'Confidence')
  })

  test('the commit button carries "free" in BOTH wordings, so neither reads as the 50-credit resolve', async () => {
    // The label now switches between Confirm and Save depending on whether the
    // text moved. "free" has to survive that switch — the whole reason it is
    // there is that a press on this page must never look like `brand_research`.
    const user = userEvent.setup()
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    await user.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByRole('button', { name: /confirm · free/i })).toBeInTheDocument()

    await user.type(screen.getByLabelText(TEXT_FIELD.label), '!')
    expect(screen.getByRole('button', { name: /save · free/i })).toBeInTheDocument()
  })

  test('shows the field’s question while editing — that is what is being answered', async () => {
    const user = userEvent.setup()
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    expect(screen.queryByText(TEXT_FIELD.question)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(TEXT_FIELD.question)).toBeInTheDocument()
  })

  test('agreeing with a guess VERBATIM is offered, not refused', async () => {
    // This button used to be disabled here, beside "Change something to confirm
    // this field." Provenance came from diffing versions, so an identical save
    // recorded no authorship and refusing the press was the honest move. It is
    // now stored per field, independently of the text — so agreeing is a real
    // act, and the fastest path to a confirmed brain. A disabled button would
    // leave the whole point of that change unreachable from this screen.
    const user = userEvent.setup()
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    await user.click(screen.getByRole('button', { name: /edit/i }))
    const confirm = screen.getByRole('button', { name: /confirm · free/i })
    expect(confirm).toBeEnabled()

    await user.click(confirm)
    expect(confirmBrainField).toHaveBeenCalledWith(TEXT_FIELD.path, 'Relief')
  })

  test('an already-confirmed field says so instead of inviting a no-op press', async () => {
    // The one press that genuinely records nothing: same text, already confirmed.
    const user = userEvent.setup()
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="confirmed" />)

    await user.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByText(/already confirmed/i)).toBeInTheDocument()
  })

  test('a failed save keeps the editor open with the typing intact', async () => {
    confirmBrainField.mockResolvedValue({ ok: false, message: 'Reload and try again.' })
    const user = userEvent.setup()
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    await user.click(screen.getByRole('button', { name: /edit/i }))
    await user.type(screen.getByLabelText(TEXT_FIELD.label), '!')
    await user.click(screen.getByRole('button', { name: /save · free/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Reload and try again.')
    expect(screen.getByLabelText(TEXT_FIELD.label)).toHaveValue('Relief!')
  })

  test('cancel restores the stored value and writes nothing', async () => {
    const user = userEvent.setup()
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    await user.click(screen.getByRole('button', { name: /edit/i }))
    await user.type(screen.getByLabelText(TEXT_FIELD.label), '!')
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(confirmBrainField).not.toHaveBeenCalled()
    expect(screen.getByText('Relief')).toBeInTheDocument()
  })

  describe('list fields', () => {
    test('render one entry per line rather than a joined string', () => {
      // Several red lines contain commas of their own; joining them would merge
      // two rules into one sentence.
      render(
        <FieldRow field={LIST_FIELD} value={['No false urgency', 'No claims']} state="guessed" />,
      )

      expect(screen.getByText('No false urgency')).toBeInTheDocument()
      expect(screen.getByText('No claims')).toBeInTheDocument()
    })

    test('save the whole list', async () => {
      const user = userEvent.setup()
      render(<FieldRow field={LIST_FIELD} value={['No false urgency']} state="guessed" />)

      await user.click(screen.getByRole('button', { name: /edit/i }))
      await user.type(screen.getByLabelText(`${LIST_FIELD.label} 1`), ' at all')
      await user.click(screen.getByRole('button', { name: /save · free/i }))

      expect(confirmBrainField).toHaveBeenCalledWith(LIST_FIELD.path, ['No false urgency at all'])
    })

    test('an empty list reads as "Not set" rather than as a confirmed blank', () => {
      render(<FieldRow field={LIST_FIELD} value={[]} state="guessed" />)
      expect(screen.getByText('Not set')).toBeInTheDocument()
    })
  })
})

/**
 * Confirming a right answer must not cost an edit.
 *
 * The editor already offered this — its button reads "Confirm · free" on an
 * untouched draft — but the only way in was Edit, on a field needing none. Two
 * presses of friction per field, on the screen whose whole job is turning
 * guesses into confirmations.
 */
describe('confirming without editing', () => {
  test('offers Confirm beside a guess', () => {
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    expect(screen.getByRole('button', { name: /Confirm/ })).toBeInTheDocument()
  })

  test('records the value the server holds, in one press', async () => {
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    await userEvent.click(screen.getByRole('button', { name: /Confirm/ }))

    // The path and the STORED value: sending anything else would confirm a
    // wording the reader did not agree to.
    expect(confirmBrainField).toHaveBeenCalledWith('hook.primary_emotion', 'Relief', {
      asSeen: true,
    })
    expect(confirmBrainField).toHaveBeenCalledTimes(1)
  })

  test('confirms the value that arrived, not the one the row mounted with', async () => {
    // THE MUTATION THIS EXISTS FOR. Sending `draft` instead of `value` passes
    // every other test in this block, because `draft` is seeded from `value` and
    // nothing in those tests makes them differ. This one makes them differ the
    // way the product does: a regenerate lands while the row sits open, the
    // prop changes, and the mounted draft is now stale text.
    const { rerender } = render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)
    rerender(<FieldRow field={TEXT_FIELD} value="Reassurance" state="guessed" />)

    await userEvent.click(screen.getByRole('button', { name: /Confirm/ }))

    expect(confirmBrainField).toHaveBeenCalledWith('hook.primary_emotion', 'Reassurance', {
      asSeen: true,
    })
    expect(confirmBrainField).not.toHaveBeenCalledWith('hook.primary_emotion', 'Relief', {
      asSeen: true,
    })
  })

  test('does not open the editor to do it', async () => {
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    await userEvent.click(screen.getByRole('button', { name: /Confirm/ }))

    // The question only renders while editing, so its absence is the claim that
    // the editor never opened.
    expect(screen.queryByText(TEXT_FIELD.question)).not.toBeInTheDocument()
  })

  test('offers nothing to press on a field already confirmed', () => {
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="confirmed" />)

    // A button that records nothing, beside a mark already saying it is
    // confirmed, is an invitation to a no-op.
    expect(screen.queryByRole('button', { name: /Confirm/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument()
  })

  test('looks like a control, not a caption', () => {
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    // THE DEFECT THIS PINS. Shipped first as `variant="ghost"` — `text-muted`,
    // no ring — and the founder read past it, and past the section's
    // "Confirm all", reporting the latter missing while looking at a screenshot
    // that contained it. `surface-ring-firm` is the hairline the `secondary`
    // variant paints, and it is what makes the control read as pressable.
    //
    // WHAT THIS CANNOT SEE: whether it looks pressable to a person. jsdom
    // resolves no stylesheet, so this asserts the variant was chosen, not the
    // pixels it produces. The pixels were checked on the preview.
    expect(screen.getByRole('button', { name: /Confirm/ })).toHaveClass('surface-ring-firm')
  })

  test('does not spend the one primary this view is allowed', () => {
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    // §6 rations the orange fill to ONE per view and /brain renders fifteen of
    // these rows. `bg-primary` here would be fifteen.
    expect(screen.getByRole('button', { name: /Confirm/ })).not.toHaveClass('bg-primary')
  })

  test('says so when the confirm fails, rather than leaving the mark unchanged and silent', async () => {
    confirmBrainField.mockResolvedValue({ ok: false, message: 'Sahoda could not save that.' })
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    await userEvent.click(screen.getByRole('button', { name: /Confirm/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sahoda could not save that.')
  })
})

/**
 * MEASURED 2026-09-06 on the wt-core preview, /brain/resolve, network set to
 * Offline, one "Confirm · free" pressed: the WHOLE console was replaced by the
 * route error boundary ("Something broke on our side, not yours") — the
 * transport rejection left `startTransition` unhandled and React unmounted the
 * tree, taking every ticked checkbox and open editor with it. The failure was
 * the person's own connection and the sentence blamed us.
 */
describe('FieldRow when the action cannot be reached', () => {
  test('a rejected confirm becomes an inline message, not a thrown render', async () => {
    confirmBrainField.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    await user.click(screen.getByRole('button', { name: /confirm · free/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/connection|reach/i)
    // Still a guess, still here, still pressable.
    expect(screen.getByText('Guess')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm · free/i })).toBeEnabled()
  })

  test('a rejected save keeps the editor open with the typing intact', async () => {
    confirmBrainField.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    await user.click(screen.getByRole('button', { name: /edit/i }))
    const input = screen.getByLabelText(TEXT_FIELD.label)
    await user.clear(input)
    await user.type(input, 'Confidence')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText(TEXT_FIELD.label)).toHaveValue('Confidence')
  })
})

/**
 * MEASURED 2026-09-06: a single space saved as the third core value and marked
 * Confirmed (production version 8 of the QA workspace). The editor offered
 * "Save · free" on a blank exactly as it does on words.
 */
describe('FieldRow refuses to save a blank', () => {
  test('the commit button is disabled while the draft is blank, and says why', async () => {
    const user = userEvent.setup()
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    await user.click(screen.getByRole('button', { name: /edit/i }))
    await user.clear(screen.getByLabelText(TEXT_FIELD.label))

    expect(screen.getByRole('button', { name: /save|confirm/i })).toBeDisabled()
    expect(screen.getByText(/blank/i)).toBeInTheDocument()
    expect(confirmBrainField).not.toHaveBeenCalled()
  })

  test('opening the editor moves focus into it', async () => {
    const user = userEvent.setup()
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    await user.click(screen.getByRole('button', { name: /edit/i }))

    expect(screen.getByLabelText(TEXT_FIELD.label)).toHaveFocus()
  })
})

describe('FieldRow — a field seeded from a setup answer', () => {
  test('is labelled as theirs-reworded, not as a guess, and still offers Confirm', () => {
    render(<FieldRow field={LIST_FIELD} value={['guilt-free']} state="intake" />)
    expect(screen.getByText('From your answer')).toHaveAttribute('data-certainty', 'proposed')
    expect(screen.queryByText('Guess')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm · free/i })).toBeInTheDocument()
  })
})

describe('FieldRow — the inline confirm agrees to what was SEEN', () => {
  test('passes asSeen so a wording that moved underneath is refused, not overwritten', async () => {
    const user = userEvent.setup()
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)
    await user.click(screen.getByRole('button', { name: /confirm · free/i }))
    expect(confirmBrainField).toHaveBeenCalledWith(TEXT_FIELD.path, 'Relief', { asSeen: true })
  })
})

describe('FieldRow — approval is a visible event', () => {
  test('the chip pops when the state turns confirmed under it, and not on first render', () => {
    const { rerender } = render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)
    expect(screen.getByText('Guess')).not.toHaveAttribute('data-just')

    rerender(<FieldRow field={TEXT_FIELD} value="Relief" state="confirmed" />)
    expect(screen.getByText('Confirmed')).toHaveAttribute('data-just', 'true')
  })

  test('a row that arrives already confirmed does not pop', () => {
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="confirmed" />)
    expect(screen.getByText('Confirmed')).not.toHaveAttribute('data-just')
  })
})
