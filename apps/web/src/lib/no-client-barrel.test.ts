import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A `'use client'` file may not VALUE-import a package barrel that reaches Node.
 *
 * ── THE BUILD THIS EXISTS BECAUSE OF ─────────────────────────────────────────
 * On 2026-08-19 `create-flow.tsx` — a client component — imported `formatsFor`
 * from `@sahoda/publishing`. The barrel re-exports `oauth/x.ts`, which imports
 * `node:crypto`, and the production build died with
 *
 *   UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins
 *
 * with an import trace of exactly node:crypto → oauth/x.ts → index.ts →
 * create-flow.tsx. Nothing caught it: `pnpm gate` runs typecheck, lint, unit
 * tests, Playwright and prettier, and `turbo build` is in none of them. Typecheck
 * cannot see it — the types resolve perfectly. Only bundling finds it, and
 * bundling is the one step the gate does not do.
 *
 * ── WHY THE RULE IS ABOUT VALUE IMPORTS ONLY ─────────────────────────────────
 * `import type { … } from '@sahoda/publishing'` is erased before bundling and is
 * harmless — `conversation-list.tsx` has done it for months. Banning both would
 * be a rule this codebase would have to break immediately, and a rule that gets
 * broken teaches people to ignore it. So the distinction is the whole guard.
 */

const SRC = resolve(import.meta.dirname, '..')

/** Barrels that reach Node built-ins and therefore cannot be bundled for a browser. */
const NODE_REACHING_BARRELS = ['@sahoda/publishing', '@sahoda/billing', '@sahoda/mesh']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** A file is a client component when its FIRST directive says so. */
function isClient(source: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(source)
}

/**
 * Value imports of `spec`, ignoring the type-only forms.
 *
 * Both forms are matched deliberately: `import type { x } from 'p'` and
 * `import { type x } from 'p'`. The second is the one a refactor produces by
 * accident, and it is erased just the same.
 */
function valueImports(source: string, spec: string): string[] {
  const found: string[] = []
  // The clause may not contain a QUOTE, which is what keeps this to one statement.
  // A lazy `[\s\S]*?` looks equivalent and is not: it spans from the file's first
  // `import` to the matching specifier, swallowing every import in between, so the
  // "is it type-only" check then reads the whole file and always says no. Caught
  // because the guard went red on `conversation-list.tsx`, which is type-only and
  // has been correct for months — a guard's first job is to be wrong out loud.
  const pattern = new RegExp(`^import\\s+([^'"]*?)from\\s+['"]${spec}['"]`, 'gm')
  for (const match of source.matchAll(pattern)) {
    const clause = match[1] ?? ''
    if (/^\s*type\s/.test(clause)) continue // `import type { … } from`
    const named = clause.replace(/[{}]/g, '').split(',')
    // Every binding prefixed with `type` is erased; a clause of only those is safe.
    if (named.every((n) => n.trim() === '' || /^type\s/.test(n.trim()))) continue
    found.push(match[0].replace(/\s+/g, ' '))
  }
  return found
}

const FILES = walk(SRC).map((file) => [file, readFileSync(file, 'utf8')] as const)
const CLIENT_FILES = FILES.filter(([, source]) => isClient(source))

describe('client components and Node-reaching barrels', () => {
  it('finds client components at all, so the rule below is not vacuous', () => {
    // PRINTED, not assumed. A directive regex that matched nothing would make
    // every assertion here pass forever — which is how the Cashfree gap survived
    // in `wiring.test.ts` for months.
    expect(FILES.length).toBeGreaterThan(100)
    expect(CLIENT_FILES.length).toBeGreaterThan(20)
  })

  it('recognises a client directive under a licence comment', () => {
    // The shape most likely to be missed by a naive `startsWith`.
    expect(isClient("'use client'\n")).toBe(true)
    expect(isClient('// a comment first\n"use client"\n')).toBe(true)
    expect(isClient('/* block */\n\n' + "'use client'")).toBe(true)
    expect(isClient("import x from 'y'\n'use client'")).toBe(false)
  })

  it('tells a value import from a type-only one', () => {
    const p = '@sahoda/publishing'
    // The exact line that broke the build.
    expect(
      valueImports("import { formatsFor, type PostFormat } from '@sahoda/publishing'", p),
    ).toHaveLength(1)
    expect(valueImports("import { isPostFormat } from '@sahoda/publishing'", p)).toHaveLength(1)
    // Both erased forms, which are legal and must stay legal.
    expect(
      valueImports("import type { ZernioConversation } from '@sahoda/publishing'", p),
    ).toHaveLength(0)
    expect(valueImports("import { type PostFormat } from '@sahoda/publishing'", p)).toHaveLength(0)
    // The leaf entry point is a different specifier and is never matched.
    expect(valueImports("import { formatsFor } from '@sahoda/publishing/format'", p)).toHaveLength(
      0,
    )
  })

  it('no client component value-imports one', () => {
    const offenders = CLIENT_FILES.flatMap(([file, source]) =>
      NODE_REACHING_BARRELS.flatMap((barrel) =>
        valueImports(source, barrel).map((line) => `${file.replace(SRC, 'src')}\n      ${line}`),
      ),
    )

    expect(
      offenders,
      'a client component value-imports a barrel that reaches node: built-ins.\n' +
        'The production build fails with UnhandledSchemeError, and `pnpm gate` cannot\n' +
        'see it because turbo build is not part of it. Import the leaf entry point\n' +
        'instead — e.g. `@sahoda/publishing/format`.',
    ).toEqual([])
  })
})

