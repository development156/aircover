import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

/**
 * Mutation testing that cannot lie about what it did (SL-064).
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Mutation checks were run twice on 2026-08-03 as ad-hoc shell: back up a file
 * with `cp`, break it, run the tests, `cp` it back. Both times the backup
 * directory did not exist, so every `cp` failed — and the loop carried on. The
 * first time it silently mutated a COMMENT and reported "20 passed" as if the
 * mutant had survived, which is a false negative dressed as evidence. The
 * second time it left three genuinely mutated source files in the working tree
 * under a report that said all three mutants were killed and everything was
 * restored.
 *
 * That is the exact failure shape this board keeps recording — a step that did
 * not happen, reported as success — occurring INSIDE the tool whose whole job
 * is to prove that a fix is real. A harness that can report a verdict it did
 * not earn is worse than no harness, because its output is trusted more.
 *
 * ── THE THREE RULES, ENFORCED STRUCTURALLY ──────────────────────────────────
 * 1. The scratch directory is CREATED and PROBED (write, read back, compare)
 *    before any backup is taken. Not `existsSync` — a directory that exists but
 *    cannot be written to fails in exactly the same way.
 * 2. Every backup is VERIFIED after the copy by hashing the file back off disk
 *    and comparing it to what was read. A copy nobody checked is a copy.
 * 3. The report REFUSES TO EXIST if any restore is unconfirmed. `formatReport`
 *    throws rather than returning a string, so there is no code path that
 *    prints results while a source file is still mutated. The failure names
 *    every affected file and where its backup is, because at that point a human
 *    has to recover the tree by hand.
 *
 * Every function here throws on failure and returns only on verified success.
 * There are no boolean returns to ignore and no warnings to scroll past.
 */

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Thrown for every failure here, so a caller can tell ours from a test's. */
export class MutationHarnessError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MutationHarnessError'
  }
}

/**
 * Create the scratch directory and PROVE it is writable.
 *
 * The probe is the point. `mkdirSync(..., {recursive: true})` succeeding tells
 * you a path exists, not that a later write will land there — and the original
 * bug was a write that did not land. So we write a file, read it back, compare
 * it, and delete it. If any of that fails, nothing else in this module runs.
 */
export function ensureScratchDir(dir) {
  const path = resolve(dir)
  try {
    mkdirSync(path, { recursive: true })
  } catch (error) {
    throw new MutationHarnessError(
      `cannot create the scratch directory ${path}: ${error.message}\n` +
        'No mutation may run: there is nowhere to put a backup, and running ' +
        'without one is how source files get left mutated.',
    )
  }

  const probe = resolve(path, `.probe-${process.pid}`)
  const token = `probe ${process.pid}`
  try {
    writeFileSync(probe, token, 'utf8')
    const read = readFileSync(probe, 'utf8')
    if (read !== token) {
      throw new Error(`wrote ${token.length} bytes and read back ${read.length}`)
    }
  } catch (error) {
    throw new MutationHarnessError(
      `the scratch directory ${path} is not writable: ${error.message}\n` + 'No mutation may run.',
    )
  } finally {
    try {
      rmSync(probe, { force: true })
    } catch {
      // A probe we could not delete is untidy, not unsafe.
    }
  }

  return path
}

/**
 * Copy `file` into `dir` and verify the copy byte-for-byte.
 *
 * Returns the record `applyMutant`/`restoreBackup` need. Throws if the file is
 * missing, or if what landed on disk does not hash to what was read.
 */
export function takeBackup(file, dir) {
  const source = resolve(file)
  if (!existsSync(source)) {
    throw new MutationHarnessError(`cannot back up ${source}: it does not exist.`)
  }

  const original = readFileSync(source, 'utf8')
  const sha = sha256(original)
  const backupPath = resolve(dir, `${basename(source)}.${sha.slice(0, 12)}.bak`)

  writeFileSync(backupPath, original, 'utf8')

  // THE CHECK THAT WAS MISSING. Read it back off disk rather than trusting the
  // write, because the whole incident was a copy that never happened.
  if (!existsSync(backupPath)) {
    throw new MutationHarnessError(
      `backup of ${source} was written to ${backupPath} but is not there afterwards.`,
    )
  }
  const readBack = readFileSync(backupPath, 'utf8')
  if (sha256(readBack) !== sha) {
    throw new MutationHarnessError(
      `backup of ${source} does not match the original (${backupPath}). Refusing to mutate it.`,
    )
  }

  return { file: source, backupPath, original, sha }
}

