import { describe, expect, test } from 'vitest'

import { newSiteGenerateRef } from './object-ref'

const WS = '22222222-2222-4222-8222-222222222222'

describe('newSiteGenerateRef', () => {
  test('mints a workspace-scoped site_generate ref', () => {
    const [ws, ns] = newSiteGenerateRef(WS).split(':')
    expect(ws).toBe(WS)
    expect(ns).toBe('site_generate')
  })

  test('is fresh per invocation — a stable ref would replay a spent HOLD/DEBIT', () => {
    expect(newSiteGenerateRef(WS)).not.toBe(newSiteGenerateRef(WS))
  })
})
