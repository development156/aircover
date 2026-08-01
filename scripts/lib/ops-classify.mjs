/**
 * Turn a Bash tool call into auto QA runs, or into nothing (doc 13 §9.3).
 *
 * THE RULE THAT MATTERS: when the outcome cannot be read with confidence, this
 * returns nothing and no run is recorded. It never defaults to 'pass'. A QA
 * console that invents green rows is worse than one with gaps in it, and doc 13
 * §11 lets a red run block a card from Done — so a guessed verdict has teeth.
 *
 * Exit codes are not reliably present in the PostToolUse payload, so the verdict
 * comes from the runner's own summary line where one exists, and from the exit
 * code only when the harness supplied it.
 *
 * Pure functions, no I/O — ops-classify.test.mjs pins every branch.
 */

/** Commands worth recording. Anything else is not QA and is ignored. */
const RUNNER = [
  { re: /\bplaywright\b|\btest:smoke\b/, suite: 'smoke' },
  { re: /\btest:e2e\b/, suite: 'e2e' },
  { re: /\btsc\b|\btypecheck\b/, suite: 'typecheck' },
  { re: /\beslint\b|\blint\b/, suite: 'lint' },
  { re: /\bvitest\b|\bturbo\b.*\btest\b|\bpnpm\b.*\btest\b/, suite: 'unit' },
]

/** Most substantive first — used to label a failure that cannot be attributed. */
const SUBSTANCE = ['e2e', 'smoke', 'rls', 'unit', 'lint', 'typecheck']

/**
 * `rls` is a suite in its own right (doc 13 §12 gates on it), and it is the one
 * that cannot be inferred from the runner alone — it is a vitest run that
 * happens to target the isolation suites.
 */
function refineSuite(suite, command) {
  if (suite !== 'unit') return suite
  return /ops_rls|tests\/rls|\brls\b/.test(command) ? 'rls' : 'unit'
}

/**
 * EVERY suite the command covers, not just the first.
 *
 * `pnpm turbo run typecheck lint test` runs three of them. Recording one row
 * labelled `typecheck` told the gates strip (doc 13 §12) that lint and unit had
 * not been seen since whenever, which is false — and it understated a passing
 * gate, which is its own kind of dishonesty.
 */
export function suitesFor(command) {
  if (typeof command !== 'string' || command.trim() === '') return []
  const found = RUNNER.filter(({ re }) => re.test(command)).map(({ suite }) =>
    refineSuite(suite, command),
  )
  return [...new Set(found)]
}

/** Kept for callers that only want one label. */
export function suiteFor(command) {
  const all = suitesFor(command)
  if (all.length === 0) return null
  return [...all].sort((a, b) => SUBSTANCE.indexOf(a) - SUBSTANCE.indexOf(b))[0]
}

/**
 * pass | fail | null.
 *
 * Ordered so failure evidence always beats success evidence: a turbo run that
 * reports "23 successful, 24 total" alongside a failing task must read as fail.
 */
export function verdictFor({ output = '', exitCode = null }) {
  const text = stripAnsi(String(output))

  const FAIL = [
    /\b\d+\s+failed\b/i,
    /\bERROR\s+run failed\b/,
    /\berror TS\d+/,
    /\bELIFECYCLE\b/i,
    /\bTest failed\b/i,
    /\bAssertionError\b/,
  ]
  if (FAIL.some((re) => re.test(text))) return 'fail'

  if (typeof exitCode === 'number') return exitCode === 0 ? 'pass' : 'fail'

  const PASS = [
    /\bTests\s+\d+\s+passed\b/i,
    /\bTest Files\s+\d+\s+passed\b/i,
    /\bTasks:\s+\d+\s+successful,\s+\d+\s+total\b/,
    /\b\d+\s+passed\b/i,
  ]
  if (PASS.some((re) => re.test(text))) return 'pass'

  // Silence is the ambiguous case, not the good case: `tsc --noEmit` prints
  // nothing when it is happy AND nothing when it never ran. Without an exit code
  // there is no way to tell those apart, so neither is claimed.
  return null
}

/**
 * Terminal colour codes are noise in a database column and in the QA console
 * that renders it. Stripped on the way in — the row is a record, not a replay.
 */
export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text ?? '').replace(/\[[0-9;]*[A-Za-z]/g, '')
}

/**
 * How many tests, when the runner says so — for the summary line, never the verdict.
 *
 * SUMMED across the whole log, not taken from the first match. A turbo run
 * interleaves one summary per package, so reading the first one reported "22
 * passed" for a run of 1296 — a number that was real, attached to the wrong
 * thing, and lower than the truth. A count in a QA record has to be the count.
 */
