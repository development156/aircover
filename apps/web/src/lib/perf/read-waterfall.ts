import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * How many reads a page component waits for ONE AFTER ANOTHER.
 *
 * ── WHY THIS NUMBER IS THE ONE WORTH GUARDING ────────────────────────────────
 * Every read in this app is a separate HTTP call to PostgREST in ap-south-1, so a
 * page's server time is dominated by how many ROUND TRIPS it makes, not by how
 * long any query runs. MEASURED: the whole production database is 75 tables whose
 * largest holds 10,749 rows and whose `posts` table holds 124 — nothing here is
 * slow to execute. Ten reads inside one `Promise.all` is one wait; the same ten
 * awaited in sequence is ten, and the second shape is invisible to every test in
 * this repo because it produces identical output.
 *
 * ── WHAT IT COUNTS ──────────────────────────────────────────────────────────
 * Top-level `await someRead(...)` inside a `page.tsx`, excluding:
 *   · anything inside a `Promise.all` — that is the shape we want;
 *   · `await params` / `await searchParams` / `await cookies()` / `await headers()`,
 *     which are Next's own request APIs and cost no round trip;
 *   · prose. Comments are stripped first, or a paragraph describing an await
 *     would be counted as one — and this file is in a codebase whose comments
 *     discuss awaits constantly.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 * This is a RATCHET, not a judge. It cannot tell a genuinely dependent await
 * (`readAddablePosts(posts.map(…))` needs `posts`) from an independent one that
 * should have been parallelised, so it does not try: it refuses GROWTH against a
 * recorded baseline and leaves the judgement to a person.
 *
 * It is also blind to:
 *   · reads issued inside a component the page renders, rather than in the page;
 *   · reads issued inside one of the awaited functions — a single `await` may be
 *     five round trips;
 *   · `generateMetadata`, which Next runs as a second entry point and which can
 *     duplicate the page's own reads. That is real and was found by hand on
 *     /campaigns/[id]; it is not in this count, and a reader should not take a
 *     green run as evidence it does not happen elsewhere.
 */
export interface RouteWaterfall {
  route: string
  awaits: string[]
}

/** Next's own request APIs. Awaiting these is not a network round trip. */
const FREE = new Set(['params', 'searchParams', 'cookies', 'headers', 'draftMode', 'connection'])

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * The spans covered by a `Promise.all([...])`, so awaits inside one are not
 * counted. Bracket-matched rather than regex-matched: the argument list contains
 * nested brackets, arrow bodies and object literals, and a lazy `[\s\S]*?` stops
 * at the first `]` it meets — which is usually inside the first element.
 */
function promiseAllSpans(code: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  const re = /Promise\.(all|allSettled)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code)) !== null) {
    let depth = 0
    let i = m.index + m[0].length - 1
    for (; i < code.length; i += 1) {
      const c = code[i]
      if (c === '(' || c === '[' || c === '{') depth += 1
      else if (c === ')' || c === ']' || c === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    spans.push([m.index, i])
  }
  return spans
}

export function waterfallOf(source: string): string[] {
  const code = stripComments(source)
  const spans = promiseAllSpans(code)
  const inside = (i: number): boolean => spans.some(([a, b]) => i >= a && i <= b)

  const out: string[] = []
  const re = /\bawait\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*(\(|\b)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code)) !== null) {
    const name = m[1]
    // `noUncheckedIndexedAccess` is on, and it is right to be: a capture group
    // is only defined if it participated in the match.
    if (name === undefined) continue
    if (name === 'Promise.all' || name === 'Promise.allSettled') continue
    if (FREE.has(name)) continue
    if (inside(m.index)) continue
    out.push(name)
  }
  return out
}

/**
 * Module specifiers a file imports, in any form the codebase uses.
 *
 * Relative (`./x`, `../x`) and alias (`@/lib/x`) both, because a component is
 * reached by whichever the author happened to write.
 */
