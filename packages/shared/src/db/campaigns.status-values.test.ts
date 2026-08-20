import { describe, it, expect } from 'vitest'

import {
  CampaignInsertSchema,
  CampaignSchema,
  CampaignStatusSchema,
  CampaignUpdateSchema,
} from './campaigns'

/**
 * A guard nobody has watched fail is not a guard.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * The screen that stood in for campaigns until now rendered four filter chips:
 * "All · Active · Draft · **Completed**". Three of those words are values the
 * column accepts. The fourth is not: the database check constraint reads
 * `status in ('draft', 'active', 'finished', 'cancelled')`, and it says
 * `finished`.
 *
 * That gap is silent in the worst possible way. A filter built from the chip's
 * label matches zero rows for every workspace forever, and zero rows is exactly
 * what a customer with no finished campaigns would also see — so the bug wears
 * the costume of a correct empty state and nothing ever reports it.
 *
 * So this file does not merely assert that the good value passes. It EXECUTES
 * the bad one and prints what each spelling actually parses to, because a red
 * line in a report is the only thing that stops the next session copying the
 * chip's label into a query.
 */

/**
 * `packages/shared` compiles with neither the DOM nor the Node lib, so `console`
 * is not a declared global in this package. Reached through `globalThis` rather
 * than widening the whole package's `lib` for one test file — the printout is
 * the point of the file and dropping it would leave a guard nobody has watched
 * fail.
 */
const out = (globalThis as unknown as { console: { log: (...args: unknown[]) => void } }).console

const UUID = '00000000-0000-0000-0000-000000000000'

/** The four the migration's check constraint names, in its order. */
const DATABASE_VALUES = ['draft', 'active', 'finished', 'cancelled'] as const

/** Spellings that read like status words and are not. `Completed` is the live one. */
const NOT_VALUES = ['Completed', 'completed', 'Active', 'archived', 'paused', ''] as const

function row(status: string) {
  return {
    id: UUID,
    workspace_id: UUID,
    name: 'Diwali week',
    objective: null,
    status,
    starts_at: null,
    ends_at: null,
    created_by: 'user_1',
    created_at: '2026-08-19T00:00:00Z',
    updated_at: '2026-08-19T00:00:00Z',
  }
}

describe('campaign status vocabulary matches the database check constraint', () => {
  it('parses every value the constraint names, and prints each one', () => {
    const parsed = DATABASE_VALUES.map((value) => {
      const result = CampaignSchema.safeParse(row(value))
      return { value, ok: result.success, parsedTo: result.success ? result.data.status : null }
    })
    out.log('[campaign status] accepted:', JSON.stringify(parsed))

    for (const entry of parsed) {
      expect(entry.ok, `${entry.value} must parse — the column accepts it`).toBe(true)
      expect(entry.parsedTo).toBe(entry.value)
    }
  })

  it('REFUSES "Completed" — the word the old placeholder\'s chip carried', () => {
    const result = CampaignSchema.safeParse(row('Completed'))
    out.log(
      '[campaign status] "Completed" →',
      result.success ? 'PARSED (guard is broken)' : `refused: ${result.error.issues[0]?.message}`,
    )
    expect(result.success).toBe(false)
  })

  it('refuses every near-miss spelling, one printed line each', () => {
    const refused = NOT_VALUES.map((value) => ({
      value,
      ok: CampaignSchema.safeParse(row(value)).success,
    }))
    out.log('[campaign status] refused:', JSON.stringify(refused))

    for (const entry of refused) {
      expect(entry.ok, `"${entry.value}" must NOT parse`).toBe(false)
    }
  })

  it('the enum and the constraint hold the same four values, in the same set', () => {
    expect([...CampaignStatusSchema.options].sort()).toEqual([...DATABASE_VALUES].sort())
  })
})

describe('campaign name is refused where the column would refuse it', () => {
  it('rejects a name that is blank or only whitespace, before Postgres has to', () => {
    for (const name of ['', '   ', '\t\n']) {
      const result = CampaignInsertSchema.safeParse({
        workspace_id: UUID,
        name,
        created_by: 'user_1',
      })
      out.log(`[campaign name] ${JSON.stringify(name)} →`, result.success ? 'PARSED' : 'refused')
      expect(result.success).toBe(false)
    }
  })

  it('trims a name before it is stored, so two campaigns cannot differ by a space', () => {
    const result = CampaignInsertSchema.parse({
      workspace_id: UUID,
      name: '  Diwali week  ',
      created_by: 'user_1',
    })
    expect(result.name).toBe('Diwali week')
    expect(result.status).toBe('draft')
  })
})

describe('the shape carries no figure it cannot produce', () => {
  /**
   * Budget, spend, ROAS, reach, conversions and health are what the reference
   * design shows on a campaign card, and not one of them has a source. This
   * asserts they are ABSENT from the contract rather than nullable in it — a
   * nullable field puts the word in the type, and a word in the type becomes a
   * slot on a screen.
   */
  const FORBIDDEN = ['budget', 'spend', 'spent', 'roas', 'reach', 'conversions', 'health']

  it('has no key for a number nothing can compute', () => {
    const keys = Object.keys(CampaignSchema.shape)
    out.log('[campaign shape] keys:', keys.join(', '))
    for (const forbidden of FORBIDDEN) {
      expect(keys, `${forbidden} has no data source and must not be in the contract`).not.toContain(
        forbidden,
      )
    }
  })

  it('will not accept one smuggled in through an update', () => {
    const result = CampaignUpdateSchema.parse({ name: 'Diwali week', budget: 5000 })
    expect(result).not.toHaveProperty('budget')
  })
})
