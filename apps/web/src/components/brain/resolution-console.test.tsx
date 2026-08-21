import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

import { BRAIN_FIELDS } from '@/lib/brand/fields'
import type { Provenance } from '@/lib/brand/provenance'

import { ResolutionConsole } from './resolution-console'

const confirmBrainFields = vi.hoisted(() => vi.fn())
const confirmBrainField = vi.hoisted(() => vi.fn())
vi.mock('@/app/actions/brain-resolve-fields', () => ({ confirmBrainFields }))
vi.mock('@/app/actions/brand-field', () => ({ confirmBrainField }))

const NOTHING_CONFIRMED: Provenance = new Map(BRAIN_FIELDS.map((f) => [f.path, 'guessed']))
const ALL_CONFIRMED: Provenance = new Map(BRAIN_FIELDS.map((f) => [f.path, 'confirmed']))

beforeEach(() => {
  vi.clearAllMocks()
  confirmBrainFields.mockResolvedValue({ ok: true, version: 3, confirmed: 2 })
  confirmBrainField.mockResolvedValue({ ok: true, version: 3, unchanged: false })
})

function renderConsole(provenance: Provenance = NOTHING_CONFIRMED) {
  return render(<ResolutionConsole payload={DEMO_FALLBACK_PAYLOAD} provenance={provenance} />)
}