/**
 * THE SAME DEFECT ONE LAYER IN: a client component reaching a `server-only` module.
 *
 * ── THE BUILD THIS EXISTS BECAUSE OF ─────────────────────────────────────────
 * On 2026-08-21 `components/remix/batch-preview.tsx` — a client component —
 * value-imported `isSettled` from `lib/remix/read.ts`, whose first line is
 * `import 'server-only'`. Typecheck passed, every unit test passed, prettier
 * passed, and the production build died with
 *
 *   You're importing a component that needs "server-only"
 *
 * with an import trace of exactly read.ts → batch-preview.tsx.
 *
 * It is the same shape as the barrel rule above — a value import that only
 * bundling can object to — and it is checked here rather than left to the build
 * leg because the build leg runs once, at the end, for 44 seconds, and this runs
 * on every save.
 *
 * ── THE FIX IS ALWAYS THE SAME ───────────────────────────────────────────────
 * Put the pure half in its own module. `lib/remix/status.ts` is that file for
 * the case above. A TYPE import from the server module stays legal and stays
 * common — types are erased — which is why this reuses `valueImports`.
 */

/**
 * `@/x/y` and `./x` both resolve to a file under `src`; returns its source or null.
 *
 * `@/` maps to `src/`, so the base is `resolve(SRC, …)` and NOT
 * `resolve(SRC, '..', …)`. The first draft had the `'..'` and every lookup
 * silently missed — `readFileSync` threw, the catch swallowed it, and the rule
 * below reported no offenders while the defect it was written for sat two files
 * away. Caught by reintroducing that defect and watching the guard stay green,
 * which is the only reason it is not still wrong. Silence is not success.
 */
function localModuleSource(fromFile: string, spec: string): string | null {
  const base = spec.startsWith('@/')
    ? resolve(SRC, spec.slice(2))
    : spec.startsWith('.')
      ? resolve(fromFile, '..', spec)
      : null
  if (base === null) return null
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Not this extension. A specifier that resolves to none of them is a
      // package, a CSS file or a type-only path — none of which can carry
      // `server-only`, so silence is the right answer.
    }
  }
  return null
}

/** Is this module marked `server-only`? Its FIRST import, as Next requires. */
function isServerOnly(source: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*import\s+['"]server-only['"]/.test(source)
}

/** Every specifier a file imports from, with the clause, so type-only can be told apart. */
function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/^import\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/gm)].map(
    (m) => m[1] as string,
  )
}

describe('client components and server-only modules', () => {
  it('recognises the server-only directive, including under a comment', () => {
    expect(isServerOnly("import 'server-only'\n")).toBe(true)
    expect(isServerOnly("// why\nimport 'server-only'")).toBe(true)
    expect(isServerOnly("/* block */\n\nimport 'server-only'")).toBe(true)
    // Not first: Next still objects, but this guard is about the shape the repo
    // actually writes, and asserting the negative keeps the regex honest.
    expect(isServerOnly("import x from 'y'\nimport 'server-only'")).toBe(false)
    expect(isServerOnly("import { a } from './b'")).toBe(false)
  })

  it('finds at least one server-only module, so the rule below is not vacuous', () => {
    const serverOnly = FILES.filter(([, source]) => isServerOnly(source))
    expect(serverOnly.length).toBeGreaterThan(5)
  })

  it('no client component value-imports one', () => {
    const offenders = new Set<string>()
    for (const [file, source] of CLIENT_FILES) {
      // A SET, because a file importing the same module twice — once for a type,
      // once for a value — names that specifier twice and would be reported twice.
      for (const spec of new Set(importSpecifiers(source))) {
        if (valueImports(source, spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).length === 0) continue
        const target = localModuleSource(file, spec)
        if (target !== null && isServerOnly(target)) {
          offenders.add(`${file.replace(SRC, 'src')}  ->  ${spec}`)
        }
      }
    }

    expect(
      [...offenders],
      'a client component value-imports a module marked `server-only`.\n' +
        'The production build fails with "You\'re importing a component that needs\n' +
        'server-only", and neither typecheck nor any unit test can see it. Move the\n' +
        'pure half into its own module and import that — `lib/remix/status.ts` is\n' +
        'the worked example.',
    ).toEqual([])
  })
})
