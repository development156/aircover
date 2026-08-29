import { describe, it, expect } from 'vitest'

import { resolveObjectRef } from './resolve-object-ref'

/**
 * The key that decides whether a customer pays twice for one Brand Brain.
 *
 * `withCredits` keys exactly-once on `(action, objectRef)`, and billing's
 * `nextAttempt` REUSES an attempt that settled by DEBIT, replaying the same
 * charge rather than taking a second one. So this string is the whole mechanism:
 * the same ref means "the thing you already paid for", a different ref means "a
 * new, intended charge".
 */

describe('resolveObjectRef', () => {
  /**
   * THE DEFECT THIS FIXES. A customer with a brain who re-runs onboarding is
   * charged when the build starts, and the brain is written only when they press
   * the last button. Closing the tab in between took the credits and left the
   * brain unchanged. Now the retry carries the same ref, so the ledger replays
   * the charge it already took.
   */
  it('is the same across a paid attempt that was never saved', () => {
    expect(resolveObjectRef('ws-1', 3)).toBe(resolveObjectRef('ws-1', 3))
  })

  /** Saving bumps the version, which opens a new, intended charge. */
  it('changes once the brain they paid for has been saved', () => {
    expect(resolveObjectRef('ws-1', 4)).not.toBe(resolveObjectRef('ws-1', 3))
  })

  /** One workspace's charge key can never settle another's. */
  it('never collides across workspaces', () => {
    expect(resolveObjectRef('ws-1', 3)).not.toBe(resolveObjectRef('ws-2', 3))
  })

  /**
   * No brain yet is its own key rather than a crash. That path is free today, so
   * nothing charges on it, but the ref must still be well formed if the free
   * rule ever changes.
   */
  it('has a key for a workspace with no brain yet', () => {
    expect(resolveObjectRef('ws-1', null)).toBe(resolveObjectRef('ws-1', null))
    expect(resolveObjectRef('ws-1', null)).not.toBe(resolveObjectRef('ws-1', 1))
  })

  /**
   * SERVER-DERIVED, and the header says why: `withCredits` replays a spent key,
   * so a ref a request body could reach would let any signed-in caller run
   * unlimited paid resolves against one charge. Both inputs come from the
   * database. This asserts the shape a caller cannot influence.
   */
  it('is built only from the workspace and the version', () => {
    expect(resolveObjectRef('ws-1', 3)).toBe('ws-1:brain-v3')
    expect(resolveObjectRef('ws-1', null)).toBe('ws-1:brain-v0')
  })
})