describe('ResolutionConsole', () => {
  test('every unconfirmed field is on screen as a guess, not as a fact', () => {
    renderConsole()
    // The Certainty System's own vocabulary, asserted by LEVEL rather than by a
    // class list that may be restyled.
    const guesses = screen.getAllByText('Guess')
    expect(guesses).toHaveLength(BRAIN_FIELDS.length)
    for (const mark of guesses) expect(mark).toHaveAttribute('data-certainty', 'proposed')
  })

  /**
   * THE RUBBER-STAMP GUARD.
   *
   * Confirmation is the only signal the whole Brand Brain rests on — the ring
   * counts it, the mesh writes from it, and nothing downstream can tell a
   * considered tick from a pre-ticked one. A console that arrives with every row
   * selected turns one press into fifteen confirmations of text nobody scrolled
   * past, which is precisely the "presenting a guess as a fact" this screen
   * exists to prevent.
   */
  test('nothing is selected on arrival, and the primary action is inert', () => {
    renderConsole()
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).not.toBeChecked()
    }
    expect(screen.getByRole('button', { name: /confirm selected/i })).toBeDisabled()
  })

  test('the primary action names the count it is about to confirm', async () => {
    const user = userEvent.setup()
    renderConsole()

    await user.click(screen.getAllByRole('checkbox')[0]!)
    expect(screen.getByRole('button', { name: /confirm 1 selected/i })).toBeEnabled()

    await user.click(screen.getAllByRole('checkbox')[1]!)
    expect(screen.getByRole('button', { name: /confirm 2 selected/i })).toBeEnabled()
  })

  test('bulk accept sends exactly the ticked paths, in one call', async () => {
    const user = userEvent.setup()
    renderConsole()

    const boxes = screen.getAllByRole('checkbox')
    await user.click(boxes[0]!)
    await user.click(boxes[2]!)
    await user.click(screen.getByRole('button', { name: /confirm 2 selected/i }))

    expect(confirmBrainFields).toHaveBeenCalledTimes(1)
    const [sent] = confirmBrainFields.mock.calls[0]!
    expect(sent).toHaveLength(2)
    // Real registry paths, never an invented one.
    for (const path of sent) {
      expect(BRAIN_FIELDS.map((f) => f.path)).toContain(path)
    }
  })

  /**
   * ONE PRIMARY PER VIEW (docs/26 §1.5). Eleven rows each carrying a primary
   * Confirm is eleven primaries and therefore none. Asserted structurally: the
   * row-level confirms must not wear the primary fill.
   */
  test('row-level confirms are secondary; only the bulk accept is primary', () => {
    renderConsole()
    const rowConfirms = screen.getAllByRole('button', { name: /^confirm · free$/i })
    expect(rowConfirms.length).toBeGreaterThan(0)
    for (const button of rowConfirms) {
      expect(button.className).not.toMatch(/\bbg-primary\b/)
    }
    expect(screen.getByRole('button', { name: /confirm selected · free/i }).className).toMatch(
      /\bbg-primary\b/,
    )
  })

  /**
   * A DESTRUCTIVE ACTION GETS NO STANDING SPACE IN A LIST ROW (docs/26 §1.5) —
   * the `/posts` failure, where the only verb with dedicated real estate on
   * every card was Delete. Clearing a field lives inside the editor, behind the
   * same explicit press as any other correction.
   */
  test('no row offers a clear or reject at rest', () => {
    renderConsole()
    expect(screen.queryByRole('button', { name: /there are none/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /reject/i })).toBeNull()
  })

  test('an open list can be emptied, and the copy states what that records', async () => {
    const user = userEvent.setup()
    renderConsole()

    // `taboo.red_lines` is an OPEN list, so "there are none" is a real answer.
    const row = document.querySelector('[data-field="taboo.red_lines"]') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /correct/i }))

    await user.click(within(row).getByRole('button', { name: /there are none/i }))
    expect(confirmBrainField).toHaveBeenCalledWith('taboo.red_lines', [])
  })

  /**
   * THE CLAIM THIS ROW MAKES ABOUT ITS OWN WRITE.
   *
   * `confirmBrainField` passes the path in `confirmPaths`, so `nextFieldMeta`
   * stamps `confirmedByOwner` and a cleared field comes back
   * `confirmed: true` — verified against `nextFieldMeta` directly. An earlier
   * draft of this row told the user the opposite ("afterwards this field looks
   * the same as one Sahoda never filled"), which is false: a field Sahoda never
   * filled is `confirmed: false`.
   *
   * Asserts the CLAIM, not the wording.
   */
  test('emptying a list never claims the confirmation is not recorded', async () => {
    const user = userEvent.setup()
    renderConsole()

    const row = document.querySelector('[data-field="taboo.red_lines"]') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /correct/i }))

    const text = row.textContent ?? ''
    expect(text).not.toMatch(/does not record|looks the same as one Sahoda never filled/i)
    expect(text).toMatch(/counts as confirmed/i)
  })

  /**
   * A TEXT FIELD HAS NO HONEST "NONE".
   *
   * A blank `core_promise` is an absence, not a position, so recording "a person
   * confirmed this" over nothing would put a hollow field into the confirmed
   * count — the fake-confirmation state `field_meta` exists to prevent, arriving
   * through the one control that can empty a field.
   */
  test('a text field is not offered an empty answer, and says why', async () => {
    const user = userEvent.setup()
    renderConsole()

    const row = document.querySelector('[data-field="hook.core_promise"]') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /correct/i }))

    expect(within(row).queryByRole('button', { name: /there are none/i })).toBeNull()
    expect(within(row).getByText(/would be an absence rather than a position/i)).toBeInTheDocument()
  })

  /**
   * The three `fixedLength` lists are pinned at exactly three entries by
   * `BrandMemoryPayloadSchema`, the RPC re-validates it, and `confirmBrainField`
   * refuses a different length. Offering a Clear the server would reject is a
   * dead end, so it is not offered — and the reason is on screen rather than
   * left as a missing button.
   */
  test('a fixed-length list offers no clear, and says why', async () => {
    const user = userEvent.setup()
    renderConsole()

    const row = document.querySelector('[data-field="voice.signature_phrases"]') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /correct/i }))

    expect(within(row).queryByRole('button', { name: /there are none/i })).toBeNull()
    expect(within(row).getByText(/always holds three entries/i)).toBeInTheDocument()
  })

  /**
   * NO DEAD ENDS, and no disabled button standing in for a missing one. A blank
   * guess has nothing to agree with, so Confirm is not rendered at all and a
   * sentence says why — a `<button disabled>` here would offer an action that
   * cannot exist (docs/26 §10.2).
   */
  test('a blank guess offers no confirm, and is excluded from select-all', async () => {
    const user = userEvent.setup()
    const blanked = {
      ...DEMO_FALLBACK_PAYLOAD,
      hook: { ...DEMO_FALLBACK_PAYLOAD.hook, core_promise: '' },
    }
    render(<ResolutionConsole payload={blanked} provenance={NOTHING_CONFIRMED} />)

    const row = document.querySelector('[data-field="hook.core_promise"]') as HTMLElement
    expect(within(row).queryByRole('button', { name: /^confirm · free$/i })).toBeNull()
    expect(within(row).getByText(/nothing to confirm/i)).toBeInTheDocument()
    expect(within(row).getByRole('checkbox')).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /select all/i }))
    expect(within(row).getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('button', { name: /confirm 14 selected/i })).toBeInTheDocument()
  })

  /**
   * A CONFIRMED FIELD CAN BE EMPTY, and the settled list must not render it as
   * though someone wrote an answer. "There are none" writes `[]` and marks the
   * field confirmed, so it leaves the queue — and a bare label beside a
   * Confirmed mark would overstate what the person did.
   */
  test('a confirmed but empty field says which answer was given', () => {
    const emptied = {
      ...DEMO_FALLBACK_PAYLOAD,
      taboo: { ...DEMO_FALLBACK_PAYLOAD.taboo, red_lines: [] },
    }
    render(<ResolutionConsole payload={emptied} provenance={ALL_CONFIRMED} />)

    const settled = screen.getByText('Red lines').closest('li') as HTMLElement
    expect(within(settled).getByText(/there are none/i)).toBeInTheDocument()

    // And a confirmed field that DOES hold a value says no such thing.
    const other = screen.getByText('Core promise').closest('li') as HTMLElement
    expect(within(other).queryByText(/there are none/i)).toBeNull()
  })

  test('a fully confirmed brain says so instead of showing an empty queue', () => {
    renderConsole(ALL_CONFIRMED)
    expect(screen.getByText(/nothing left to resolve/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm selected/i })).toBeNull()
  })

  /**
   * READ TEXT, NOT BOXES. A failure that is swallowed leaves the row looking
   * confirmed, which is the one lie this screen cannot tell.
   */
  test('a failed bulk accept says so and confirms nothing', async () => {
    const user = userEvent.setup()
    confirmBrainFields.mockResolvedValue({ ok: false, message: 'Create a workspace first.' })
    renderConsole()

    await user.click(screen.getAllByRole('checkbox')[0]!)
    await user.click(screen.getByRole('button', { name: /confirm 1 selected/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Create a workspace first.')
    // Still in the queue, still a guess.
    expect(screen.getAllByText('Guess')).toHaveLength(BRAIN_FIELDS.length)
  })

  test('a successful bulk accept reports the count and the version it wrote', async () => {
    const user = userEvent.setup()
    renderConsole()

    await user.click(screen.getAllByRole('checkbox')[0]!)
    await user.click(screen.getAllByRole('checkbox')[1]!)
    await user.click(screen.getByRole('button', { name: /confirm 2 selected/i }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/confirmed 2 fields as version 3/i)
  })

  /**
   * THE HONESTY GUARD THE WHOLE SCREEN TURNS ON.
   *
   * Nothing stored links a field to a passage: the mesh receives the entire door
   * text and returns all fifteen fields in one object. So no row may claim one.
   * Asserted over the rendered TEXT of every row rather than over a component's
   * props — a source claim could arrive from a copy edit in any of three files.
   */
  test('no row claims where its value came from', () => {
    renderConsole()
    const forbidden =
      /\b(from|on) your (site|website|page|pdf|document)|we (read|found) (this|it) (in|on|at)|source:/i
    for (const row of document.querySelectorAll('[data-field]')) {
      expect(row.textContent ?? '').not.toMatch(forbidden)
    }
  })

  test('the per-field-source matcher recognises a claim that would be dishonest', () => {
    expect('Inferred from your website, /about').toMatch(
      /\b(from|on) your (site|website|page|pdf|document)/i,
    )
  })
})
