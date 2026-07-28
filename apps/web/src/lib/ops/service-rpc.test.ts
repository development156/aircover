import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { SERVICE_RPCS } from './service-rpc'

/**
 * The test service-rpc.ts's own header claims exists. It did not, until now —
 * the comment asserted a property nothing checked, which is worse than no
 * comment: a reader trusts it and stops looking.
 *
 * The property under test is doc 13 §16's central promise: THE INGEST TOKEN
 * CANNOT REACH CREDITS. That promise does not rest on the ingest route being
 * careful. It rests on this module being the only place in apps/web that holds
 * a service-role key, and on the set of RPCs it can call being small, named,
 * and free of anything that touches the ledger.
 *
 * So this reads the SOURCE, not the exports. A test that only called the
 * exported functions would pass just as happily if someone added a fourth
 * export that granted credits — it would simply never call it. The question is
 * what this file is CAPABLE of, and that is a question about its text.
 */

const SOURCE = readFileSync(join(__dirname, 'service-rpc.ts'), 'utf8')

/** Every `.rpc('name'` literal in the file, in source order. */
function rpcNamesIn(source: string): string[] {
  return [...source.matchAll(/\.rpc\(\s*'([^']+)'/g)].map((match) => match[1]!)
}

describe('the service-role surface is exactly what it says it is', () => {
  it('calls only the three RPCs on the declared allowlist', () => {
    // Not a subset check. Equality, so a new .rpc() call fails here rather than
    // riding along unnoticed.
    expect(new Set(rpcNamesIn(SOURCE))).toEqual(new Set(SERVICE_RPCS))
  })

  it('names each allowlisted RPC in the constant AND uses it', () => {
    // Catches the reverse drift: an entry left in SERVICE_RPCS after its caller
    // was deleted makes the allowlist look broader than the code, and the next
    // person reads the constant as permission.
    for (const name of SERVICE_RPCS) expect(rpcNamesIn(SOURCE)).toContain(name)
  })

  it('reaches no credit or ledger function, by any spelling', () => {
    // The §16 promise, stated as text. `ops_ingest` writes five ops tables; if
    // any of these strings ever appears here, the ingest token's blast radius
    // now includes money.
    for (const forbidden of [
      'apply_ledger_entry',
      'credit_ledger',
      'credit_balances',
      'ops_credit_request_create',
      'ops_credit_request_verify',
      'ops_credit_request_deny',
      'ops_credit_requests',
    ]) {
      expect(SOURCE).not.toContain(forbidden)
    }
  })

  it('exports functions only — never the client itself', () => {
    // The escalation is bounded by there being no handle to escape with. An
    // exported client (or an exported key) would let any importer call anything,
    // and every assertion above would become decorative.
    const exported = [...SOURCE.matchAll(/^export\s+(?:async\s+)?(\w+)\s+(\w+)/gm)].map((m) => ({
      kind: m[1],
      name: m[2],
    }))

    expect(exported.length).toBeGreaterThan(0)
    for (const entry of exported) {
      expect(['function', 'const', 'type']).toContain(entry.kind)
      expect(entry.name).not.toMatch(/client|key|admin/i)
    }

    expect(SOURCE).not.toMatch(/export\s+(const|function|async function)\s+serviceClient/)
    expect(SOURCE).not.toMatch(/export\s*\{[^}]*serviceClient/)
  })

  it('is the ONLY module in apps/web that builds a client from the service-role key', () => {
    // The bound is worth nothing if a second file constructs its own client.
    // grep is the assertion here because the property is about the tree, not
    // about this module.
    //
    // Naming the variable is not the offence — the env schema declares it and
    // the Sentry scrubber lists it precisely so it is never logged, and both of
    // those are the system working. Handing it to createClient is the offence,
    // because that is the step that produces an RLS-exempt handle.
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    const src = join(__dirname, '..', '..')

    const grep = (pattern: string): string[] => {
      try {
        return execFileSync('grep', ['-rl', '--include=*.ts', '--include=*.tsx', pattern, src], {
          encoding: 'utf8',
        })
          .trim()
          .split('\n')
          .filter(Boolean)
      } catch {
        return []
      }
    }

    const named = grep('SUPABASE_SERVICE_ROLE_KEY')
    // Sanity: if this is empty the grep itself broke and the test below would
    // pass vacuously.
    expect(named.length).toBeGreaterThan(0)

    const builders = named
      .filter((path) => path !== __filename) // this file quotes both strings to test for them
      .filter((path) => readFileSync(path, 'utf8').includes('createClient'))
      .map((path) => path.replace(`${src}/`, ''))

    expect(builders).toEqual(['lib/ops/service-rpc.ts'])
  })
})