/**
 * Replace `find` with `replace` in the file, requiring EXACTLY ONE occurrence.
 *
 * Zero matches means the mutation silently did nothing and the "survived"
 * verdict would be meaningless — that is the first ad-hoc run's false negative.
 * More than one means the mutation is not the one described. Both throw.
 */
export function applyMutant(record, find, replace) {
  const current = readFileSync(record.file, 'utf8')
  if (sha256(current) !== record.sha) {
    throw new MutationHarnessError(
      `${record.file} changed between backup and mutation. Refusing to mutate a file that is ` +
        'not the one that was backed up.',
    )
  }

  const count = current.split(find).length - 1
  if (count !== 1) {
    /**
     * ZERO MATCHES *AND* THE REPLACEMENT ALREADY PRESENT IS A STRANDED MUTANT.
     *
     * This harness restores every file it touches — but only if it is allowed to
     * finish. SIGKILL, a shell timeout, or a killed process group leaves the last
     * mutant applied, and the next run then reports "expected exactly 1
     * occurrence, found 0", which reads as a broken SPEC and sends the reader to
     * edit a spec that is perfectly correct.
     *
     * MEASURED twice in one session: once when a mutant that made a stream
     * unbounded had to be killed, and once when a two-minute command timeout cut
     * a run off mid-mutation. Both times the file was still carrying its mutation
     * and the diagnosis took longer than the fix.
     *
     * The signal is exact — the target is gone and the thing it would have been
     * replaced BY is there — so it is worth saying out loud rather than leaving
     * as an inference.
     */
    const looksStranded = count === 0 && current.includes(replace)
    throw new MutationHarnessError(
      `expected exactly 1 occurrence of the mutation target in ${record.file}, found ${count}.\n` +
        `  target: ${JSON.stringify(find.slice(0, 120))}\n` +
        (looksStranded
          ? "  THE FILE IS ALREADY MUTATED. It contains this mutant's replacement text and not\n" +
            '  its target, which is what an interrupted run leaves behind — a kill, a timeout, or\n' +
            `  a reaped process group. Restore it before trusting anything:\n` +
            `      git checkout -- ${record.file}\n` +
            `  or from this run's own backup: ${record.backupPath}`
          : count === 0
            ? '  Zero matches means the mutant was never applied — a "survived" verdict here ' +
              'would be about unmodified code.'
            : '  More than one match means this is not the mutation described.'),
    )
  }

  /**
   * A REPLACER FUNCTION, NEVER A REPLACEMENT STRING.
   *
   * ⚠ FOUND 2026-08-23, AND IT HAD BEEN SILENTLY FAKING KILLS ⚠
   * `String.prototype.replace` treats `$` in a replacement STRING as an escape:
   * `$$` inserts one literal `$`, and `$1`, `$&`, `` $` `` and `$'` all mean
   * something too. A PL/pgSQL body is delimited by `$$`, so a SQL mutant whose
   * replacement carried one wrote `$;` where it meant `$$;` — which unbalances
   * the dollar quote and makes every function BELOW it a syntax error.
   *
   * MEASURED: the same mutant killed cleanly when applied by hand (4 failed,
   * 3 passed) and reported `Tests 7 skipped (7)` under this harness, because the
   * migration no longer parsed and `beforeAll` threw. Exit code 1 either way — so
   * it read as a kill, from a run where nothing was tested and the code under
   * test was not the code the mutant described.
   *
   * A function replacer is substituted verbatim, which is what every caller here
   * has always meant.
   */
  writeFileSync(
    record.file,
    current.replace(find, () => replace),
    'utf8',
  )

  const mutated = readFileSync(record.file, 'utf8')
  if (sha256(mutated) === record.sha) {
    throw new MutationHarnessError(
      `${record.file} is unchanged after applying the mutant — the write did not land.`,
    )
  }
  // The mutation must be the one described: applying `find → replace` by hand and
  // finding `replace` absent is the shape the `$$` defect took.
  if (!mutated.includes(replace)) {
    throw new MutationHarnessError(
      `${record.file} does not contain the replacement text after mutation. The write landed ` +
        'but produced something other than what the mutant describes.',
    )
  }
  return mutated
}

