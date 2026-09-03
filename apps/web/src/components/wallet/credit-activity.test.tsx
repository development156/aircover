import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LedgerEntry } from '@sahoda/shared'

import { CreditActivity } from './credit-activity'

/**
 * The arithmetic lives in `lib/wallet/activity-view.ts` and is pinned there.
 * What is pinned HERE is the thing paging a ledger can get wrong that no
 * arithmetic test would see: a row whose meaning depends on a row that is on a
 * different page.
 */

function entry(seq: number, over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    workspace_id: '00000000-0000-4000-8000-000000000001',
    seq,
    entry_type: 'DEBIT',
    amount: 10,
    balance_after: 1000 - seq,
    action_type: 'caption_rewrite',
    object_ref: null,
    model_tier: null,
    cogs_usd_est: null,
    idempotency_key: `k${seq}`,
    settles_entry_id: null,
    hold_expires_at: null,
    actor: null,
    meta: null,
    created_at: '2026-08-29T10:00:00.000Z',
    ...over,
  } as LedgerEntry
}

/** Newest first, as `readLedger` returns them. */
const many = (n: number) => Array.from({ length: n }, (_, i) => entry(n - i))

function view(over: Partial<React.ComponentProps<typeof CreditActivity>> = {}) {
  return render(<CreditActivity entries={many(43)} skipped={0} limit={50} total={43} {...over} />)
}

