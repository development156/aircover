import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

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

export function scanRoutes(appDir: string): RouteWaterfall[] {
  const out: RouteWaterfall[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'page.tsx') {
        const route = full.slice(appDir.length).replace(/\/page\.tsx$/, '') || '/'
        out.push({ route, awaits: waterfallOf(readFileSync(full, 'utf8')) })
      }
    }
  }
  walk(appDir)
  return out.sort((a, b) => a.route.localeCompare(b.route))
}
