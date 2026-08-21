import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The admissible values of every CHECK-constrained text column, read from the
 * migrations, and every string literal the application compares against one.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `connections.status` admits ('active','expired','revoked','error') and
 * `upsert_connection` writes 'active'. Three separate read sites filtered on
 * `status = 'connected'` — a value the CHECK does not admit and no row has ever
 * held. Measured against production on 2026-08-22: 4 'expired', 2 'active',
 * zero 'connected'.
 *
 * The consequence was not an error. It was silence. The Autonomy Dial told every
 * workspace to "connect a channel" including the two that had, and the Loop's
 * cycle took its zero-channel path unconditionally, for everyone, always.
 *
 * That is what makes this class worth a guard rather than a fix. A filter that
 * matches nothing returns `[]`, and `[]` is exactly what a legitimately empty
 * table returns. Every test that asserts "a workspace with no channels is told
 * to connect one" passes. Every test that asserts "the cycle skips when there
 * are no channels" passes. The defect is invisible to any test written against
 * the code's own assumptions, and it was found because Postgres rejected a seed
 * row — not by reading, and not by the suite.
 *
 * So this does not check for 'connected'. It derives the admissible set from
 * the schema and adjudicates every comparison in the repo against it.
 */

/** Walk up until the directory containing `pnpm-workspace.yaml` — path-agnostic. */
export function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let up = 0; up < 12; up += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  throw new Error('could not locate the repo root')
}

/** table -> column -> the values the CHECK admits. */
export type ConstraintMap = Map<string, Map<string, Set<string>>>

const QUOTED = /'([^']*)'/g

/** `noUncheckedIndexedAccess` is on: a capture group is `string | undefined`. */
const g = (m: RegExpMatchArray, i: number): string => m[i] ?? ''

function valuesIn(list: string): Set<string> {
  const out = new Set<string>()
  for (const m of list.matchAll(QUOTED)) out.add(g(m, 1))
  return out
}

function record(map: ConstraintMap, table: string, column: string, values: Set<string>): void {
  if (values.size === 0) return
  const cols = map.get(table) ?? new Map<string, Set<string>>()
  cols.set(column, values)
  map.set(table, cols)
}

/**
 * Read every `check (<col> in (...))` out of the migrations.
 *
 * Migrations are applied in filename order and a later one may drop and replace
 * a constraint, so they are read in that same order and a later definition
 * overwrites an earlier one — otherwise `widen_connection_platform` would be
 * adjudicated against the set it exists to replace.
 */
export function readConstraints(root = repoRoot()): ConstraintMap {
  const dir = join(root, 'packages/db/supabase/migrations')
  const map: ConstraintMap = new Map()
  if (!existsSync(dir)) return map

  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.sql')) continue
    const sql = readFileSync(join(dir, file), 'utf8')
    const stripped = sql.replace(/--[^\n]*/g, '')

    // 1) Inline column definitions inside `create table <tbl> ( ... )`.
    for (const table of stripped.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_.]+)\s*\(/gi)) {
      const body = stripped.slice((table.index ?? 0) + g(table, 0).length)
      const end = body.search(/\n\s*\)\s*;/)
      const cols = end === -1 ? body : body.slice(0, end)
      const name = g(table, 1).replace(/^public\./, '')
      for (const c of cols.matchAll(/\bcheck\s*\(\s*([a-z_]+)\s+in\s*\(([^)]*)\)/gi)) {
        record(map, name, g(c, 1), valuesIn(g(c, 2)))
      }
    }

    // 2) `alter table <tbl> add constraint <name> check (<col> in (...))`.
    for (const a of stripped.matchAll(
      /alter\s+table\s+(?:only\s+)?([a-z_.]+)[\s\S]{0,200}?add\s+constraint\s+[a-z_]+\s+check\s*\(\s*\(?\s*([a-z_]+)\s+in\s*\(([^)]*)\)/gi,
    )) {
      record(map, g(a, 1).replace(/^public\./, ''), g(a, 2), valuesIn(g(a, 3)))
    }
  }
  return map
}

