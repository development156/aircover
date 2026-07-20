import { parseArgs } from 'node:util'

/**
 * Flag parsing and summary formatting shared by `seed:demo` and `seed:demo:destroy`.
 *
 * A deliberate leaf: `node:util` only — no ./context, no ./ids, no content module. That is
 * what lets destroy.ts use it while still refusing to import anything that could fail to
 * load when the seed itself is broken (see the header of destroy.ts).
 *
 * Both entry points previously carried their own copy of every function here, and the
 * copies had already started to diverge: index.ts EXPORTED a `formatTable` that destroy.ts
 * re-implemented inline, so changing a column width in one printed a table that no longer
 * lined up with the other.
 */

export interface CliOptions {
  readonly namespace?: string
  readonly quiet: boolean
}

export function parseCliOptions(argv: readonly string[]): CliOptions {
  const { values } = parseArgs({
    // pnpm forwards a literal `--` separator through to the script, so a copy-pasted
    // `pnpm ... seed:demo -- --namespace=x` arrives here with the `--` still in argv and
    // parseArgs rejects it as an unexpected positional. The separator carries no meaning
    // for us, so both forms are accepted rather than one of them failing confusingly.
    args: argv.filter((arg) => arg !== '--'),
    // strict, so `--namespcae=x` is a loud error rather than a silent fall-through to the
    // DEFAULT namespace — which would mean seeding on top of, or destroying, the real demo.
    strict: true,
    options: {
      namespace: { type: 'string' },
      quiet: { type: 'boolean', default: false },
    },
  })
  return { namespace: values.namespace, quiet: values.quiet }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Read and validate the flags before anything connects. Both failure modes are usage
 * errors, not command failures: parseArgs throws on an unknown flag, and `validate` (the
 * caller passes `resolveNamespace`) throws on a malformed namespace. Reporting either as
 * "the seed failed and rolled back" would describe a transaction that never opened, so
 * they get their own message and `null` tells the caller to exit non-zero.
 *
 * `validate` is injected rather than imported so this file can stay a leaf.
 */
export function readOptions(
  argv: readonly string[],
  usage: string,
  validate: (options: CliOptions) => unknown,
): CliOptions | null {
  try {
    const options = parseCliOptions(argv)
    validate(options)
    return options
  } catch (error) {
    process.stderr.write(`\n  ${errorMessage(error)}\n  ${usage}\n\n`)
    return null
  }
}

/**
 * Structural on purpose — matching `SeedTableResult` without importing it keeps this file
 * free of ./context. Any row shape with these two fields formats here.
 */
export interface CountedTable {
  readonly table: string
  readonly rows: number
}

const COUNT_WIDTH = 5

export function formatTable(rows: readonly CountedTable[]): string {
  const nameWidth = Math.max(5, ...rows.map((row) => row.table.length))
  const total = rows.reduce((sum, row) => sum + row.rows, 0)
  const body = rows.map(
    (row) => `  ${row.table.padEnd(nameWidth)}  ${String(row.rows).padStart(COUNT_WIDTH)}`,
  )
  const rule = `  ${'-'.repeat(nameWidth)}  ${'-'.repeat(COUNT_WIDTH)}`
  const totalRow = `  ${'total'.padEnd(nameWidth)}  ${String(total).padStart(COUNT_WIDTH)}`
  return [...body, rule, totalRow].join('\n')
}
