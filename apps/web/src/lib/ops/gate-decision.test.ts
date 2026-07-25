import { describe, expect, it } from 'vitest'

import { provesOpsAdmin } from './gate-decision'

describe('provesOpsAdmin — the /admin gate fails closed', () => {
  it('admits a caller who can see a seat', () => {
    // Arrange — RLS only returns rows to an active ops admin, so one row is proof.
    const body = [{ id: '4f6b6e0e-6b5f-4a3f-8f6e-2c4f9a1b7d51' }]

    // Act / Assert
    expect(provesOpsAdmin(body)).toBe(true)
  })

  it('refuses everyone when NO seats are seeded at all', () => {
    // This is the empty-ADMIN_BOOTSTRAP_EMAILS case. A zero-seat deployment must
    // 404 for every visitor, including the very first one. There is no
    // first-run bootstrap path, on purpose: that is how admin consoles ship open.
    expect(provesOpsAdmin([])).toBe(false)
  })

  it('refuses when the caller is authenticated but holds no seat', () => {
    // Indistinguishable from the above at this layer, and that is correct —
    // RLS returns an empty array either way.
    expect(provesOpsAdmin([])).toBe(false)
  })

  it('reads a PostgREST error body as "not an admin", never as truthy data', () => {
    // A failing database answers with an object, not an array. An implementation
    // that checked `Boolean(body)` or `body.length !== 0` would let this through:
    // `Boolean({...})` is true, and a thrown TypeError inside the gate is worse
    // than a denial.
    const errorBody = {
      code: '42501',
      message: 'permission denied for table ops_admins',
      details: null,
      hint: null,
    }

    expect(provesOpsAdmin(errorBody)).toBe(false)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty object', {}],
    ['the string "true"', 'true'],
    ['a bare number', 1],
    ['a boolean', true],
    ['an HTML error page', '<!doctype html><title>502</title>'],
  ])('refuses %s', (_label, body) => {
    expect(provesOpsAdmin(body)).toBe(false)
  })

  it('never throws, whatever it is handed', () => {
    // The gate runs on every /admin request. A throw here escapes middleware and
    // becomes a 500, which is a different and worse failure than a 404.
    const nasty: unknown[] = [
      null,
      undefined,
      NaN,
      Symbol('x'),
      () => {},
      new Map(),
      Object.create(null),
    ]
    for (const body of nasty) {
      expect(() => provesOpsAdmin(body)).not.toThrow()
      expect(provesOpsAdmin(body)).toBe(false)
    }
  })
})
