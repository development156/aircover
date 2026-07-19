import { describe, expect, test } from 'vitest'

import { newCaptionRewriteRef, newVariantsObjectRef } from './object-ref'

const WORKSPACE = '11111111-1111-4111-8111-111111111111'

describe('newVariantsObjectRef', () => {
  test('is namespaced by the workspace so one tenant cannot reach another key', () => {
    expect(newVariantsObjectRef(WORKSPACE).startsWith(`${WORKSPACE}:`)).toBe(true)
  })

  test('returns a different ref every call so a deliberate regenerate is charged again', () => {
    // withCredits keys exactly-once on (action, objectRef) and REUSES the attempt
    // when the last hold settled by DEBIT. A stable ref would therefore replay the
    // spent key: no charge, but the paid model call still runs.
    const refs = new Set(Array.from({ length: 200 }, () => newVariantsObjectRef(WORKSPACE)))
    expect(refs.size).toBe(200)
  })

  test('never returns a ref containing the post id, which the client controls', () => {
    // Guards the shape of the API itself: there is no parameter a request body reaches.
    expect(newVariantsObjectRef.length).toBe(1)
  })
})

describe('newCaptionRewriteRef', () => {
  test('is namespaced by the workspace', () => {
    expect(newCaptionRewriteRef(WORKSPACE).startsWith(`${WORKSPACE}:`)).toBe(true)
  })

  test('returns a different ref every call', () => {
    const refs = new Set(Array.from({ length: 200 }, () => newCaptionRewriteRef(WORKSPACE)))
    expect(refs.size).toBe(200)
  })

  test('cannot collide with a variants ref for the same workspace', () => {
    // Distinct namespaces keep one action's holdKey from ever matching the other's,
    // even if a UUID were somehow repeated.
    const variants = newVariantsObjectRef(WORKSPACE)
    const rewrite = newCaptionRewriteRef(WORKSPACE)
    expect(variants).not.toBe(rewrite)
    expect(variants.split(':')[1]).not.toBe(rewrite.split(':')[1])
  })
})