/**
 * Put the original back and PROVE it is back, by hash.
 *
 * Returns nothing on success and throws on failure — there is no boolean for a
 * caller to drop on the floor, which is how three mutated files survived a run
 * that reported them restored.
 */
export function restoreBackup(record) {
  try {
    writeFileSync(record.file, record.original, 'utf8')
  } catch (error) {
    throw new MutationHarnessError(
      `RESTORE FAILED for ${record.file}: ${error.message}\n` +
        `  The file is still mutated. Its original is at ${record.backupPath}.`,
    )
  }

  const now = readFileSync(record.file, 'utf8')
  if (sha256(now) !== record.sha) {
    throw new MutationHarnessError(
      `RESTORE UNVERIFIED for ${record.file}: it does not hash to the original.\n` +
        `  expected ${record.sha}\n  actual   ${sha256(now)}\n` +
        `  The original is at ${record.backupPath}. Restore it by hand before trusting this tree.`,
    )
  }
}

/**
 * The report — and the refusal.
 *
 * Throws when anything is unrestored, so no caller can print a results table
 * over a mutated working tree. This is the rule that the ad-hoc script broke:
 * it printed three "killed" verdicts while three source files were still
 * carrying their mutants.
 */
export function formatReport(results, unrestored = []) {
  if (unrestored.length > 0) {
    throw new MutationHarnessError(
      'REFUSING TO REPORT — the working tree is not back to how it started.\n' +
        unrestored.map((entry) => `  · ${entry.file}\n    backup: ${entry.backupPath}`).join('\n') +
        '\n\nMutation results are meaningless while source files are still mutated, and printing ' +
        'them would attach a passing verdict to a tree nobody has repaired. Restore the files ' +
        'above from their backups, then run this again.',
    )
  }

  const width = Math.max(0, ...results.map((r) => r.name.length))
  const lines = results.map((result) => {
    const verdict = result.killed ? 'KILLED  ' : 'SURVIVED'
    return `  ${result.name.padEnd(width)}  ${verdict}  ${result.summary}`
  })

  const survivors = results.filter((result) => !result.killed)
  return [
    `mutation-check: ${results.length - survivors.length}/${results.length} mutants killed`,
    ...lines,
    ...(survivors.length > 0
      ? [
          '',
          `${survivors.length} mutant(s) SURVIVED — the tests pass with the code broken, so they ` +
            'are not testing what they appear to test.',
        ]
      : []),
  ].join('\n')
}

/**
 * Run every mutant: back up, break, test, restore, verify.
 *
 * `runTests` is injected so this is testable without spawning a test runner,
 * and so the harness cannot be blamed for the runner's behaviour. It receives
 * the mutant and returns `{killed, summary}`.
 *
 * A mutant whose SETUP throws is not silently skipped: it is recorded as a
 * setup failure and the whole run exits non-zero, because a mutation that never
 * ran must never read as a mutation that was killed.
 */
export async function runMutants({ mutants, runTests, scratchDir }) {
  const dir = ensureScratchDir(scratchDir)

  const results = []
  const unrestored = []
  const setupFailures = []

  for (const mutant of mutants) {
    let record = null
    try {
      record = takeBackup(mutant.file, dir)
      applyMutant(record, mutant.find, mutant.replace)

      const outcome = await runTests(mutant)
      results.push({ name: mutant.name, killed: Boolean(outcome.killed), summary: outcome.summary })
    } catch (error) {
      setupFailures.push({ name: mutant.name, message: error.message })
    } finally {
      if (record) {
        try {
          restoreBackup(record)
        } catch (error) {
          unrestored.push({ ...record, message: error.message })
        }
      }
    }
  }

  // Order matters: the refusal comes first. A run with both an unrestored file
  // and a setup failure must lead with the tree being broken.
  const report = formatReport(results, unrestored)

  if (setupFailures.length > 0) {
    throw new MutationHarnessError(
      'Some mutants never ran, so this run proves nothing about them:\n' +
        setupFailures.map((f) => `  · ${f.name}: ${f.message}`).join('\n'),
    )
  }

  return { report, results }
}
