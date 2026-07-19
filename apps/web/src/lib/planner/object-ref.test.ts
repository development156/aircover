import { describe, expect, test } from 'vitest'

import { newPlanWeekRef } from './object-ref'

const WS = '22222222-2222-4222-8222-222222222222'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newPlanWeekRef', () => {
  test('mints a workspace-scoped plan_week ref', () => {
    const ref = newPlanWeekRef(WS)

    const [ws, ns, uuid] = ref.split(':')
    expect(ws).toBe(WS)
    expect(ns).toBe('plan_week')
    expect(uuid).toMatch(UUID_RE)
  })

  test('is fresh per invocation — a stable ref would replay a spent HOLD/DEBIT', () => {
    expect(newPlanWeekRef(WS)).not.toBe(newPlanWeekRef(WS))
  })
})
