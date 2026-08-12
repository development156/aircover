import { describe, expect, test } from 'vitest'

import {
  RESET_CLEARS,
  RESET_KEEPS,
  RESET_NEVER_GLOBAL,
  resetConfirmationMatches,
} from './reset-scope'

const cleared = new Set(RESET_CLEARS.map((entry) => entry.table))
const kept = new Set(RESET_KEEPS.map((entry) => entry.table))

describe('what a reset may touch', () => {
  test('the money record is never cleared', () => {
    // credit_ledger is append-only and written only through apply_ledger_entry.
    // Clearing it destroys the financial audit trail and every refund.
    for (const table of ['credit_ledger', 'credit_balances', 'subscriptions']) {
      expect(cleared.has(table), table).toBe(false)
      expect(kept.has(table), table).toBe(true)
    }
  })

  test('access and identity survive', () => {
    // The chosen scope destroys work, never the ability to keep working.
    for (const table of ['connections', 'workspace_members', 'workspace_themes']) {
      expect(cleared.has(table), table).toBe(false)
    }
  })

  test('GLOBAL catalogues are in neither list', () => {
    // `plans` and `guide_tours` carry `using (true)` policies — they belong to
    // no tenant. A per-workspace reset naming them would delete the product's
    // own configuration for every customer at once.
    for (const table of RESET_NEVER_GLOBAL) {
      expect(cleared.has(table), table).toBe(false)
      expect(kept.has(table), table).toBe(false)
    }
  })

  test('append-only evidence is kept, not cleared', () => {
    // post_publish_logs is the only proof a post really reached a platform.
    expect(cleared.has('post_publish_logs')).toBe(false)
    expect(cleared.has('audit_logs')).toBe(false)
  })

  test('the Brand Brain IS cleared — it is the headline of a reset', () => {
    expect(cleared.has('brand_memory')).toBe(true)
    expect(cleared.has('memory_events')).toBe(true)
  })

  test('no table appears in both lists', () => {
    for (const table of cleared) expect(kept.has(table), table).toBe(false)
  })

  test('every entry carries copy — the dialog renders these verbatim', () => {
    for (const entry of [...RESET_CLEARS, ...RESET_KEEPS]) {
      expect(entry.label.length, entry.table).toBeGreaterThan(8)
    }
  })
})

describe('resetConfirmationMatches', () => {
  test('accepts the exact name', () => {
    expect(resetConfirmationMatches('Acme Chai', 'Acme Chai')).toBe(true)
  })

  test('forgives case and surrounding space, nothing else', () => {
    expect(resetConfirmationMatches('  acme chai ', 'Acme Chai')).toBe(true)
    expect(resetConfirmationMatches('Acme  Chai', 'Acme Chai')).toBe(false)
    expect(resetConfirmationMatches('Acme', 'Acme Chai')).toBe(false)
  })

  test('an empty workspace name can never be confirmed', () => {
    // Otherwise a blank name and a blank box would arm the most destructive
    // control in the console.
    expect(resetConfirmationMatches('', '')).toBe(false)
    expect(resetConfirmationMatches('   ', '  ')).toBe(false)
  })
})
