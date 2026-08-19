import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The structural half of "the fixture path is unreachable from this route".
 *
 * `route.test.ts` proves the endpoint REJECTS a fixture-signed payload. That is necessary
 * but not sufficient — it only holds while the endpoint calls the Cashfree verifier. This
 * file proves it cannot reach any other one: `@sahoda/billing` (the main barrel, which
 * re-exports `createFixtureProvider` and with it a signing secret that is a source literal
 * in a PUBLIC repository) appears nowhere in the route's import graph.
 *
 * The check is deliberately on REACHABILITY rather than on a runtime flag. A flag is a
 * branch, and a branch can be inverted, short-circuited, or made unreachable by a refactor
 * without a single test noticing. An absent module cannot be called at all.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '../../../..')

/**
 * Strip comments before scanning.
 *
 * Load-bearing, not tidiness: `route.ts` and `cashfree-webhook.ts` both QUOTE the forbidden
 * `@sahoda/billing` specifier in their headers to explain what they avoid. A naive scan reads
 * that prose as a real import and reports a violation — a false positive that would make this
 * guard fail forever and get deleted as noise. A guard that cries wolf is worse than none.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

interface Edge {
  /** The file the specifier was written in. */
  from: string
  specifier: string
}

/**
 * Every module specifier in a file, comments removed first.
 *
 * ── WHAT THIS USED TO MISS, MEASURED 2026-08-19 ─────────────────────────────
 * It matched `from '…'` and nothing else, so three real import shapes were
 * invisible to it:
 *
 *   import './providers/fixture'              — side effect, no `from`
 *   await import('./providers/fixture')       — dynamic
 *   require('./providers/fixture')            — CJS
 *
 * Any one of them reaches a module this guard exists to prove UNREACHABLE, and
 * the guard would have stayed green. That is the same failure `wiring.test.ts`
 * had: a parse that could not see the thing it was asserting about.
 *
 * `from` keeps its REQUIRED whitespace, deliberately. `from\s*\(` would read
 * every `supabase.from('posts')` in this repo as a module specifier — and there
 * are hundreds. The paren forms are matched under `import` and `require` instead.
 *
 * One known false POSITIVE remains: the word `import` inside a quoted string
 * followed by another quoted string. It fails closed (the guard goes red when it
 * need not), which is the safe direction, and closing it properly needs a real
 * tokeniser rather than a regex.
 */
const MODULE_SPECIFIER =
  /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g

function specifiersIn(src: string): string[] {
  return [...src.matchAll(MODULE_SPECIFIER)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4] ?? '')
}

/** Resolve a relative or `@/`-aliased specifier to a file on disk, or null if external. */
function resolveLocal(fromFile: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
  else return null

  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), base]) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

/**
 * Walk every local module reachable from `entry`, collecting the external (bare) specifiers
 * each one imports. Test files are excluded — a test importing the barrel to prove a point
 * about it is not the production endpoint importing the barrel.
 */
function externalImports(entry: string): Edge[] {
  const seen = new Set<string>()
  const edges: Edge[] = []

  const walk = (file: string): void => {
    const abs = resolve(file)
    if (seen.has(abs) || /\.test\.tsx?$/.test(abs)) return
    seen.add(abs)

    let src: string
    try {
      src = stripComments(readFileSync(abs, 'utf8'))
    } catch {
      return
    }

    for (const spec of specifiersIn(src)) {
      const local = resolveLocal(abs, spec)
      if (local) walk(local)
      else edges.push({ from: abs.replace(SRC, 'src'), specifier: spec })
    }
  }

  walk(entry)
  return edges
}

const ROUTE = join(HERE, 'route.ts')

describe('the Cashfree webhook route cannot reach the fixture provider', () => {
  it('imports the server-webhook entry point, never the main @sahoda/billing barrel', () => {
    const billing = externalImports(ROUTE).filter((e) => e.specifier.startsWith('@sahoda/billing'))

    expect(billing.length).toBeGreaterThan(0)
    const offenders = billing.filter((e) => e.specifier !== '@sahoda/billing/server-webhook')
    expect(
      offenders,
      `these modules reach billing through an entry point that includes the fixture:\n${offenders
        .map((e) => `  ${e.from} → ${e.specifier}`)
        .join('\n')}`,
    ).toEqual([])
  })

  it('names the fixture nowhere in the code it ships', () => {
    const files = new Set<string>()
    const collect = (file: string): void => {
      if (files.has(file)) return
      files.add(file)
      let src: string
      try {
        src = stripComments(readFileSync(file, 'utf8'))
      } catch {
        return
      }
      for (const spec of specifiersIn(src)) {
        const local = resolveLocal(file, spec)
        if (local) collect(local)
      }
    }
    collect(ROUTE)

    const offenders = [...files].filter((f) => {
      const src = stripComments(readFileSync(f, 'utf8'))
      return src.includes('createFixtureProvider') || src.includes('fixture-webhook-secret')
    })
    expect(offenders).toEqual([])
  })

  /**
   * NON-VACUITY. Without this the first test would also pass if the scanner silently
   * resolved nothing — and a guard that cannot fail is not a guard. The wallet action DOES
   * import the main barrel (it needs `createCashfreeProvider`, which only the barrel
   * exports), and that is fine: it is an authenticated server action, not a public endpoint.
   * The point is that the scanner demonstrably detects a barrel import when one is there.
   */
  it('detects a main-barrel import where one genuinely exists', () => {
    const wallet = join(SRC, 'app/actions/wallet.ts')
    const specs = externalImports(wallet).map((e) => e.specifier)
    expect(specs).toContain('@sahoda/billing')
  })
})

describe('the route is mounted', () => {
  /**
   * Clerk protects everything not listed in the public matcher. An unlisted webhook route
   * does not fail loudly — it answers a redirect to /sign-in, which Cashfree records as a
   * delivery failure while the endpoint itself looks perfectly healthy in code review.
   */
  it('is listed by EXACT path in middleware, with no wildcard', () => {
    const middleware = readFileSync(join(SRC, 'middleware.ts'), 'utf8')
    expect(stripComments(middleware)).toContain("'/api/webhooks/cashfree'")
    expect(stripComments(middleware)).not.toContain('/api/webhooks(.*)')
  })

  /** New server env vars are invisible to the Vercel build unless they join the allowlist. */
  it('has CASHFREE_WEBHOOK_SECRET in the @sahoda/web#build env allowlist', () => {
    const turbo = JSON.parse(readFileSync(resolve(SRC, '../../../turbo.json'), 'utf8')) as {
      tasks: Record<string, { env?: string[] }>
    }
    const allowed = turbo.tasks['@sahoda/web#build']?.env ?? []
    expect(allowed).toContain('CASHFREE_WEBHOOK_SECRET')
    expect(allowed).toContain('CASHFREE_SECRET_KEY')
    expect(allowed).toContain('CASHFREE_ENV')
  })
})
