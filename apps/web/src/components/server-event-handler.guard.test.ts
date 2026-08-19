import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { globSync } from 'node:fs'

/**
 * A Server Component may not carry a JSX event handler.
 *
 * ── THE BUG THIS EXISTS FOR ──────────────────────────────────────────────────
 * `channel-chip.tsx` had `onClick={(e) => e.stopPropagation()}` on its anchor and no
 * `'use client'`. React cannot serialise a function across the RSC boundary, so rendering
 * it threw "Event handlers cannot be passed to Client Component props" and /posts fell to
 * the error boundary.
 *
 * It survived from the root commit because the branch was UNREACHABLE: the anchor renders
 * only when `state.permalink` is truthy, `variant-status.ts` nulls a `fixture://`
 * permalink, and until 2026-08-09 16:42 every publish in the database was a fixture. The
 * first live publish created the first real permalink and the latent throw became a
 * 500 — a bug shipped by DATA, not by a deploy.
 *
 * ── WHY REACHABILITY AND NOT A BLANKET RULE ──────────────────────────────────
 * Nine files under apps/web/src carry JSX handlers without `'use client'`, and eight of
 * them are CORRECT: they are only ever imported from a file that has the directive, so
 * they compile into the client bundle. A blanket "handlers require 'use client'" check
 * would fail on all nine, be dismissed as noise, and get deleted — and a guard that cries
 * wolf is worse than none.
 *
 * So this walks the SERVER graph: from every page/layout that is not itself a client
 * component, following local imports, stopping at any file with the directive. Whatever
 * remains is rendered on the server and may not hold a handler.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '..')

const isClientFile = (src: string): boolean => {
  const head = src.trimStart()
  return head.startsWith("'use client'") || head.startsWith('"use client"')
}

/** Comments quote handler names when explaining them; strip before scanning. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const specifiersIn = (src: string): string[] =>
  // `from` keeps its required whitespace — `supabase.from('posts')` is everywhere
  // in apps/web and a looser form would read every one as a module. The paren
  // shapes are matched separately: an audit on 2026-08-19 printed what each guard
  // in this repo actually parses, and every `from`-only walker was blind to a
  // side-effect import, a dynamic `import()` and a `require()`.
  [
    ...src.matchAll(
      /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g,
    ),
  ].map((m) => (m[1] ?? m[2] ?? m[3] ?? m[4]) as string)

function resolveLocal(fromFile: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
  else return null

  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), base]) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      /* next candidate */
    }
  }
  return null
}

/** Every file rendered on the server, from the given entry points. */
function serverReachable(entries: string[]): Set<string> {
  const seen = new Set<string>()
  const walk = (file: string): void => {
    const abs = resolve(file)
    if (seen.has(abs) || /\.test\.tsx?$/.test(abs)) return

    let raw: string
    try {
      raw = readFileSync(abs, 'utf8')
    } catch {
      return
    }
    // The boundary. This file and everything it pulls in is client code, where a
    // handler is not merely allowed but the entire point.
    if (isClientFile(raw)) return

    seen.add(abs)
    for (const spec of specifiersIn(stripComments(raw))) {
      const local = resolveLocal(abs, spec)
      if (local) walk(local)
    }
  }
  entries.forEach(walk)
  return seen
}

/** `onClick={`, `onChange={` … as written in JSX. */
const handlersIn = (src: string): string[] => [
  ...new Set([...stripComments(src).matchAll(/\bon[A-Z]\w*(?=\s*=\s*\{)/g)].map((m) => m[0])),
]

const pages = globSync('app/**/{page,layout}.tsx', { cwd: SRC }).map((p) => join(SRC, p))

describe('no Server Component carries a JSX event handler', () => {
  it('finds the server graph at all', () => {
    // Without this the sweep below passes vacuously if the glob or the walker breaks.
    expect(pages.length).toBeGreaterThan(5)
    expect(serverReachable(pages).size).toBeGreaterThan(20)
  })

  it('flags none', () => {
    const offenders = [...serverReachable(pages)]
      .map((f) => ({
        file: f.replace(`${SRC}/`, ''),
        handlers: handlersIn(readFileSync(f, 'utf8')),
      }))
      .filter((r) => r.handlers.length > 0)

    expect(
      offenders,
      'These render on the server, so React cannot serialise their handlers — the render ' +
        'throws "Event handlers cannot be passed to Client Component props". Add ' +
        `'use client' to each:\n${offenders.map((o) => `  ${o.file} — ${o.handlers.join(', ')}`).join('\n')}`,
    ).toEqual([])
  })

  /**
   * NON-VACUITY. The scanner must be able to SEE a handler, or "flags none" would pass
   * on a walker that silently resolved nothing. A known client component has one.
   */
  it('detects a handler where one genuinely exists', () => {
    const known = join(SRC, 'components/admin/board-card.tsx')
    expect(handlersIn(readFileSync(known, 'utf8')).length).toBeGreaterThan(0)
  })
})
