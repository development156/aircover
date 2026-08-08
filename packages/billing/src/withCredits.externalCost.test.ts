import { describe, it, expect, vi } from 'vitest'
import type { ApplyLedgerInput } from '@sahoda/shared'
import { createWithCredits, type ExternalCostContext } from './withCredits'
import type { LedgerApplyResult, LedgerBalance, LedgerPort, LatestHold } from './ledger/port'

/**
 * The per-post external-cost SEAM (Launch Plan §5 Slice 3).
 *
 * Nothing in the product fills this in yet, and that is the point of testing it now: an
 * unused seam is where a defect hides indefinitely. Every test below is about the same
 * question — can an accounting annotation damage a charge? The answer has to be no in every
 * failure mode, because by the time the resolver runs the customer's work has ALREADY been
 * done and the credits have already been held.
 */

/** Minimal port: records what reached app.apply_ledger_entry, no balance arithmetic. */
class RecordingPort implements LedgerPort {
  readonly calls: ApplyLedgerInput[] = []
  private seq = 0

  async apply(input: ApplyLedgerInput): Promise<LedgerApplyResult> {
    this.calls.push(input)
    return { entry: { id: `entry-${++this.seq}`, balanceAfter: 97 }, replayed: false }
  }
  async latestHold(): Promise<LatestHold | null> {
    return null
  }
  async balance(): Promise<LedgerBalance> {
    return { total: 100, held: 0 }
  }

  debit(): ApplyLedgerInput | undefined {
    return this.calls.find((c) => c.entryType === 'DEBIT')
  }
}

const OPTS = { workspaceId: 'ws-1', action: 'post_variants' as const, objectRef: 'post-42' }
const BASE = { newTraceId: () => 'trace-fixed' }

describe('withCredits — external cost is absent unless a producer supplies one', () => {
  /**
   * The regression guard for the whole seam: adding it must not have changed a single
   * existing DEBIT. `cogs_usd_est` stayed null before this landed and stays null after.
   */
  it('writes no cogs when no resolver is configured', async () => {
    const port = new RecordingPort()
    await createWithCredits(port, BASE)(OPTS, async () => 'ok')
    expect(port.debit()?.cogsUsdEst).toBeUndefined()
  })

  it('threads a resolved USD figure onto the settling DEBIT', async () => {
    const port = new RecordingPort()
    await createWithCredits(port, { ...BASE, externalCostUsd: () => 0.0042 })(
      OPTS,
      async () => 'ok',
    )
    expect(port.debit()?.cogsUsdEst).toBe(0.0042)
  })

  it('puts the cost on the DEBIT, never on the HOLD', async () => {
    const port = new RecordingPort()
    await createWithCredits(port, { ...BASE, externalCostUsd: () => 0.5 })(OPTS, async () => 'ok')
    const hold = port.calls.find((c) => c.entryType === 'HOLD')
    // A HOLD is a reservation taken BEFORE the work — nothing has been spent externally yet,
    // and a cost written there would be double-counted against the DEBIT that settles it.
    expect(hold?.cogsUsdEst).toBeUndefined()
    expect(port.debit()?.cogsUsdEst).toBe(0.5)
  })

  it('tells the resolver which action and object it is pricing', async () => {
    const port = new RecordingPort()
    const seen: ExternalCostContext[] = []
    await createWithCredits(port, {
      ...BASE,
      externalCostUsd: (ctx) => {
        seen.push(ctx)
        return 1
      },
    })(OPTS, async () => 'ok')

    expect(seen).toEqual([
      { workspaceId: 'ws-1', action: 'post_variants', objectRef: 'post-42', creditsCharged: 3 },
    ])
  })

  it('awaits an async resolver — a per-post cost is usually a lookup', async () => {
    const port = new RecordingPort()
    await createWithCredits(port, {
      ...BASE,
      externalCostUsd: async () => {
        await Promise.resolve()
        return 0.25
      },
    })(OPTS, async () => 'ok')
    expect(port.debit()?.cogsUsdEst).toBe(0.25)
  })

  /** "This cost us nothing" is a real answer and must survive as one. */
  it('keeps a genuine zero rather than collapsing it into "unknown"', async () => {
    const port = new RecordingPort()
    await createWithCredits(port, { ...BASE, externalCostUsd: () => 0 })(OPTS, async () => 'ok')
    expect(port.debit()?.cogsUsdEst).toBe(0)
  })

  it('runs the resolver only AFTER the wrapped action succeeded', async () => {
    const port = new RecordingPort()
    const order: string[] = []
    await createWithCredits(port, {
      ...BASE,
      externalCostUsd: () => {
        order.push('resolve')
        return 1
      },
    })(OPTS, async () => {
      order.push('run')
      return 'ok'
    })
    // Reversed, a resolver would be pricing work that has not happened — and would still
    // have run for an action that then failed and was released.
    expect(order).toEqual(['run', 'resolve'])
  })

  it('does not run the resolver at all when the action failed and was released', async () => {
    const port = new RecordingPort()
    const resolver = vi.fn(() => 1)
    const result = await createWithCredits(port, { ...BASE, externalCostUsd: resolver })(
      OPTS,
      async () => {
        throw new Error('model timeout')
      },
    )
    expect(result.ok).toBe(false)
    expect(resolver).not.toHaveBeenCalled()
    expect(port.calls.map((c) => c.entryType)).toEqual(['HOLD', 'RELEASE'])
  })
})

