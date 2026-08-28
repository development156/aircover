/**
 * Did a database connection fail because there is NO ROUTE to the host, or
 * because something about the database is actually wrong?
 *
 * `export-drift.test.ts` is the only guard that can say what PRODUCTION holds,
 * so it is pointed at the live database and skips when it has no credential. It
 * now also has to survive a second kind of nothing: a credential that is present
 * and a host that this machine cannot reach at all.
 *
 * MEASURED 2026-08-28 in the claude.ai/code sandbox: `db.<ref>.supabase.co`
 * resolves AAAA-only (`getent ahostsv4` returns nothing) and the sandbox has no
 * IPv6 route, so `pg` throws `getaddrinfo ENOTFOUND`. That is a fact about the
 * machine. Reporting it as "the export manifest disagrees with the schema" names
 * the wrong defect and, repeated, teaches everybody to ignore a red mark on the
 * one file that guards a promise the customer cannot check.
 *
 * ## The net is deliberately narrow
 *
 * Only the four codes below, and only those, mean "this machine could not get a
 * packet to that host". Everything else stays RED and always should:
 *
 * - `ECONNREFUSED` — DNS worked and a machine answered. Something is listening
 *   somewhere wrong, or production is down. Both are real.
 * - `ETIMEDOUT` — indistinguishable from a database too slow to answer, which is
 *   a finding. A blackholed sandbox and an overloaded primary look the same from
 *   here, so this one is not given the benefit of the doubt.
 * - `28P01` and every other Postgres SQLSTATE — the host was reached. A wrong
 *   password is a configuration defect, not an absent network.
 *
 * Widening this set is how a suite starts reporting green on nothing. If a new
 * code has to be added, add the measurement that produced it too.
 */

/** Node errno codes that mean the packet never left, or never arrived. */
const NO_ROUTE_CODES = new Set([
  'ENOTFOUND', // DNS returned no usable address for this stack
  'EAI_AGAIN', // resolver itself unreachable or timed out
  'ENETUNREACH', // no route to that network
  'EHOSTUNREACH', // route exists, host does not answer at the IP layer
])

function codeOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const code = (value as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function hostOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const host = (value as { hostname?: unknown }).hostname
  return typeof host === 'string' && host !== '' ? host : null
}

/**
 * A sentence saying the host is unreachable, or `null` when the failure is one
 * the test must keep reporting.
 *
 * Walks the `cause` chain: a driver that wraps the socket error still carries
 * the errno underneath, and reading only the outermost error would classify a
 * wrapped `ENOTFOUND` as a real finding.
 */
export function noRouteReason(error: unknown): string | null {
  let current: unknown = error
  for (let depth = 0; current != null && depth < 8; depth += 1) {
    const code = codeOf(current)
    if (code !== null && NO_ROUTE_CODES.has(code)) {
      const host = hostOf(current)
      return host === null
        ? `no route to the database from this machine (${code})`
        : `no route to ${host} from this machine (${code})`
    }
    current = (current as { cause?: unknown }).cause
  }
  return null
}

/**
 * Read, or stand down with a reason. Rethrows anything that is not an absent
 * network, so a database that IS reachable and broken still goes red.
 *
 * This exists as a function rather than four lines inside the test's `beforeAll`
 * because those four lines are the ones that can silence the guard, and a
 * `beforeAll` cannot be asserted from inside its own file. MEASURED: deleting
 * the rethrow made a refused connection report as two skipped tests, and nothing
 * anywhere went red. `db-route.test.ts` covers it now.
 */
export async function readOrStandDown<T>(
  read: () => Promise<T>,
): Promise<{ rows: T; noRoute: null } | { rows: null; noRoute: string }> {
  try {
    return { rows: await read(), noRoute: null }
  } catch (error) {
    const noRoute = noRouteReason(error)
    if (noRoute === null) throw error
    // Printed, not swallowed. Vitest 4's default reporter is silent for anything
    // that did not fail, so this line surfaces under `--reporter=verbose`; what
    // the ordinary gate shows is the skipped COUNT, which is the same signal the
    // no-credential skip has always given.
    console.warn(`export-drift: ${noRoute}. The live schema was not read.`)
    return { rows: null, noRoute }
  }
}
