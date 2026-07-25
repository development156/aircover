import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { GRANT_ORIGIN, adminGrantKey, signupGrantKey, monthlyGrantKey } from '@sahoda/shared'

/**
 * The producer/consumer contract for ledger idempotency keys and grant origins.
 *
 * These strings cross a language boundary. A grant's key and `action_type` are
 * written by PL/pgSQL inside a migration, and read by TypeScript in the wallet's
 * copy classifier. Nothing in the type system spans that gap, and nothing in the
 * schema constrains it either: `credit_ledger.action_type` is plain `text` with
 * no enum and no CHECK. So the only thing that can notice a producer drifting
 * from its consumer is a test that reads both sides.
 *
 * That is what this file is. It needs no database — it reads the migration source
 * and compares it against the shared builders, so it runs in a credential-free
 * clone and is never skipped.
 *
 * The expected literals are DERIVED from the shared builders, never retyped. A
 * test that hardcodes `'grant:signup:'` alongside the builder that produces it
 * has simply moved the duplication somewhere greener.
 */

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../supabase/migrations')

function migrationSources(): { file: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((file) => ({ file, sql: readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8') }))
}

/** Every string literal handed to p_idempotency_key across all migrations. */
function idempotencyKeyLiterals(): { file: string; literal: string }[] {
  const found: { file: string; literal: string }[] = []
  for (const { file, sql } of migrationSources()) {
    // Matches  p_idempotency_key => 'some:prefix:' || x   and the plain-literal form.
    const pattern = /p_idempotency_key\s*=>\s*'([^']*)'/g
    for (const match of sql.matchAll(pattern)) {
      // Capture groups are `string | undefined` under noUncheckedIndexedAccess.
      const literal = match[1]
      if (literal !== undefined) found.push({ file, literal })
    }
  }
  return found
}

/** Every string literal handed to p_action_type across all migrations. */
function actionTypeLiterals(): { file: string; literal: string }[] {
  const found: { file: string; literal: string }[] = []
  for (const { file, sql } of migrationSources()) {
    const pattern = /p_action_type\s*=>\s*'([^']*)'/g
    for (const match of sql.matchAll(pattern)) {
      // Capture groups are `string | undefined` under noUncheckedIndexedAccess.
      const literal = match[1]
      if (literal !== undefined) found.push({ file, literal })
    }
  }
  return found
}

describe('grant key builders keep their shape', () => {
  it('signupGrantKey', () => {
    expect(signupGrantKey('ws-1')).toBe('grant:signup:ws-1')
  })

  it('monthlyGrantKey', () => {
    expect(monthlyGrantKey('growth', '2026-07', 'ws-1')).toBe('grant:growth:2026-07:ws-1')
  })

  it('adminGrantKey is prefixed with the admin grant origin (doc 13 §6)', () => {
    // The key and the action_type share one prefix on purpose: given a ledger row
    // you can tell which credit request produced it without a join.
    expect(adminGrantKey('req-1')).toBe('admin_grant:req-1')
    expect(adminGrantKey('req-1').startsWith(`${GRANT_ORIGIN.admin}:`)).toBe(true)
  })

  it('every origin is a distinct, non-empty snake_case token', () => {
    const values = Object.values(GRANT_ORIGIN)
    expect(new Set(values).size).toBe(values.length)
    for (const value of values) expect(value).toMatch(/^[a-z][a-z0-9_]*$/)
  })
})

describe('SQL producers still match the shared builders', () => {
  it('finds the migrations at all (a silent empty scan would pass everything)', () => {
    // Without this, a moved directory turns every assertion below into a vacuous
    // pass over an empty list.
    expect(migrationSources().length).toBeGreaterThan(10)
    expect(idempotencyKeyLiterals().length).toBeGreaterThan(0)
    expect(actionTypeLiterals().length).toBeGreaterThan(0)
  })

  it('every idempotency key a migration writes uses a shared builder prefix', () => {
    // Derived from the builders: whatever they emit for an empty argument IS the
    // prefix a producer must use. Change a builder and this list changes with it.
    const allowedPrefixes = [
      signupGrantKey(''), // 'grant:signup:'
      adminGrantKey(''), // 'admin_grant:'
    ]

    for (const { file, literal } of idempotencyKeyLiterals()) {
      const matched = allowedPrefixes.some(
        (prefix) => literal === prefix || prefix.startsWith(literal) || literal.startsWith(prefix),
      )
      expect(
        matched,
        `${file} writes idempotency key literal '${literal}', which no builder in ` +
          `@sahoda/shared produces. Add a builder there and use its shape, or this ` +
          `key becomes a format only that migration knows.`,
      ).toBe(true)
    }
  })

  it('every grant action_type a migration writes is a known GRANT_ORIGIN', () => {
    const origins: string[] = Object.values(GRANT_ORIGIN)

    for (const { file, literal } of actionTypeLiterals()) {
      // Spend actions (caption_rewrite, site_generate, …) are priced actions from
      // pricing.config.json and are not grant origins. Only grant-ish values are
      // this test's business, identified by the one thing they have in common.
      if (!literal.endsWith('_grant')) continue

      expect(
        origins,
        `${file} writes action_type '${literal}', which is not in GRANT_ORIGIN. ` +
          `The wallet classifier keys its copy off that object, so an unknown ` +
          `origin renders as "Included with your plan" — wrong for every grant ` +
          `that did not come from a plan.`,
      ).toContain(literal)
    }
  })

  it('bootstrap_workspace specifically still writes the signup grant this way', () => {
    // The one live producer, named explicitly so a failure says which file to open.
    const bootstrap = migrationSources().find((m) => m.file.includes('add_bootstrap_workspace'))
    expect(bootstrap).toBeDefined()

    expect(bootstrap!.sql).toContain(`'${signupGrantKey('')}'`)
    expect(bootstrap!.sql).toContain(`'${GRANT_ORIGIN.signup}'`)
  })
})