describe('withCredits — a broken cost resolver cannot damage the charge', () => {
  /**
   * THE ONE THAT MATTERS. The action has run, the customer's work exists, the hold is open.
   * A reporting lookup that throws here must not turn that into a failure — it would look to
   * the customer exactly like their generation was lost, to make a margin column tidier.
   */
  it('still DEBITs, and still returns ok, when the resolver throws', async () => {
    const port = new RecordingPort()
    const onError = vi.fn()
    const result = await createWithCredits(port, {
      ...BASE,
      onError,
      externalCostUsd: () => {
        throw new Error('cost service unreachable')
      },
    })(OPTS, async () => 'GENERATED')

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.data).toBe('GENERATED')
    expect(port.calls.map((c) => c.entryType)).toEqual(['HOLD', 'DEBIT'])
    expect(port.debit()?.cogsUsdEst).toBeUndefined()
    // The operator still hears about it; the customer never does.
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[1]).toBe('trace-fixed')
  })

  it('survives a rejected promise the same way', async () => {
    const port = new RecordingPort()
    const result = await createWithCredits(port, {
      ...BASE,
      externalCostUsd: async () => {
        throw new Error('timeout')
      },
    })(OPTS, async () => 'ok')

    expect(result.ok).toBe(true)
    expect(port.debit()?.cogsUsdEst).toBeUndefined()
  })

  /**
   * NaN and Infinity are the dangerous ones: they are `typeof 'number'`, so a naive guard
   * passes them straight to a `numeric` column, and Postgres rejects the value — failing the
   * DEBIT itself. That is the annotation breaking the settle, the exact inversion this seam
   * must never allow.
   */
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['a negative cost', -1],
  ])('ignores %s and settles with no cogs', async (_label, value) => {
    const port = new RecordingPort()
    const result = await createWithCredits(port, { ...BASE, externalCostUsd: () => value })(
      OPTS,
      async () => 'ok',
    )

    expect(result.ok).toBe(true)
    expect(port.debit()?.cogsUsdEst).toBeUndefined()
  })

  it('ignores a resolver that returns a non-number', async () => {
    const port = new RecordingPort()
    const result = await createWithCredits(port, {
      ...BASE,
      // A producer wiring this up from an untyped JSON response is the realistic way a
      // string arrives here.
      externalCostUsd: () => '0.05' as unknown as number,
    })(OPTS, async () => 'ok')

    expect(result.ok).toBe(true)
    expect(port.debit()?.cogsUsdEst).toBeUndefined()
  })
})