function importsIn(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const out: string[] = []
  for (const m of code.matchAll(/(?:from|import)\s*\(?\s*(['"])([^'"]+)\1/g)) {
    const spec = m[2]
    if (spec && (spec.startsWith('.') || spec.startsWith('@/'))) out.push(spec)
  }
  return out
}

/** A specifier resolved to a real file under `src`, or null. */
function resolveModule(fromFile: string, spec: string, srcDir: string): string | null {
  const base = spec.startsWith('@/')
    ? resolve(srcDir, spec.slice(2))
    : resolve(dirname(fromFile), spec)
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const candidate = `${base}${ext}`
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/**
 * EVERY AWAIT A NAVIGATION PAYS FOR, NOT EVERY AWAIT IN ONE FILE.
 *
 * ── WHY THIS NOW FOLLOWS LAYOUTS AND COMPONENTS ─────────────────────────────
 * It used to read `page.tsx` FILES ONLY. That is why it could not have found the
 * defect its own lane fixed: the sequential pair costing every authenticated
 * navigation a round trip was `showsAdminItem()` then `approvalCount()` in
 * `components/shell/rail.tsx`, reached from `(app)/layout.tsx`. Neither file was
 * ever opened.
 *
 * A page is not what a navigation renders. The layouts above it render too, and
 * so does every server component they pull in — and an await in the shell is
 * paid on EVERY route, which makes it the most expensive place to have one and
 * the one place this could not look.
 *
 * ── A RULE, NOT A LIST ──────────────────────────────────────────────────────
 * The set is derived by following imports, so a component moved or renamed is
 * still followed. A hardcoded list of files would have to be maintained by the
 * people least likely to be reading this file, and three lanes are rewriting
 * these directories right now.
 *
 * ── WHAT IT STILL CANNOT SEE ────────────────────────────────────────────────
 * A client component's data fetching (this counts server awaits in source), an
 * await reached conditionally or in a loop, and TIME — it counts round-trip
 * OPPORTUNITIES, so a `cache()`-wrapped second call counts the same as a cold
 * one. Those limits are unchanged and are listed in the test beside it.
 */
export function scanRoutes(appDir: string): RouteWaterfall[] {
  const srcDir = resolve(appDir, '..')

  /** Layouts that wrap a route, outermost first — every one of them renders. */
  const layoutsFor = (pageFile: string): string[] => {
    const found: string[] = []
    let dir = dirname(pageFile)
    while (dir.length >= appDir.length) {
      const layout = resolve(dir, 'layout.tsx')
      if (existsSync(layout)) found.unshift(layout)
      dir = dirname(dir)
    }
    return found
  }

  const COMPONENTS = resolve(srcDir, 'components')

  /**
   * ── THE RENDER TREE, AND DELIBERATELY NOT THE WHOLE IMPORT GRAPH ───────────
   * Only server components are followed: files under `src/components` and the
   * layouts above a page. NOT `src/lib`, NOT `app/actions`.
   *
   * MEASURED 2026-08-23, following everything: 59 to 122 "sequential reads" per
   * route. That number is an await CENSUS of a whole subgraph, not a waterfall —
   * it counted `deleteAsset`, `Sentry.flush` and every branch of every server
   * action reachable from a page, none of which runs during a render. A ratchet
   * on a number like that is red on every change and teaches everyone to
   * regenerate the baseline without reading it.
   *
   * What IS followed is what actually renders, which is where the defect this
   * guard missed lived: `showsAdminItem()` then `approvalCount()` in
   * `components/shell/rail.tsx`, reached from `(app)/layout.tsx`.
   *
   * A `'use client'` file is skipped: it does not await on the server.
   *
   * STILL NOT SEEN, and unchanged from before: two sequential awaits INSIDE a
   * a reader under `lib` are one await here and two round trips in production.
   */
  const awaitsReachedFrom = (entry: string, seen: Set<string>): string[] => {
    if (seen.has(entry)) return []
    seen.add(entry)
    const source = readFileSync(entry, 'utf8')
    if (/^\s*['"]use client['"]/m.test(source)) return []
    const out = [...waterfallOf(source)]
    for (const spec of importsIn(source)) {
      const target = resolveModule(entry, spec, srcDir)
      if (
        target &&
        target.startsWith(COMPONENTS) &&
        !target.includes('.test.') &&
        /\.tsx$/.test(target)
      ) {
        out.push(...awaitsReachedFrom(target, seen))
      }
    }
    return out
  }

  const out: RouteWaterfall[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'page.tsx') {
        const route = full.slice(appDir.length).replace(/\/page\.tsx$/, '') || '/'
        // One `seen` for the whole route: a component rendered by both the
        // layout and the page is ONE render and one round trip, not two.
        const seen = new Set<string>()
        const awaits = [
          ...layoutsFor(full).flatMap((l) => awaitsReachedFrom(l, seen)),
          ...awaitsReachedFrom(full, seen),
        ]
        out.push({ route, awaits })
      }
    }
  }
  walk(appDir)
  return out.sort((a, b) => a.route.localeCompare(b.route))
}