/**
 * Which packages a command actually covered (SL-051 follow-up).
 *
 * 44 of 50 recorded "unit passed" runs never executed packages/db, and 38 of
 * those were `--filter=@sahoda/web` runs recorded as a bare `unit` pass. The
 * gates strip then renders that as the unit suite being green. A run's scope
 * has to survive into its record, or the record claims more than the run did.
 *
 * Returns null for an unfiltered run — that genuinely covered the workspace.
 */
export function coverageFor(command) {
  if (typeof command !== 'string') return null
  const found = [...command.matchAll(/--filter[= ]([^\s]+)/g)].map((m) => m[1].replace(/^['"]|['"]$/g, ''))
  return found.length === 0 ? null : [...new Set(found)]
}

export function countsFor(output) {
  const text = stripAnsi(output)

  // Read per SUMMARY LINE, not with one pattern over the whole log. vitest prints
  // `Tests  1296 passed (1296)` when green but `Tests  1 failed | 1295 passed`
  // when red — so a `Tests\s+(\d+)\s+passed` pattern silently drops the passed
  // count of exactly the runs anyone looks at, which is how a failing gate got
  // recorded as "222 passed" out of 1518.
  const summaries = text.split('\n').filter((line) => /\bTests\b/.test(line))

  const sum = (re) => {
    const values = summaries
      .map((line) => re.exec(line)?.[1])
      .filter((value) => value !== undefined)
      .map(Number)
      .filter(Number.isFinite)
    return values.length === 0 ? null : values.reduce((a, b) => a + b, 0)
  }

  return {
    passed: sum(/(\d+)\s+passed/i),
    failed: sum(/(\d+)\s+failed/i),
    // SL-051. This function was hardened three times against UNDERSTATING
    // success — the comment above still says understatement "is its own kind of
    // dishonesty" — and nobody asked the opposite question: should a test that
    // never ran count as one that passed? Vitest prints
    // `Tests 71 passed | 202 skipped (273)` and the 202 was invisible, so a run
    // where the entire database suite was skipped recorded as "the checks ran
    // and everything passed". A skip is not a pass. It is not a failure either;
    // it is an absence, and the summary has to say so.
    skipped: sum(/(\d+)\s+skipped/i),
  }
}

/**
 * The whole decision. Returns zero or more qa.pending entries.
 *
 * On PASS a combined command yields one row per suite it covered: an aggregate
 * pass genuinely proves each part passed, and the gates strip needs all of them
 * to go green.
 *
 * On FAIL it yields exactly ONE row, labelled with the most substantive suite
 * present. An aggregate failure does NOT tell us which part broke, and marking
 * three suites red on the strength of one failure would be inventing evidence in
 * the other direction.
 */
export function classifyBashRuns({ command, output, exitCode, durationMs }) {
  const suites = suitesFor(command)
  if (suites.length === 0) return []

  const status = verdictFor({ output, exitCode })
  if (!status) return []

  const { passed, failed, skipped } = countsFor(output)
  const coverage = coverageFor(command)
  const detail =
    passed === null && failed === null
      ? ''
      : ` (${[passed !== null ? `${passed} passed` : null, failed ? `${failed} failed` : null]
          .filter(Boolean)
          .join(', ')})`

  // Tail only: a full turbo run is tens of kilobytes and the useful part is the end.
  const details = stripAnsi(output).slice(-4000)
  const duration_ms =
    typeof durationMs === 'number' && durationMs >= 0 ? Math.round(durationMs) : null

  if (status === 'fail') {
    const suite = suiteFor(command)
    return [
      {
        suite,
        status,
        summary_plain:
          suites.length > 1
            ? `The ${suites.join(', ')} checks ran together and something failed${detail}.`
            : `The ${suite} checks ran and something failed${detail}.`,
        details,
        duration_ms,
      },
    ]
  }

  return suites.map((suite) => ({
    suite,
    status,
    // "everything passed" is only sayable when nothing was skipped. With skips
    // present the sentence names them, because the difference between "247
    // tests passed" and "45 passed and 202 never ran" is the whole point of
    // recording a QA run at all.
    summary_plain:
      skipped !== null && skipped > 0
        ? `The ${suite} checks ran${detail}, but ${skipped} test${
            skipped === 1 ? '' : 's'
          } did NOT run — this does not prove the suite passes.`
        : coverage
          ? `The ${suite} checks passed${detail} for ${coverage.join(', ')} ONLY — this run was filtered and does not cover the workspace.`
          : `The ${suite} checks ran and everything passed${detail}.`,
    details,
    duration_ms,
  }))
}

/**
 * Which cards a commit CLOSES — read from the conventional-commit scope only.
 *
 * Doc 13 §9.3 says "scan the message for SL-### codes", and scanning the whole
 * message is what this did until it closed two cards that were not done. Commit
 * 8f379e9's body contains the sentence "SL-028 is still To Do"; the hook read it
 * and moved SL-028 to Done. The board contradicted the very commit that fed it.
 *
 * A scope is a deliberate claim — writing `feat(SL-011):` asserts this commit is
 * that card's work. Body prose is discussion: it names cards to explain
 * decisions, defer them, or say why they are NOT finished. Only the scope closes.
 *
 * Merge commits have no scope, which is correct: a merge completes nothing.
 */
/** A subject line, anchored: `type(scope): summary`. Not a pattern found mid-prose. */
const CONVENTIONAL_SUBJECT =
  /^(feat|fix|chore|docs|refactor|test|perf|ci|style|build|revert)\(([^)]*)\)!?:\s/

/**
 * Which conventional-commit TYPES finish work.
 *
 * Scope-only fixed the false positives from body prose, and then a new one
 * arrived through the front door: `docs(SL-040): card the eight-step
 * walkthrough` was the commit that CREATED that card, and the hook read the
 * scope as a claim of completion and moved it to Done. The board then said the
 * user had walked a walkthrough that nobody has walked — which is precisely the
 * drift-toward-looking-finished the board exists to prevent.
 *
 * So the scope says WHICH card and the type says WHETHER it is finished. Only
 * `feat` and `fix` complete. Carding something (`chore`), describing it
 * (`docs`), writing its tests (`test`), or tidying it (`refactor`) are all real
 * work on a card that is demonstrably not done, because if it were done the
 * commit would have been a feat or a fix.
 *
 * Deliberately asymmetric: a missed auto-close costs one `ops-card task X done`,
 * while a false close puts a lie on the board and needs someone to notice it
 * first. A docs-only card is the one case that now needs closing by hand, and
 * that is the cheaper mistake.
 */
const COMPLETING_TYPES = new Set(['feat', 'fix'])

export function closingTaskCodes(message) {
  // SUBJECT LINE ONLY. Scanning the whole message for a scope pattern is barely
  // better than scanning it for codes: this very commit's body quotes
  // `feat(SL-011):` as an example of the convention, and that was read as a
  // claim. A commit has exactly one subject and exactly one scope.
  //
  // The command string arrives wrapped in shell — `git commit -F - <<'MSG'` and
  // a heredoc — so the subject is the first line that LOOKS like one, not
  // literally line 0.
  const text = String(message ?? '')
  const subject = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => CONVENTIONAL_SUBJECT.test(line))

  if (!subject) return []
  const match = CONVENTIONAL_SUBJECT.exec(subject)
  if (!match) return []

  // The type decides whether this is a completion at all.
  if (!COMPLETING_TYPES.has(match[1])) return []

  return taskCodesIn(match[2] ?? '')
}

/**
 * Does this command RUN a sync script, as opposed to merely naming one?
 *
 * The recursion guard used to be `/ops-sync\.mjs|ops-hook-bash\.mjs/` over the
 * whole command, which is the same class of mistake as scanning a commit body
 * for task codes: it matched the string wherever it appeared. So
 * `git add scripts/ops-sync.mjs && git commit -m 'feat(SL-015): …'` looked like
 * a sync invocation, the hook returned early, and SL-015 sat in For Review with
 * no sha while its work was committed and pushed. Silent, and only visible
 * because the board it built rendered the card.
 *
 * A script is RUN when it is the executable of a segment — optionally via node,
 * optionally with leading env assignments. As an argument to git, cat or rm it
 * is just a path.
 */
const RUNS_OPS_SCRIPT =
  /^\s*(?:\w+=\S*\s+)*(?:(?:\S*\/)?node\s+)?(?:\S*\/)?ops-(?:sync|hook-bash)\.mjs\b/

export function invokesOpsScript(command) {
  if (typeof command !== 'string') return false
  return command.split(/&&|\|\||[;\n|]/).some((segment) => RUNS_OPS_SCRIPT.test(segment))
}

/** `SL-7` and `SL-007` are the same card; the board stores the padded form. */
export function taskCodesIn(text) {
  const found = new Set()
  for (const match of String(text ?? '').matchAll(/\bSL-(\d{1,4})\b/g)) {
    found.add(`SL-${match[1].padStart(3, '0')}`)
  }
  return [...found]
}

/**
 * Was this a commit? Only then do task codes in the text mean "done".
 *
 * Checked per command SEGMENT, and the segment has to START with git. A plain
 * `/git.*commit/` also matched `echo "git commit"` — and since the same text is
 * then scanned for SL-### codes, any command that merely mentioned committing
 * could close cards that were never committed. The board's whole claim is that a
 * done card has a real sha behind it.
 */
export function isGitCommit(command) {
  if (typeof command !== 'string') return false
  return command
    .split(/&&|\|\||[;\n|]/)
    .some((segment) => /^\s*git\s+(?:-\S+\s+|--\S+(?:=\S+)?\s+)*commit\b/.test(segment))
}
