import { render, screen } from '@testing-library/react'
import { LedgerEntrySchema, type LedgerEntry } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { LedgerTable } from './ledger-table'

/**
 * The ledger's certainty grammar and typography (UI_RULES_v3).
 *
 * The metaphor the whole system is named for: precise, tabular, every entry
 * explained. Certainty applies here differently than it does to a post chip —
 * a ledger row is a RECORD of something that already happened, so "real" is the
 * baseline and the only thing that needs marking is money that has NOT resolved.
 * Painting every settled row with a solid fill would be seven levels of noise
 * saying one thing.
 */

const HOLD_ID = '11111111-1111-4111-8111-111111111111'

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return LedgerEntrySchema.parse({
    id: '99999999-9999-4999-8999-999999999999',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    seq: 100,
    entry_type: 'DEBIT',
    amount: 3,
    balance_after: 97,
    action_type: 'post_variants',
    object_ref: null,
    model_tier: null,
    cogs_usd_est: null,
    idempotency_key: 'k-100',
    settles_entry_id: null,
    hold_expires_at: null,
    actor: null,
    meta: null,
    created_at: '2026-07-19T10:00:00.000Z',
    ...over,
  })
}

const rowFor = (e: LedgerEntry) => {
  render(<LedgerTable entries={[e]} skipped={0} limit={50} />)
  return screen.getByTestId(`ledger-row-${e.seq}`)
}

describe('amounts are mono + tabular so the column aligns', () => {
  test('every amount carries .num', () => {
    const row = rowFor(entry({ amount: 1200 }))

    expect(screen.getByTestId('ledger-amount-100').className.split(/\s+/)).toContain('num')
    expect(row).toBeTruthy()
  })

  test('.num rather than a hand-rolled font-mono + tabular-nums pair', () => {
    rowFor(entry())
    const classes = screen.getByTestId('ledger-amount-100').className

    // `.num` is the token-file class. Duplicating its two properties by hand is
    // how the three mono sites drift apart.
    expect(classes).not.toMatch(/font-mono/)
  })
})

describe('certainty grammar, as a ledger uses it', () => {
  test('a settled entry is real — it happened', () => {
    expect(rowFor(entry({ entry_type: 'DEBIT' })).getAttribute('data-certainty')).toBe('real')
  })

  test('an OPEN hold is committed — reserved, not yet charged', () => {
    const hold = entry({ id: HOLD_ID, entry_type: 'HOLD' })

    expect(rowFor(hold).getAttribute('data-certainty')).toBe('committed')
  })

  test('a settled hold is real, not committed — nothing is reserved any more', () => {
    const hold = entry({ id: HOLD_ID, seq: 10, entry_type: 'HOLD' })
    const debit = entry({ seq: 11, entry_type: 'DEBIT', settles_entry_id: HOLD_ID })
    render(<LedgerTable entries={[debit, hold]} skipped={0} limit={50} />)

    expect(screen.getByTestId('ledger-row-10').getAttribute('data-certainty')).toBe('real')
  })

  test('no ledger row ever claims simulated or proposed', () => {
    // Those two describe things that have not happened. Every row here is a
    // recorded fact; the only open question is whether it has settled.
    for (const type of ['GRANT', 'DEBIT', 'RELEASE', 'ADJUST', 'TOPUP'] as const) {
      const { unmount } = render(
        <LedgerTable entries={[entry({ entry_type: type })]} skipped={0} limit={50} />,
      )
      const level = screen.getByTestId('ledger-row-100').getAttribute('data-certainty')
      expect(['real', 'committed'], type).toContain(level)
      unmount()
    }
  })
})

