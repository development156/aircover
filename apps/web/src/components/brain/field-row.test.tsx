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
    expect(confirmBrainField).toHaveBeenCalledWith('hook.primary_emotion', 'Relief')
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

    expect(confirmBrainField).toHaveBeenCalledWith('hook.primary_emotion', 'Reassurance')
    expect(confirmBrainField).not.toHaveBeenCalledWith('hook.primary_emotion', 'Relief')
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

  test('says so when the confirm fails, rather than leaving the mark unchanged and silent', async () => {
    confirmBrainField.mockResolvedValue({ ok: false, message: 'Sahoda could not save that.' })
    render(<FieldRow field={TEXT_FIELD} value="Relief" state="guessed" />)

    await userEvent.click(screen.getByRole('button', { name: /Confirm/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sahoda could not save that.')
  })
})
