import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * NO `'use client'` MODULE MAY IMPORT A `'server-only'` MODULE.
 *
 * ── THE DEFECT THIS EXISTS FOR, MEASURED 2026-08-22 ─────────────────────────
 * `components/knowledge/add-document.tsx` is a client component and needed one
 * number — the upload size cap — which lived in `lib/knowledge/read-source.ts`,
 * a module that opens with `import 'server-only'` because it fetches URLs and
 * parses PDFs.
 *
 * That import passed `tsc`, passed `eslint`, passed the design lint, and passed
 * all 3,705 unit tests. What it did was return HTTP 500 for EVERY ROUTE IN THE
 * APP:
 *
 *     x You're importing a component that needs "server-only". That only works
 *       in a Server Component…
 *       ./src/lib/knowledge/read-source.ts
 *       ./src/components/knowledge/add-document.tsx
 *
 * The only thing that found it was loading a page in a browser, and the way it
 * presented was three Playwright specs failing with ERR_CONNECTION_REFUSED —
 * which reads as a dead server rather than as a bad import.
 *
 * ── WHY DIRECT IMPORTS ONLY ─────────────────────────────────────────────────
 * A full transitive walk would be the complete check and would be slow and
 * fragile against path aliases, barrel files and `node_modules`. One hop catches
 * the shape that actually happens — someone reaches for a constant, a type or a
 * small helper that happens to live beside server code — and it runs in
 * milliseconds on every gate.
 *
 * This is honest about its own limit rather than silent about it: a client
 * component importing a client module that imports a server module still gets
 * through here, and would still be caught by loading the page. What this closes
 * is the one-hop case, which is the one that has actually happened.
 */

const SRC = resolve(import.meta.dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const FILES = walk(SRC)

/** `'use client'` on one of the first lines — the directive, not a mention of it. */
function isClientModule(source: string): boolean {
  return /^\s*(['"])use client\1/m.test(source.slice(0, 400))
}

function isServerOnlyModule(source: string): boolean {
  return /^\s*import\s+(['"])server-only\1/m.test(source.slice(0, 400))
}

/**
 * Relative and `@/`-aliased VALUE imports, resolved to a path under src.
 *
 * ── TYPE-ONLY IMPORTS ARE FINE AND MUST NOT BE FLAGGED ──────────────────────
 * The first version of this matched every `from '…'`, and reported ELEVEN
 * files — ten of which are correct and shipped. `composer.tsx`,
 * `media-pane.tsx`, `workspace-switcher.tsx` and the rest all do
 *
 *     import type { Something } from '@/lib/…'
 *
 * against a `server-only` module, and that is legal: TypeScript ERASES a type
 * import, so nothing about the module reaches the bundle. What broke the app was
 * a VALUE — `MAX_UPLOAD_BYTES` survives erasure and pulls its whole module in
 * with it.
 *
 * A guard that is red on ten innocent files the day it lands is a guard someone
 * switches off in its first week. So the distinction is drawn here, and drawn
 * where the compiler draws it: `import type …` and `{ type X }` are skipped,
 * everything else counts.
 */
function localValueImports(source: string, from: string): string[] {
  const out: string[] = []
  // The whole import statement, so the clause can be inspected rather than just
  // the specifier string.
  for (const match of source.matchAll(/import\s+([\s\S]*?)from\s+['"]([^'"]+)['"]/g)) {
    const clause = match[1]!
    const spec = match[2]!

    // `import type { X } from` / `import type X from` — erased entirely.
    if (/^\s*type\s/.test(clause)) continue

    // `import { type A, type B } from` — erased entirely. A brace clause counts
    // only if at least one of its names is NOT marked `type`.
    const braces = /\{([\s\S]*)\}/.exec(clause)
    if (braces) {
      const names = braces[1]!
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
      const hasValue = names.some((n) => !/^type\s/.test(n))
      // A default or namespace binding sits OUTSIDE the braces and is a value.
      const outside = clause.replace(/\{[\s\S]*\}/, '').replace(/[,\s]/g, '')
      if (!hasValue && outside.length === 0) continue
    }

    if (spec.startsWith('@/')) out.push(resolve(SRC, spec.slice(2)))
    else if (spec.startsWith('.')) out.push(resolve(from, '..', spec))
  }
  return out
}

/** Try the extensions a bare specifier could mean. */
function readModule(base: string): string | null {
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      /* next candidate */
    }
  }
  return null
}

describe("a 'use client' module never imports a 'server-only' one", () => {
  it('has client modules to check at all', () => {
    // Guard the guard. A regex that stopped matching the directive would report
    // a clean sweep of nothing, which looks identical to a clean sweep.
    const clients = FILES.filter((f) => isClientModule(readFileSync(f, 'utf8')))
    expect(clients.length).toBeGreaterThan(50)
  })

  it('finds server-only modules to be caught by, at all', () => {
    const servers = FILES.filter((f) => isServerOnlyModule(readFileSync(f, 'utf8')))
    expect(servers.length).toBeGreaterThan(20)
  })

  it('still counts a VALUE import while skipping a type-only one', () => {
    // The exemption above is the part most likely to be wrong, and wrong in the
    // direction that makes this whole file report nothing. So it is exercised
    // against both shapes rather than trusted.
    const here = resolve(SRC, 'components/x.tsx')
    const skipped = [
      `import type { A } from '@/lib/a'`,
      `import { type A, type B } from '@/lib/a'`,
      `import type A from '@/lib/a'`,
    ]
    for (const line of skipped) expect(localValueImports(line, here)).toEqual([])

    const counted = [
      `import { A } from '@/lib/a'`,
      `import { type A, B } from '@/lib/a'`,
      `import A from '@/lib/a'`,
      `import * as A from '@/lib/a'`,
      `import A, { type B } from '@/lib/a'`,
    ]
    for (const line of counted) {
      expect(localValueImports(line, here), line).toEqual([resolve(SRC, 'lib/a')])
    }
  })

  it('has no client module importing one directly', () => {
    const offences: string[] = []

    for (const file of FILES) {
      const source = readFileSync(file, 'utf8')
      if (!isClientModule(source)) continue

      for (const target of localValueImports(source, file)) {
        const imported = readModule(target)
        if (imported && isServerOnlyModule(imported)) {
          offences.push(
            `${file.replace(`${SRC}/`, '')} imports ${target.replace(`${SRC}/`, '')}, which is server-only`,
          )
        }
      }
    }

    expect(
      offences,
      'These return HTTP 500 for every route in the app, not just their own page.',
    ).toEqual([])
  })
})