describe('CreditActivity', () => {
  /* The rows-per-page choice is deliberately remembered for the session, so it
     survives between renders — including between tests in this file, which is
     how the persistence was first observed here rather than asserted. Cleared
     per test so each one states its own starting point. */
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('remembers the row count for the rest of the session', async () => {
    const user = userEvent.setup()
    const first = view()
    await user.selectOptions(screen.getByLabelText('Rows per page'), '25')
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 to 25 of 43 entries')
    first.unmount()

    // A fresh mount, as a second visit to /wallet within the session would be.
    // `waitFor`, because the remembered value is read in an effect: reading it
    // in a lazy initial value would run on the server too and hand the client a
    // different first render than the server sent.
    view()
    await waitFor(() =>
      expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 to 25 of 43 entries'),
    )
  })

  it('does not call a hold reserved because its settlement is on another page', async () => {
    // ── THE DEFECT PAGINATION INTRODUCES, AND THE REASON THIS FILE EXISTS ────
    // `ledger-table.tsx` derived "which holds are still open" from the entries
    // handed to it, and justified that with an argument true of one page of
    // fifty: a settling entry always outranks its hold by `seq`, so a visible
    // hold has a visible settlement. Paginate, and that stops holding. The
    // DEBIT lands on page one and the HOLD it closed on page two, where a
    // per-page derivation finds no settlement and prints "Reserved" — telling
    // somebody credits are frozen that were spent.
    //
    // ── THIS TEST DID NOT BITE ON ITS FIRST DRAFT, AND THAT IS THE POINT ─────
    // It rendered two entries and asserted the hold was not "Reserved". Two
    // entries fit on ONE page of ten, so the settlement was never on a
    // different page, the defect was never reproduced, and removing the fix
    // left the suite green. A guard that has not been watched fail is not a
    // guard. It now needs ELEVEN entries, because that is the smallest number
    // that puts the two halves on different pages.
    const hold = entry(1, { entry_type: 'HOLD', amount: 10 })
    const settling = entry(100, { entry_type: 'DEBIT', amount: 10, settles_entry_id: hold.id })
    const filler = Array.from({ length: 9 }, (_, i) => entry(99 - i))

    const user = userEvent.setup()
    render(
      <CreditActivity entries={[settling, ...filler, hold]} skipped={0} limit={50} total={11} />,
    )

    // Page one holds the settling DEBIT and the nine fillers; the hold is alone
    // on page two, where a per-page derivation cannot see what closed it.
    await user.click(screen.getByLabelText('Page 2'))
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 11 to 11 of 11')
    expect(screen.queryByText('Reserved')).toBeNull()
  })

  it('still marks a corrected row when the correction is on another page', async () => {
    // ── THE SIBLING THE PAGINATION FIX LEFT OPEN ────────────────────────────
    // `settled` was hoisted over the whole window for the reason the test above
    // gives. `correctedSeqs` falls out of the SAME `groupCorrections` call and
    // was not hoisted, so `LedgerTable` kept deriving it from the ten rows it
    // was handed. A correction points at an entry far older than itself, so in
    // any real history the two are on different pages: the superseded row then
    // renders with no note at all, which reads as though it still stands. That
    // is the exact claim the note exists to prevent.
    //
    // Eleven entries for the same reason as above: fewer fit on one page and
    // the defect is never reproduced.
    const original = entry(1, { entry_type: 'DEBIT', amount: 100 })
    const reversal = entry(100, {
      entry_type: 'ADJUST',
      amount: 100,
      meta: { correction: 'c-1', reverses_seq: 1 },
    } as Partial<LedgerEntry>)
    const filler = Array.from({ length: 9 }, (_, i) => entry(99 - i))

    const user = userEvent.setup()
    render(
      <CreditActivity
        entries={[reversal, ...filler, original]}
        skipped={0}
        limit={50}
        total={11}
      />,
    )

    await user.click(screen.getByLabelText('Page 2'))
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 11 to 11 of 11')
    expect(screen.getByText(/Corrected by a later entry/)).toBeInTheDocument()
  })

  it('does not tell the reader to look "above" for something on another page', async () => {
    // The second half of the same defect. Hoisting the set alone would restore
    // the note and leave it pointing at a row that is forty places back on page
    // one. A direction that is wrong is worse than no direction.
    const original = entry(1, { entry_type: 'DEBIT', amount: 100 })
    const reversal = entry(100, {
      entry_type: 'ADJUST',
      amount: 100,
      meta: { correction: 'c-1', reverses_seq: 1 },
    } as Partial<LedgerEntry>)
    const filler = Array.from({ length: 9 }, (_, i) => entry(99 - i))

    const user = userEvent.setup()
    render(
      <CreditActivity
        entries={[reversal, ...filler, original]}
        skipped={0}
        limit={50}
        total={11}
      />,
    )

    await user.click(screen.getByLabelText('Page 2'))
    expect(screen.getByText(/Corrected by a later entry/)).toHaveTextContent(/on a newer page/i)
    expect(screen.queryByText(/See the correction above/)).toBeNull()
  })

  it('leaves an uncorrected row unmarked, so the two guards above are not just noise', () => {
    // Without this, deleting the note from the component satisfies both.
    render(<CreditActivity entries={many(3)} skipped={0} limit={50} total={3} />)
    expect(screen.queryByText(/Corrected by a later entry/)).toBeNull()
  })

  it('shows an unsettled hold as reserved, so the guard above is not just silence', () => {
    // The other direction. Without this, deleting the word "Reserved" from the
    // component entirely would satisfy the test above.
    const hold = entry(1, { entry_type: 'HOLD', amount: 10 })
    render(<CreditActivity entries={[hold]} skipped={0} limit={50} total={1} />)
    expect(screen.getByText('Reserved')).toBeInTheDocument()
  })

  it('shows ten rows by default and says which ten', () => {
    const { container } = view()
    expect(container.querySelectorAll('[data-testid^="ledger-row-"]')).toHaveLength(10)
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 to 10 of 43 entries')
  })

  it('walks pages and refuses the ones that do not exist', async () => {
    const user = userEvent.setup()
    view()

    expect(screen.getByLabelText('Previous page')).toBeDisabled()
    await user.click(screen.getByLabelText('Page 5'))
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 41 to 43 of 43 entries')
    // The last page is short: its end is the total, not page × rows.
    expect(screen.getByLabelText('Next page')).toBeDisabled()
    expect(screen.getByLabelText('Previous page')).toBeEnabled()
  })

  it('marks where you are, once', () => {
    view()
    const pager = screen.getByRole('navigation', { name: 'Credit activity pages' })
    const current = within(pager)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('1')
  })

  it('returns to the first page when the row count changes', async () => {
    const user = userEvent.setup()
    view()
    await user.click(screen.getByLabelText('Page 4'))
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 31 to 40')

    // Page 4 of 5 does not exist once there are 25 rows to a page. Staying put
    // would render an empty table under a pager that says you are on page 4.
    await user.selectOptions(screen.getByLabelText('Rows per page'), '25')
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 to 25 of 43 entries')
  })

  it('returns to the first page when a filter changes, and re-counts', async () => {
    const user = userEvent.setup()
    render(
      <CreditActivity
        entries={[
          entry(3, { entry_type: 'TOPUP', amount: 500 }),
          entry(2, { entry_type: 'DEBIT', amount: 30 }),
          entry(1, { entry_type: 'DEBIT', amount: 20 }),
        ]}
        skipped={0}
        limit={50}
        total={3}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Activity type'), 'spent')
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 to 2 of 2 entries that match')
  })

  it('sums what is on screen, with the sign the ledger means', async () => {
    const user = userEvent.setup()
    render(
      <CreditActivity
        entries={[
          entry(3, { entry_type: 'TOPUP', amount: 500 }),
          entry(2, { entry_type: 'DEBIT', amount: 30 }),
          // A hold moves nothing, so it must not appear in either total.
          entry(1, { entry_type: 'HOLD', amount: 90 }),
        ]}
        skipped={0}
        limit={50}
        total={3}
      />,
    )

    expect(screen.getByText('Spent').parentElement).toHaveTextContent('-30')
    expect(screen.getByText('Added').parentElement).toHaveTextContent('+500')
    expect(screen.getByText('Net').parentElement).toHaveTextContent('+470')

    // And the totals follow the filter, rather than describing rows that are
    // no longer listed.
    await user.selectOptions(screen.getByLabelText('Activity type'), 'spent')
    expect(screen.getByText('Added').parentElement).toHaveTextContent('+0')
  })

  it('never calls a windowed sum a lifetime total', () => {
    // 50 read, 200 in the ledger. The tiles are true of what is listed and the
    // sentence has to say so — a "total spent" over the newest slice is a wrong
    // number about somebody's money.
    render(<CreditActivity entries={many(50)} skipped={0} limit={50} total={200} />)
    const scope = screen.getByText(/Credits counted across/)
    expect(scope).toHaveTextContent('the 50 most recent of 200 entries')
    expect(scope).toHaveTextContent('Older activity is not counted here')
    // The words the brief asked for, which this data cannot support.
    expect(screen.queryByText(/Total spent/i)).toBeNull()
  })

  it('says the whole history is here when it is', () => {
    render(<CreditActivity entries={many(12)} skipped={0} limit={50} total={12} />)
    expect(screen.getByText(/Credits counted across/)).toHaveTextContent('all 12 entries')
  })

  it('offers a remedy that works when nothing matches', async () => {
    const user = userEvent.setup()
    view()
    await user.type(screen.getByLabelText('Search credit activity'), 'nothing matches this')

    expect(screen.getByText(/Nothing here matches that/)).toBeInTheDocument()
    // NOT the empty state, and not a reload: the list is fine, the filter is
    // narrow, and clearing it is the one thing that can help.
    await user.click(screen.getByRole('button', { name: 'Clear the filters' }))
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 to 10 of 43 entries')
  })

  it('prints the balance the ledger recorded, not one it added up', () => {
    // `balance_after` is written by `apply_ledger_entry` in the same
    // transaction. A running total computed in the browser over a WINDOW of the
    // history would be wrong for everyone whose ledger is longer than it.
    render(
      <CreditActivity
        entries={[entry(7, { balance_after: 4880 })]}
        skipped={0}
        limit={50}
        total={1}
      />,
    )
    expect(screen.getByRole('columnheader', { name: 'Balance' })).toBeInTheDocument()
    expect(screen.getByText('4,880')).toBeInTheDocument()
  })

  it('draws no pager when everything fits on one page', () => {
    render(<CreditActivity entries={many(6)} skipped={0} limit={50} total={6} />)
    expect(screen.queryByRole('navigation', { name: 'Credit activity pages' })).toBeNull()
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 to 6 of 6 entries')
  })
})