describe('a RELEASE reads as money returned, not as a failure', () => {
  test('the label says credits came back', () => {
    rowFor(entry({ entry_type: 'RELEASE' }))

    expect(screen.getByText(/credits returned/i)).toBeInTheDocument()
  })

  test('the reason leads with the return, not with the failure', () => {
    rowFor(entry({ entry_type: 'RELEASE' }))
    const why = screen.getByTestId('ledger-why-100').textContent ?? ''

    // "Returned in full. The action did not complete…" — the money first. A
    // refund that opens on the failure reads like being told off for a mistake
    // the user did not make.
    expect(why).toMatch(/^returned in full/i)
    expect(why).toMatch(/not charged/i)
  })

  test('it is never toned as a danger/error row', () => {
    rowFor(entry({ entry_type: 'RELEASE' }))

    expect(screen.getByTestId('ledger-amount-100').className).not.toMatch(/danger/)
  })
})

describe('the blade marks Sahoda acting on its own', () => {
  const blades = () => document.querySelectorAll('.blade')

  test('a job actor gets a blade', () => {
    rowFor(entry({ entry_type: 'RELEASE', actor: 'job:hold_sweep' }))

    expect(blades()).toHaveLength(1)
  })

  test('a user-triggered entry gets none', () => {
    rowFor(entry({ actor: null }))

    expect(blades()).toHaveLength(0)
  })

  test('a provider actor is NOT Sahoda acting — no blade', () => {
    // `provider:cashfree` is a payment processor confirming a purchase the user
    // made. That is the user's action, settled by a third party.
    rowFor(entry({ entry_type: 'GRANT', actor: 'provider:cashfree' }))

    expect(blades()).toHaveLength(0)
  })

  test('an arbitrary actor string never earns a blade', () => {
    for (const actor of ['user_abc', 'jobs', 'job', 'JOB:x', '', 'not-job:hold_sweep']) {
      const { unmount } = render(
        <LedgerTable entries={[entry({ actor })]} skipped={0} limit={50} />,
      )
      expect(document.querySelectorAll('.blade'), actor).toHaveLength(0)
      unmount()
    }
  })

  test('the blade is labelled — it is meaning, not decoration', () => {
    rowFor(entry({ entry_type: 'RELEASE', actor: 'job:hold_sweep' }))

    expect(screen.getByLabelText(/sahoda/i)).toBeTruthy()
  })
})

describe('a correction names what it corrects, from metadata only', () => {
  let unique = 0
  const corrective = (seq: number, amount: number, reverses?: number, replaces?: number) =>
    entry({
      // Distinct, VALID uuids — the schema parses `id`, so a seq-derived string
      // longer than 8 hex chars fails before the component is ever rendered.
      id: `1111111${(unique++).toString(16)}-1111-4111-8111-111111111111`,
      seq,
      entry_type: 'ADJUST',
      amount,
      meta: {
        correction: 'fix-1',
        ...(reverses === undefined ? {} : { reverses_seq: reverses }),
        ...(replaces === undefined ? {} : { replaces_seq: replaces }),
      },
    })

  test('the group names the entry it acts on', () => {
    render(
      <LedgerTable
        entries={[corrective(5597, -100, 5374), corrective(5596, 100, undefined, 5374)]}
        skipped={0}
        limit={50}
      />,
    )

    expect(screen.getByText(/5374/)).toBeInTheDocument()
  })

  test('with no recorded reference it says nothing rather than guessing', () => {
    // The linkage is optional in `meta`. A correction whose target was never
    // recorded must not invent one — and must still group.
    render(
      <LedgerTable
        entries={[corrective(5597, -100), corrective(5596, 100)]}
        skipped={0}
        limit={50}
      />,
    )

    expect(screen.queryByText(/corrects entry/i)).not.toBeInTheDocument()
  })

  test('it never renders a row that is not on the page', () => {
    // Only the seq NUMBER is shown. Naming the corrected entry must never mean
    // fetching it or reconstructing its label from thin air.
    render(<LedgerTable entries={[corrective(5597, -100, 5374)]} skipped={0} limit={50} />)

    expect(screen.queryByTestId('ledger-row-5374')).not.toBeInTheDocument()
    expect(screen.getByText(/5374/)).toBeInTheDocument()
  })
})
