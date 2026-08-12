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
