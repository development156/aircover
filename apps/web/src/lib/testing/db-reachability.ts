/**
 * Did we FAIL TO REACH the database, or did the database answer and tell us
 * something?
 *
 * ## Why this exists
 *
 * `src/lib/privacy/export-drift.test.ts` asks the live production schema
 * whether the export manifest is still true. It is the only thing that can
 * speak for production, so it is kept and run wherever a credential exists.
 *
 * It used to skip on `SUPABASE_DB_URL === ''`, which was the right condition
 * when the sandbox had no `.env` at all. `scripts/cloud-setup.sh` changed that
 * on 2026-08-24: the sandbox now HAS the credential. What it does not have is a
 * route. MEASURED 2026-08-28 in the claude.ai/code sandbox, four ways:
 *
 * | probe                            | result                                    |
 * | -------------------------------- | ----------------------------------------- |
 * | `dns.resolve4(db host)`          | `ENODATA` — the host publishes no A record |
 * | `dns.resolve6(db host)`          | `2406:da1a:82a:9d02:1644:bb0a:2ca1:a2ec`  |
 * | `dns.lookup(db host, family: 4)` | `ENOTFOUND` — the error the suite reported |
 * | TCP connect to that v6 address   | `EAFNOSUPPORT` — no IPv6 stack here at all |
 *
 * So the host is v6-only and the container is v4-only. Nothing in the sandbox
 * can clear that, and the test was red for a reason that is not a defect. Which
 * is how a suite gets ignored, as that file's own header warned.
 *
 * ## Why a module and not four lines inside the test
 *
 * Because widening a skip is the exact move that let twenty-six billing tests
 * go unexecuted for months. A skip condition is a claim about which failures do
 * not matter, and a claim that broad has to be checkable. `db-reachability.test.ts`
 * runs it against fourteen errors on every gate run with no credential and no
 * network, and half of those cases assert that a failure is NOT swallowed.
 *
 * `src/lib/testing/e2e-target.ts` is the precedent: a measuring instrument
 * calibrated by the ordinary gate rather than by whoever remembers to run it.
 *
 * ## The line this draws
 *
 * Unreachable means the connection was never established. Anything the server
 * said — a rejected password, a missing database, a denied `select`, an expired
 * certificate — means we DID reach it, and that is a real finding that must stay
 * red. `pg` reports SQLSTATE on `error.code` too, in the same field as a socket
 * errno, so the test below is an explicit allowlist and never a prefix match or
 * a "starts with E" heuristic: `28P01` and `EAI_AGAIN` arrive identically shaped.
 *
 * `ECONNRESET` is deliberately NOT here. A reset means something answered far
 * enough to reset us, and a mid-handshake TLS rejection looks exactly like one.
 * Narrow is the safe default: if a reset ever blocks this test it will be red,
 * and somebody will look at it rather than never hearing about it.
 */

/**
 * Socket and resolver failures that all mean the same thing: no connection was
 * ever made. Nothing here can be reported by a server that answered.
 */
const UNREACHABLE_CODES: ReadonlySet<string> = new Set([
  'EAI_AGAIN', // resolver temporarily failed
  'ENOTFOUND', // resolver returned nothing for this name
  'EAFNOSUPPORT', // no socket of that address family — the sandbox's v6 case
  'ECONNREFUSED', // nothing listening on the port
  'EHOSTUNREACH', // no route to the host
  'ENETUNREACH', // no route to the network
  'ENETDOWN', // local interface is down
  'EHOSTDOWN', // host is known and down
  'ETIMEDOUT', // the connect attempt never completed
  'EPROTONOSUPPORT', // no protocol support for that family
])

/** Errors nest: `cause` chains, and `AggregateError` when several addresses were tried. */
function related(error: unknown): unknown[] {
  if (typeof error !== 'object' || error === null) return []
  const nested: unknown[] = []
  const { cause } = error as { cause?: unknown }
  if (cause !== undefined) nested.push(cause)
  const { errors } = error as { errors?: unknown }
  if (Array.isArray(errors)) nested.push(...errors)
  return nested
}

/**
 * The errno that proves the database was never reached, or `null` for anything
 * else — including anything the server itself said.
 *
 * Returns the CODE rather than a boolean so the skip note can name it. "Could
 * not reach the database" sends someone guessing; `EAFNOSUPPORT` sends them to
 * the cause.
 */
export function unreachableCode(error: unknown, depth = 0): string | null {
  // `AggregateError` from a multi-address connect nests one level; a `cause`
  // chain is rarely deeper. Five is generous and ends a cyclic chain.
  if (depth > 5 || typeof error !== 'object' || error === null) return null

  const { code } = error as { code?: unknown }
  if (typeof code === 'string' && UNREACHABLE_CODES.has(code)) return code

  for (const nested of related(error)) {
    const found = unreachableCode(nested, depth + 1)
    if (found !== null) return found
  }
  return null
}
