/**
 * Did the database fail to ANSWER, or did it answer with a refusal?
 *
 * `export-drift.test.ts` is the only guard that can say what PRODUCTION holds,
 * so it needs a real connection. It used to decide whether it could run by
 * asking whether `SUPABASE_DB_URL` was set. That stopped being the right
 * question on 2026-08-24, when `scripts/cloud-setup.sh` began writing a real
 * `.env` into the cloud sandbox: the URL is now present in an environment whose
 * DNS cannot resolve the host it names, so the test went from honestly skipped
 * to red for a reason that is not a defect.
 *
 * This narrows the question to the one that matters: did anything answer at
 * that address? A connection that never reached a server tells you nothing
 * about the schema, and a test that cannot ask its question has not failed it.
 *
 * ## What this deliberately does NOT excuse
 *
 * Only a failure to REACH a server counts, and only during connect. Everything
 * a server says once it answers stays red, because every one of those is a real
 * defect that a skip would hide:
 *
 * | what happened                      | code    | verdict     |
 * | ---------------------------------- | ------- | ----------- |
 * | the host does not resolve          | ENOTFOUND | unreachable |
 * | nothing is listening on the port   | ECONNREFUSED | unreachable |
 * | wrong password                     | 28P01   | **red** — a settings defect |
 * | permission denied on a catalog     | 42501   | **red** — a grant defect |
 * | the query returned the wrong tables | none   | **red** — the defect this file exists to catch |
 *
 * `ECONNRESET` is absent on purpose. A reset can come from a server that IS
 * there and rejected the TLS handshake, and treating that as "no database"
 * would turn a broken production connection into a silent skip.
 *
 * The rule this encodes, which is not specific to Postgres: a test may skip
 * when it could not ASK its question, never when it did not like the answer.
 */

/**
 * Socket-level failures that mean nothing answered at that address.
 *
 * Exported so the guard can enumerate them rather than restate them, which is
 * how the two drift apart.
 */
export const UNREACHABLE_CODES: readonly string[] = [
  'ENOTFOUND', // the host name does not resolve
  'EAI_AGAIN', // DNS itself did not answer
  'ECONNREFUSED', // resolved, but nothing is listening
  'ETIMEDOUT', // the connection attempt expired
  'EHOSTUNREACH', // no route to that host
  'ENETUNREACH', // no route at all
]

/** How far to follow `cause` before giving up. Deep enough for a wrapped driver error, bounded so a cycle cannot hang the run. */
const MAX_CAUSE_DEPTH = 5

function codeOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const code = (value as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message
  return String(value)
}

/**
 * A sentence naming why the database could not be reached, or `null` when this
 * error is not a reachability failure and must stay red.
 *
 * Follows `cause` and `AggregateError.errors`, because Node wraps the
 * happy-eyeballs attempts of a dual-stack connect in an `AggregateError` and
 * the code lives on the members, not the wrapper.
 */
export function unreachableReason(error: unknown, depth = 0): string | null {
  if (depth > MAX_CAUSE_DEPTH) return null

  const code = codeOf(error)
  if (code !== null && UNREACHABLE_CODES.includes(code)) {
    return `${messageOf(error)} (${code})`
  }

  const nested = (error as { errors?: unknown } | null)?.errors
  if (Array.isArray(nested)) {
    for (const member of nested) {
      const reason = unreachableReason(member, depth + 1)
      if (reason !== null) return reason
    }
  }

  const cause = (error as { cause?: unknown } | null)?.cause
  if (cause !== undefined && cause !== null) return unreachableReason(cause, depth + 1)

  return null
}