/** One place the application compares a column against a fixed string. */
export interface Comparison {
  file: string
  line: number
  table: string
  column: string
  values: string[]
  /** The call that produced it, for the failure message. */
  form: string
}

const SOURCE_ROOTS = [
  'apps/web/src',
  'apps/jobs/src',
  'packages/billing/src',
  'packages/mesh/src',
  'packages/publishing/src',
  'packages/research/src',
  'packages/shared/src',
  'packages/sites/src',
]

function sourceFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry)) out.push(full)
    }
  }
  for (const r of SOURCE_ROOTS) walk(join(root, r))
  return out.sort()
}

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length

/**
 * Resolve `[...FOO]` / `FOO` to its literal members when FOO is declared
 * anywhere in the repo as `const FOO = ['a','b'] as const`.
 *
 * Without this, `.in('status', [...APPROVABLE_FROM])` is unadjudicable, and an
 * allowlist constant is precisely where a wrong status value would survive
 * longest — it is written once, far from every site that uses it.
 */
export function resolveConstArrays(root = repoRoot()): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=\s*\[([^\]]*)\]/g)) {
      const values = [...g(m, 2).matchAll(QUOTED)].map((q) => g(q, 1))
      const name = g(m, 1)
      if (values.length > 0 && !out.has(name)) out.set(name, values)
    }
  }
  return out
}

/**
 * Every comparison of a column against fixed strings, with the table it runs
 * against.
 *
 * A supabase chain names its table once (`.from('connections')`) and its filters
 * later, so each `.from()` opens a window that closes at the NEXT `.from()` or
 * at a blank line. That boundary is not cosmetic: `readLoopSnapshot` issues five
 * `.from()` chains inside one `Promise.all`, and without it the connections
 * filter and the `memory_events` filter would be attributed to each other.
 */
