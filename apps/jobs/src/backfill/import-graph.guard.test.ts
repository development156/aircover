import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The structural half of "the backfill cannot publish anything".
 *
 * `store.pglite.test.ts` proves the two statements only ever SELECT and only ever
 * UPDATE one nullable column. That is necessary but not sufficient: it constrains what
 * today's code does, not what tomorrow's can reach. A backfill that could call the
 * publish path would be a pass that walks every published variant and re-posts it —
 * the exact failure SL-069 is about, arriving through a different door.
 *
 * So the check is on REACHABILITY, not on a flag or a comment. A flag is a branch, and
 * a branch can be inverted or made unreachable by a refactor without a test noticing.
 * An unimported module cannot be called at all.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '..')

/**
 * Strip comments before scanning — load-bearing, not tidiness. `store.ts` names
 * `applyResolution` and `listUnresolvedPublishes` in its header to explain what it
 * deliberately is not. A naive scan reads that prose as a dependency and fails forever,
 * and a guard that cries wolf gets deleted as noise.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function specifiersIn(src: string): string[] {
  return [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] as string)
}

function resolveLocal(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(fromFile), spec)
  for (const candidate of [`${base}.ts`, join(base, 'index.ts'), base]) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

/** Every local module reachable from `entry`, excluding test files. */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>()
  const walk = (file: string): void => {
    const abs = resolve(file)
    if (seen.has(abs) || /\.test\.ts$/.test(abs)) return
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
    }
  }
  walk(entry)
  return seen
}

/** Every non-test source file in the backfill directory — the whole surface, not one entry. */
function backfillEntries(): string[] {
  return readdirSync(HERE)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(HERE, f))
}

/** Modules that can put a post on a real account. */
const PUBLISH_MODULES = ['publish/runPublishPost', 'publish/runClaimedPublish', 'publish/adapters']

describe('the backfill cannot reach the publish path', () => {
  it('has at least one source file to check', () => {
    // Without this the sweep below passes vacuously on an empty directory.
    expect(backfillEntries().length).toBeGreaterThan(0)
  })

  it('reaches no module that can publish, from any of its files', () => {
    const offenders: string[] = []
    for (const entry of backfillEntries()) {
      for (const reached of reachableFrom(entry)) {
        const rel = reached.replace(`${SRC}/`, '')
        if (PUBLISH_MODULES.some((m) => rel.startsWith(m))) {
          offenders.push(`${entry.replace(`${SRC}/`, '')} → ${rel}`)
        }
      }
    }
    expect(
      offenders,
      `the backfill can reach the publish path:\n${offenders.map((o) => `  ${o}`).join('\n')}`,
    ).toEqual([])
  })

  it('names no adapter and no publish entry point in the code it ships', () => {
    const forbidden = ['runPublishPost', 'runClaimedPublish', 'createAdapterSelector', 'adapterFor']
    const offenders: string[] = []
    for (const entry of backfillEntries()) {
      for (const reached of reachableFrom(entry)) {
        const src = stripComments(readFileSync(reached, 'utf8'))
        for (const name of forbidden) {
          if (src.includes(name)) offenders.push(`${reached.replace(`${SRC}/`, '')}: ${name}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * NON-VACUITY. Without this, the two tests above would also pass if the scanner
   * silently resolved nothing — and a guard that cannot fail is not a guard.
   * `runClaimedPublish` genuinely does reach `runPublishPost`, so the scanner must see
   * it. If this ever goes red, the scanner is broken and the guards above mean nothing.
   */
  it('detects the publish path where one genuinely exists', () => {
    const reached = [...reachableFrom(join(SRC, 'publish/runClaimedPublish.ts'))].map((f) =>
      f.replace(`${SRC}/`, ''),
    )
    expect(reached.some((r) => r.startsWith('publish/runPublishPost'))).toBe(true)
  })
})
