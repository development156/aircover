import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

import { newResolveObjectRef } from './resolve-object-ref'

describe('newResolveObjectRef', () => {
  test('namespaces the ledger key by workspace', () => {
    expect(newResolveObjectRef('ws-1').startsWith('ws-1:')).toBe(true)
  })

  test('is fresh per call — a spent ledger key is never reused', () => {
    const refs = new Set(Array.from({ length: 50 }, () => newResolveObjectRef('ws-1')))
    expect(refs.size).toBe(50)
  })

  test('takes only a workspace id — no parameter a request body could reach', () => {
    expect(newResolveObjectRef.length).toBe(1)
  })
})

/**
 * Regression guard for the money path: the resolve action must NEVER derive its
 * ledger idempotency key from client input. Replaying a spent objectRef makes
 * withCredits replay the HOLD+DEBIT while still running the paid model call, so
 * a client-controlled value is an unlimited-free-resolve hole. This asserts on
 * the source because the property is about what the action does NOT read, which
 * no amount of mocking can prove.
 */
describe('resolve action ledger key provenance', () => {
  const source = readFileSync(
    new URL('../../app/actions/brand-resolve.ts', import.meta.url),
    'utf8',
  )

  test('never reads objectRef (or a trace id) from formData', () => {
    expect(source).not.toMatch(/objectRef['"]\s*\)/) // e.g. field(formData, 'objectRef')
    expect(source).not.toMatch(/formData\.get\(\s*['"]objectRef['"]/)
    expect(source).not.toMatch(/formData\.get\(\s*['"]traceId['"]/)
  })

  test('derives the ledger key from the server-only helper', () => {
    expect(source).toMatch(/newResolveObjectRef\(\s*workspace\.id\s*\)/)
  })
})