export function findComparisons(root = repoRoot(), consts = resolveConstArrays(root)): Comparison[] {
  const found: Comparison[] = []

  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, 'utf8')
    const rel = file.slice(root.length + 1)

    // ── supabase query builders ──────────────────────────────────────────────
    const froms = [...text.matchAll(/\.from\(\s*'([a-z_]+)'/g)]
    for (let i = 0; i < froms.length; i += 1) {
      const from = froms[i]!
      const start = (from.index ?? 0) + g(from, 0).length
      const nextFrom = i + 1 < froms.length ? (froms[i + 1]!.index ?? text.length) : text.length
      const blank = text.indexOf('\n\n', start)
      const end = Math.min(nextFrom, blank === -1 ? text.length : blank, start + 2000)
      const window = text.slice(start, end)
      const table = g(from, 1)

      for (const eq of window.matchAll(/\.(eq|neq)\(\s*'([a-z_]+)'\s*,\s*'([^']*)'/g)) {
        found.push({
          file: rel,
          line: lineOf(text, start + (eq.index ?? 0)),
          table,
          column: g(eq, 2),
          values: [g(eq, 3)],
          form: `.${g(eq, 1)}('${g(eq, 2)}', '${g(eq, 3)}')`,
        })
      }
      for (const inc of window.matchAll(/\.(in|not)\(\s*'([a-z_]+)'\s*,\s*(?:'in'\s*,\s*)?\[([^\]]*)\]/g)) {
        const literal = [...g(inc, 3).matchAll(QUOTED)].map((q) => g(q, 1))
        const spread = [...g(inc, 3).matchAll(/\.\.\.\s*([A-Z][A-Z0-9_]*)/g)].flatMap(
          (sp) => consts.get(g(sp, 1)) ?? [],
        )
        const values = [...literal, ...spread]
        if (values.length === 0) continue
        found.push({
          file: rel,
          line: lineOf(text, start + (inc.index ?? 0)),
          table,
          column: g(inc, 2),
          values,
          form: `.${g(inc, 1)}('${g(inc, 2)}', [${values.map((v) => `'${v}'`).join(', ')}])`,
        })
      }
    }

    // ── raw SQL in template literals ─────────────────────────────────────────
    for (const sql of text.matchAll(/`([^`]*\bfrom\s+[a-z_][\s\S]*?)`/g)) {
      const body = g(sql, 1)

      /**
       * alias -> table, because a join makes the first `from` the wrong answer.
       *
       * `pgDispatch` selects `from posts` and then, four joins later, filters
       * `pl.status = 'succeeded'` on `post_publish_logs`. Attributing that to
       * `posts` reports a defect in correct code — and a guard that cries wolf
       * is a guard somebody deletes. The qualifier is the authority here.
       */
      const alias = new Map<string, string>()
      const tables = new Set<string>()
      for (const t of body.matchAll(/\b(?:from|join)\s+([a-z_]+)(?:\s+(?:as\s+)?([a-z][a-z0-9_]*))?/gi)) {
        const table = g(t, 1).toLowerCase()
        if (table === 'lateral' || table === 'select') continue
        tables.add(table)
        alias.set(table, table)
        const a = t[2]?.toLowerCase()
        if (a && !['on', 'where', 'order', 'group', 'limit', 'left', 'inner', 'join', 'and', 'as'].includes(a)) {
          alias.set(a, table)
        }
      }

      /**
       * An unqualified column in a multi-table statement is ambiguous, so it is
       * not adjudicated rather than guessed. Every unqualified comparison this
       * repo actually contains lives in a single-table statement.
       */
      const tableFor = (qualifier: string | undefined): string | null => {
        if (qualifier) return alias.get(qualifier.toLowerCase()) ?? null
        return tables.size === 1 ? ([...tables][0] ?? null) : null
      }

      for (const cmp of body.matchAll(/(?:\b([a-z][a-z0-9_]*)\.)?\b([a-z_]+)\s*=\s*'([^']*)'/g)) {
        const table = tableFor(cmp[1])
        if (!table) continue
        found.push({
          file: rel,
          line: lineOf(text, (sql.index ?? 0) + (cmp.index ?? 0)),
          table,
          column: g(cmp, 2),
          values: [g(cmp, 3)],
          form: `${cmp[1] ? `${cmp[1]}.` : ''}${g(cmp, 2)} = '${g(cmp, 3)}'`,
        })
      }
      for (const cmp of body.matchAll(/(?:\b([a-z][a-z0-9_]*)\.)?\b([a-z_]+)\s+in\s*\(([^)]*'[^)]*)\)/gi)) {
        const table = tableFor(cmp[1])
        if (!table) continue
        const values = [...g(cmp, 3).matchAll(QUOTED)].map((q) => g(q, 1))
        if (values.length === 0) continue
        found.push({
          file: rel,
          line: lineOf(text, (sql.index ?? 0) + (cmp.index ?? 0)),
          table,
          column: g(cmp, 2),
          values,
          form: `${cmp[1] ? `${cmp[1]}.` : ''}${g(cmp, 2)} in (${values.map((v) => `'${v}'`).join(', ')})`,
        })
      }
    }
  }
  return found
}

/** A comparison whose value the column's CHECK does not admit. */
export interface Mismatch extends Comparison {
  impossible: string[]
  admits: string[]
}

export function adjudicate(comparisons: Comparison[], constraints: ConstraintMap): Mismatch[] {
  const out: Mismatch[] = []
  for (const c of comparisons) {
    const admits = constraints.get(c.table)?.get(c.column)
    if (!admits) continue
    const impossible = c.values.filter((v) => !admits.has(v))
    if (impossible.length > 0) out.push({ ...c, impossible, admits: [...admits] })
  }
  return out
}

/** Comparisons that were actually adjudicated — the guard's own coverage. */
export function adjudicable(comparisons: Comparison[], constraints: ConstraintMap): Comparison[] {
  return comparisons.filter((c) => constraints.get(c.table)?.get(c.column))
}
