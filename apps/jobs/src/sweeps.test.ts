import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * The `@sahoda/jobs/sweeps` entry point exists so apps/web can run the sweeps without
 * taking on the Trigger.dev SDK — a dependency it has no use for, that would land in a
 * serverless bundle, and whose absence is the whole reason the job cores were written
 * SDK-free in the first place.
 *
 * A comment saying "do not import the SDK here" decays the first time someone adds a
 * convenient re-export three modules down. So this walks the real import graph from the
 * real entry file and fails if the SDK is reachable from it at all.
 */
const ENTRY = resolve(import.meta.dirname, 'sweeps.ts')

/** Every local file reachable from `entry`, following relative imports only. */
function reachableFiles(entry: string): Map<string, string> {
  const seen = new Map<string, string>()
  const queue = [entry]

  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    const source = readFileSync(file, 'utf8')
    seen.set(file, source)

    for (const spec of importSpecifiers(source)) {
      if (!spec.startsWith('.')) continue
      const target = resolveLocal(dirname(file), spec)
      if (target !== null) queue.push(target)
    }
  }
  return seen
}

function importSpecifiers(source: string): string[] {
  // Covers `import … from 'x'`, `export … from 'x'`, `import 'x'`, `import('x')`
  // and `require('x')`. The last was added 2026-08-19 after an audit printed what
  // each guard in this repo actually parses: this one saw every shape but CJS.
  //
  // NOTE the asymmetry with the webhook guards, which require whitespace after
  // `from`. This file walks apps/jobs, where `pool.query` is the database call and
  // `supabase.from(` does not appear — so the looser form costs nothing here and
  // would cost a great deal in apps/web.
  const pattern = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g
  return [...source.matchAll(pattern)].map((m) => (m[1] ?? m[2])!)
}

function resolveLocal(fromDir: string, spec: string): string | null {
  for (const candidate of [`${spec}.ts`, `${spec}/index.ts`, spec]) {
    const full = resolve(fromDir, candidate)
    if (full.endsWith('.ts') && existsSync(full)) return full
  }
  return null
}

describe('the @sahoda/jobs/sweeps entry point', () => {
  it('cannot reach the Trigger.dev SDK from anywhere in its import graph', () => {
    const files = reachableFiles(ENTRY)
    const offenders = [...files]
      .filter(([, source]) => importSpecifiers(source).some((s) => s.startsWith('@trigger.dev')))
      .map(([file]) => file)

    expect(offenders).toEqual([])
  })

  it('walks a real graph, so the check above is not vacuously true', () => {
    // If the walker silently resolved nothing, the SDK assertion would pass forever.
    const files = reachableFiles(ENTRY)
    expect(files.size).toBeGreaterThan(5)
    expect([...files.keys()].some((f) => f.endsWith('dispatch/sweep.ts'))).toBe(true)
    expect([...files.keys()].some((f) => f.endsWith('holds/sweep.ts'))).toBe(true)
    expect([...files.keys()].some((f) => f.endsWith('runtime.ts'))).toBe(true)
  })

  it('detects an SDK import when one is present', () => {
    // Proves the detector works, rather than trusting a green result from a broken regex.
    const withSdk = "import { task } from '@trigger.dev/sdk'\nexport const x = task"
    expect(importSpecifiers(withSdk).some((s) => s.startsWith('@trigger.dev'))).toBe(true)
  })

  it('does not reach the model mesh or the publishing adapters either', () => {
    // Not a hard rule like the SDK, but a serverless route that only runs SQL has no
    // business pulling a model client or every platform adapter into its bundle.
    const files = reachableFiles(ENTRY)
    const heavy = [...files]
      .filter(([, source]) =>
        importSpecifiers(source).some((s) => s === '@sahoda/mesh' || s === '@sahoda/publishing'),
      )
      .map(([file]) => file)

    expect(heavy).toEqual([])
  })
})
