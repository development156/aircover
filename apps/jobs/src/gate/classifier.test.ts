import { describe, expect, it } from 'vitest'
import { GATE_CLASSIFY_MAX_CHARS, GATE_CLASSIFY_MAX_RULES } from '@sahoda/shared'
import type { GateClassifyInput, RunTask } from '@sahoda/shared'

import { createGateClassifier } from './classifier'

const ctx = { workspaceId: 'ws-1', traceId: 'web:run-1' }

const rules = (n: number): GateClassifyInput['rules'] =>
  Array.from({ length: n }, (_, i) => ({
    id: `rule.${i}`,
    tier: 'owner' as const,
    statement: `Rule ${i}.`,
  }))

const input = (over: Partial<GateClassifyInput> = {}): GateClassifyInput => ({
  channel: 'x',
  text: 'Fresh samosas from 4pm today.',
  rules: rules(2),
  ...over,
})

/** A `RunTask` that resolves to whatever the test hands it. */
const runTaskOf = (value: unknown): RunTask => (async () => value) as unknown as RunTask

describe('createGateClassifier — every exit is findings or a hold', () => {
  it('returns the findings the mesh parsed, and the model that served them', async () => {
    const classifier = createGateClassifier({
      runTask: runTaskOf({
        ok: true,
        data: { findings: [{ ruleId: 'rule.0', verdict: 'trips' }] },
        usage: { model: 'anthropic/claude-sonnet-5' },
      }),
    })

    const outcome = await classifier.classify(input(), ctx)

    expect(outcome).toEqual({
      ran: true,
      // The model that ANSWERED, from telemetry. The fallback chain can serve a
      // different one than the route asked for.
      model: 'anthropic/claude-sonnet-5',
      findings: [{ ruleId: 'rule.0', verdict: 'trips' }],
    })
  })

  it('reads a double zod failure as unparseable, not as an outage', async () => {
    // An outage and a bad prompt need different people looking at them, so the
    // audit row has to be able to tell them apart.
    const classifier = createGateClassifier({
      runTask: runTaskOf({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '', traceId: '' },
      }),
    })

    expect(await classifier.classify(input(), ctx)).toEqual({ ran: false, state: 'unparseable' })
  })

  it('reads a provider failure as unavailable', async () => {
    const classifier = createGateClassifier({
      runTask: runTaskOf({
        ok: false,
        error: { code: 'PROVIDER_ERROR', message: '', traceId: '' },
      }),
    })

    expect(await classifier.classify(input(), ctx)).toEqual({ ran: false, state: 'unavailable' })
  })

  it('turns a throw into a hold rather than letting it reach the publish path', async () => {
    const classifier = createGateClassifier({
      runTask: (async () => {
        throw new Error('socket hang up')
      }) as unknown as RunTask,
    })

    expect(await classifier.classify(input(), ctx)).toEqual({ ran: false, state: 'unavailable' })
  })

  it('times out rather than hanging inside the publish wall', async () => {
    const classifier = createGateClassifier({
      runTask: (() => new Promise(() => {})) as unknown as RunTask,
      timeoutMs: 10,
    })

    expect(await classifier.classify(input(), ctx)).toEqual({ ran: false, state: 'timeout' })
  })
})

describe('createGateClassifier — the bounds', () => {
  const neverCalled: RunTask = (() => {
    throw new Error('the classifier should not have been called')
  }) as unknown as RunTask

  it('holds rather than carrying only the rules that fit', async () => {
    // Truncating the input to a checker converts an unchecked rule into a passed
    // one — a rule with no finding is indistinguishable from one that came back
    // clear.
    const classifier = createGateClassifier({ runTask: neverCalled })

    expect(
      await classifier.classify(input({ rules: rules(GATE_CLASSIFY_MAX_RULES + 1) }), ctx),
    ).toEqual({ ran: false, state: 'over-bounds' })
  })

  it('holds rather than checking a truncated post', async () => {
    const classifier = createGateClassifier({ runTask: neverCalled })

    expect(
      await classifier.classify(input({ text: 'x'.repeat(GATE_CLASSIFY_MAX_CHARS + 1) }), ctx),
    ).toEqual({ ran: false, state: 'over-bounds' })
  })

  it('skips the call when layer 2 left nothing to ask about', async () => {
    // The one skip that is legitimately a pass — and it is a distinct state from
    // every failure, so the audit row can say which happened.
    const classifier = createGateClassifier({ runTask: neverCalled })

    expect(await classifier.classify(input({ rules: [] }), ctx)).toEqual({
      ran: false,
      state: 'skipped-no-rules',
    })
  })
})
