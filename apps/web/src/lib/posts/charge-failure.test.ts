import { creditCost } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { chargeFailureState, FAILURE_REASON, type ChargeFailureInput } from './charge-failure'

/** A `withCredits` PROVIDER_ERROR carries a message we must never surface. */
const providerError: { code: string; message: string; details?: unknown } = {
  code: 'PROVIDER_ERROR',
  message: 'anthropic 529 overloaded_error: upstream pool reset on org sk-ant-abc123',
}

function input(overrides: Partial<ChargeFailureInput> = {}): ChargeFailureInput {
  return {
    error: providerError,
    action: 'post_variants',
    delivered: false,
    reason: null,
    ...overrides,
  }
}

describe('chargeFailureState — insufficient balance', () => {
  test('routes to top-up with the exact shortfall from details', () => {
    const state = chargeFailureState(
      input({
        error: { code: 'CREDIT_INSUFFICIENT', details: { required: 3, available: 1 } },
      }),
    )
    expect(state).toEqual({ ok: false, insufficient: true, required: 3, available: 1 })
  })

  test('falls back to the configured price when details are missing or malformed', () => {
    const missing = chargeFailureState(input({ error: { code: 'CREDIT_INSUFFICIENT' } }))
    expect(missing).toEqual({
      ok: false,
      insufficient: true,
      required: creditCost('post_variants'),
      available: 0,
    })

    const malformed = chargeFailureState(
      input({ error: { code: 'CREDIT_INSUFFICIENT', details: { required: 'three' } } }),
    )
    expect(malformed).toEqual({
      ok: false,
      insufficient: true,
      required: creditCost('post_variants'),
      available: 0,
    })
  })

  test('prices the shortfall per action, never a literal', () => {
    const state = chargeFailureState(
      input({ action: 'caption_rewrite', error: { code: 'CREDIT_INSUFFICIENT' } }),
    )
    expect(state).toMatchObject({ insufficient: true, required: creditCost('caption_rewrite') })
  })
})

describe('chargeFailureState — callback delivered (charge unconfirmable)', () => {
  test('never claims the user was not charged', () => {
    const state = chargeFailureState(input({ delivered: true }))
    expect(state).toMatchObject({ ok: false, insufficient: false })
    if (state.insufficient) throw new Error('expected a message state')
    expect(state.message).not.toMatch(/not charged|nothing was charged|no credits were charged/i)
  })

  test('says the charge could not be confirmed and points at the wallet', () => {
    const state = chargeFailureState(input({ delivered: true }))
    if (state.insufficient) throw new Error('expected a message state')
    expect(state.message).toMatch(/could not confirm/i)
    expect(state.message).toMatch(/wallet|balance/i)
  })

  test('does not invite a blind retry — a retry here is a second charge', () => {
    const state = chargeFailureState(input({ delivered: true }))
    if (state.insufficient) throw new Error('expected a message state')
    expect(state.message).not.toMatch(/try again/i)
  })

  test('a stale stashed reason cannot resurrect the not-charged claim', () => {
    // Defensive: `delivered` wins over any reason the caller left set.
    const state = chargeFailureState(input({ delivered: true, reason: FAILURE_REASON.NO_VARIANTS }))
    if (state.insufficient) throw new Error('expected a message state')
    expect(state.message).not.toMatch(/not charged/i)
  })
})

describe('chargeFailureState — callback threw (hold released)', () => {
  test('states no charge was made, because the RELEASE really ran', () => {
    const state = chargeFailureState(input({ delivered: false }))
    if (state.insufficient) throw new Error('expected a message state')
    expect(state.message).toMatch(/not charged/i)
  })

  test('surfaces the vetted reason instead of discarding it', () => {
    const noVariants = chargeFailureState(
      input({ delivered: false, reason: FAILURE_REASON.NO_VARIANTS }),
    )
    if (noVariants.insufficient) throw new Error('expected a message state')
    expect(noVariants.message).toContain(FAILURE_REASON.NO_VARIANTS)
    expect(noVariants.message).toMatch(/not charged/i)

    const emptyRewrite = chargeFailureState(
      input({ delivered: false, reason: FAILURE_REASON.EMPTY_REWRITE }),
    )
    if (emptyRewrite.insufficient) throw new Error('expected a message state')
    expect(emptyRewrite.message).toContain(FAILURE_REASON.EMPTY_REWRITE)
  })

  test('falls back to a generic line when there is no reason', () => {
    const state = chargeFailureState(input({ delivered: false, reason: null }))
    if (state.insufficient) throw new Error('expected a message state')
    expect(state.message).toMatch(/could not complete/i)
    expect(state.message).toMatch(/not charged/i)
  })
})

describe('chargeFailureState — provider text never leaks', () => {
  test('the error message is not surfaced on any path', () => {
    const cases = [
      chargeFailureState(input({ delivered: true })),
      chargeFailureState(input({ delivered: false })),
      chargeFailureState(input({ delivered: false, reason: FAILURE_REASON.MESH_ERROR })),
    ]
    for (const state of cases) {
      if (state.insufficient) throw new Error('expected a message state')
      expect(state.message).not.toMatch(/anthropic|529|overloaded|sk-ant|pool reset/i)
    }
  })

  test('an unvetted reason is dropped, not shown', () => {
    // A caller forwarding `result.error.message` must not be able to print it.
    const leaked = 'openai: 400 invalid_request_error — context length 128000 exceeded'
    const state = chargeFailureState(input({ delivered: false, reason: leaked }))
    if (state.insufficient) throw new Error('expected a message state')
    expect(state.message).not.toContain(leaked)
    expect(state.message).not.toMatch(/openai|invalid_request_error|context length/i)
    expect(state.message).toMatch(/could not complete/i)
  })
})
