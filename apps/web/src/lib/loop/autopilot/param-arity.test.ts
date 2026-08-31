import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as sql from './sql'

/**
 * EVERY STATEMENT GETS AS MANY ARGUMENTS AS IT HAS PLACEHOLDERS.
 *
 * `writeDecision`'s ten are checked against a real Postgres by the pglite
 * suite, through the same `decisionParams` the dispatcher uses. The other
 * eleven call sites in `store.ts` build their arrays inline, and nothing
 * compared an array's LENGTH to the `$n` in the statement it was passed to.
 *
 * That gap is not theoretical. `pg` does not object to a short array: a missing
 * `$2` becomes a bind error at runtime, in a cron tick, on somebody's schedule,
 * rather than here. An EXTRA argument it ignores silently, which is worse — a
 * limit that was meant to apply and never arrives looks exactly like a limit
 * that was generous.
 *
 * This reads the statements as text and the call sites as text. It cannot see a
 * SWAP of two same-typed arguments, and does not claim to; that is what the
 * pglite binding block is for, and why the ten-argument write went there.
 */

const STORE = readFileSync(join(__dirname, 'store.ts'), 'utf8')

/** The highest `$n` a statement mentions, which is how many it needs. */
function placeholders(statement: string): number {
  const found = [...statement.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]))
  return found.length === 0 ? 0 : Math.max(...found)
}

/**
 * The arguments one `getPool().query(NAME, [ ... ])` passes, counted by
 * commas at depth zero so a nested `?? null` or an object literal does not
 * inflate the count.
 */
function argCountAt(source: string, name: string): number | null {
  const call = source.indexOf(`query(${name}, [`)
  if (call === -1) return null
  let i = source.indexOf('[', call)
  let depth = 0
  let commas = 0
  let seen = false
  for (; i < source.length; i++) {
    const c = source[i]
    if (c === '[' || c === '(' || c === '{') depth++
    else if (c === ']' || c === ')' || c === '}') {
      depth--
      if (depth === 0) break
    } else if (c === ',' && depth === 1) commas++
    if (depth === 1 && c !== undefined && !', \n\t'.includes(c)) seen = true
  }
  if (!seen) return 0
  // A trailing comma before the closing bracket is prettier's doing, not an
  // extra argument, so count the values rather than the separators.
  const body = source.slice(source.indexOf('[', call), i + 1)
  return body.trimEnd().endsWith(',]') || /,\s*\]$/.test(body) ? commas : commas + 1
}

/** Every exported statement whose name ends in _SQL, found rather than listed. */
const STATEMENTS: [string, string][] = Object.entries(sql)
  .filter(([name, value]) => name.endsWith('_SQL') && typeof value === 'string')
  .map(([name, value]) => [name, value as string])

describe('the autopilot statements and the arrays store.ts binds to them', () => {
  it('finds every statement by export name, not from a list that can go stale', () => {
    expect(STATEMENTS.length).toBeGreaterThanOrEqual(10)
  })

  it.each(STATEMENTS)('%s is passed exactly as many arguments as it names', (name, statement) => {
    const passed = argCountAt(STORE, name)
    if (passed === null) return // bound through a builder, or not called here
    expect(passed).toBe(placeholders(statement))
  })

  it('counts placeholders by the highest $n, so a repeated one is not double-counted', () => {
    expect(placeholders('select 1 where a = $1 and b = $2 and c = $1')).toBe(2)
    expect(placeholders('select 1')).toBe(0)
  })

  it('reads the ten-argument write through its builder, and says so', () => {
    // WRITE_DECISION_SQL is deliberately NOT inline in store.ts any more, so
    // this file skips it. If someone inlines it again, the skip above stops
    // applying and this test is the note explaining why that is a step back.
    expect(STORE).toContain('decisionParams(row)')
    expect(argCountAt(STORE, 'WRITE_DECISION_SQL')).toBeNull()
  })
})
