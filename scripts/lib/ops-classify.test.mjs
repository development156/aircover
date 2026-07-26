import { describe, expect, it } from 'vitest'

import {
  classifyBashRuns,
  countsFor,
  isGitCommit,
  stripAnsi,
  suiteFor,
  closingTaskCodes,
  suitesFor,
  taskCodesIn,
  verdictFor,
} from './ops-classify.mjs'

describe('suitesFor', () => {
  it('reports every suite a combined gate command covers', () => {
    // The bug this pins: recording only `typecheck` for the full gate told the
    // gates strip that lint and unit had not run, and understated a green gate.
    expect(suitesFor('pnpm turbo run typecheck lint test')).toEqual(['typecheck', 'lint', 'unit'])
  })

  it('calls a vitest run over the isolation suites `rls`, not `unit`', () => {
    expect(suitesFor('pnpm --filter @sahoda/db exec vitest run tests/ops_rls.test.ts')).toEqual([
      'rls',
    ])
  })

  it.each([
    ['pnpm test:smoke', 'smoke'],
    ['pnpm --filter @sahoda/web exec playwright test', 'smoke'],
    ['tsc --noEmit', 'typecheck'],
    ['npx eslint --fix src/', 'lint'],
    ['pnpm --filter @sahoda/web exec vitest run', 'unit'],
  ])('classifies %s as %s', (command, suite) => {
    expect(suitesFor(command)).toContain(suite)
  })

  it.each(['git status', 'ls -la', 'node scripts/ops-seed.mjs', '', '   '])(
    'ignores %j — not every command is QA',
    (command) => {
      expect(suitesFor(command)).toEqual([])
      expect(suiteFor(command)).toBeNull()
    },
  )

  it('labels a combined command by its most substantive suite', () => {
    expect(suiteFor('pnpm turbo run typecheck lint test')).toBe('unit')
  })
})

describe('verdictFor', () => {
  it('lets failure evidence beat success evidence in the same output', () => {
    // A turbo run prints both. Reading the success line first would call this pass.
    const output = 'Tasks:    23 successful, 24 total\n Test Files  1 failed | 7 passed (8)'
    expect(verdictFor({ output })).toBe('fail')
  })

  it('reads a clean vitest summary as pass', () => {
    expect(verdictFor({ output: ' Test Files  92 passed (92)\n Tests  1296 passed (1296)' })).toBe(
      'pass',
    )
  })

  it('trusts an exit code when the harness supplied one', () => {
    expect(verdictFor({ output: '', exitCode: 0 })).toBe('pass')
    expect(verdictFor({ output: '', exitCode: 1 })).toBe('fail')
  })

  it('returns null on silence with no exit code, rather than guessing pass', () => {
    // `tsc --noEmit` prints nothing when happy AND nothing when it never ran.
    // This is the assertion that keeps invented green rows out of the console.
    expect(verdictFor({ output: '' })).toBeNull()
    expect(verdictFor({ output: '   \n  ' })).toBeNull()
  })

  it('sees failure through terminal colour codes', () => {
    const coloured = ' [31m[1m1 failed[22m[39m'
    expect(verdictFor({ output: coloured })).toBe('fail')
  })
})

describe('stripAnsi', () => {
  it('removes colour codes so the stored record is readable text', () => {
    expect(stripAnsi('[33m 1006[2mms[22m[39m')).toBe(' 1006ms')
  })
})

describe('countsFor', () => {
  it('reads counts through colour codes', () => {
    const output = ' Tests  [1m[32m1296 passed[39m[22m (1296)'
    expect(countsFor(output).passed).toBe(1296)
  })

  it('returns nulls when the runner said nothing countable', () => {
    expect(countsFor('')).toEqual({ passed: null, failed: null })
  })

  it('sums every package summary in a turbo run rather than taking the first', () => {
    // The bug: turbo interleaves one summary per package, so reading the first
    // match reported "22 passed" for a run of 1318 — a real number attached to
    // the wrong thing, and lower than the truth.
    const output = [
      '@sahoda/shared:test:  Tests  22 passed (22)',
      '@sahoda/db:test:      Tests  159 passed (159)',
      '@sahoda/web:test:     Tests  1296 passed (1296)',
    ].join('\n')

    expect(countsFor(output).passed).toBe(22 + 159 + 1296)
  })

  it("counts a FAILING run's passes too — the summary reads 'N failed | M passed'", () => {
    // The shape that broke it: on a red run vitest puts `failed` first, so a
    // `Tests\s+(\d+)\s+passed` pattern matched nothing for that package and the
    // record understated a 1518-test gate as "222 passed".
    const output = [
      '@sahoda/db:test:   Tests  167 passed (167)',
      '@sahoda/web:test:  Tests  1 failed | 1295 passed (1296)',
      '@sahoda/shared:test: Tests  55 passed (55)',
    ].join('\n')

    expect(countsFor(output)).toEqual({ passed: 167 + 1295 + 55, failed: 1 })
  })
})

describe('classifyBashRuns', () => {
  const GREEN = ' Tasks:    24 successful, 24 total\n Tests  1296 passed (1296)'

  it('emits one row per suite when the whole gate passed', () => {
    // An aggregate pass genuinely proves each part passed, and every gate chip
    // needs its own row to go green.
    const runs = classifyBashRuns({
      command: 'pnpm turbo run typecheck lint test',
      output: GREEN,
      exitCode: 0,
    })

    expect(runs.map((r) => r.suite)).toEqual(['typecheck', 'lint', 'unit'])
    expect(runs.every((r) => r.status === 'pass')).toBe(true)
  })

  it('emits exactly ONE row when a combined gate failed', () => {
    // An aggregate failure does not say which part broke. Marking three suites
    // red on the strength of one failure invents evidence in the other direction.
    const runs = classifyBashRuns({
      command: 'pnpm turbo run typecheck lint test',
      output: ' Test Files  1 failed | 91 passed (92)',
      exitCode: 1,
    })

    expect(runs).toHaveLength(1)
    expect(runs[0].status).toBe('fail')
    expect(runs[0].suite).toBe('unit')
    expect(runs[0].summary_plain).toContain('typecheck, lint, unit')
  })

  it('records nothing at all when the outcome is unreadable', () => {
    expect(classifyBashRuns({ command: 'tsc --noEmit', output: '' })).toEqual([])
  })

  it('records nothing for a command that is not a test run', () => {
    expect(classifyBashRuns({ command: 'git status', output: 'clean', exitCode: 0 })).toEqual([])
  })

  it('stores plain text, never terminal escapes', () => {
    const runs = classifyBashRuns({
      command: 'pnpm vitest run',
      output: '[32m Tests  3 passed[39m',
      exitCode: 0,
    })
    expect(runs[0].details).not.toContain('')
  })

  it('caps stored output so one noisy run cannot fill the column', () => {
    const runs = classifyBashRuns({
      command: 'pnpm vitest run',
      output: `${'x'.repeat(50_000)}\n Tests  1 passed`,
      exitCode: 0,
    })
    expect(runs[0].details.length).toBeLessThanOrEqual(4000)
  })
})

describe('taskCodesIn', () => {
  it('pads short codes to the board form so SL-7 and SL-007 are one card', () => {
    expect(taskCodesIn('feat(SL-7,SL-012): thing')).toEqual(['SL-007', 'SL-012'])
  })

  it('de-duplicates a code repeated in subject and body', () => {
    expect(taskCodesIn('feat(SL-9): x\n\nCloses SL-009.')).toEqual(['SL-009'])
  })

  it('finds nothing in a message with no codes', () => {
    expect(taskCodesIn('chore: tidy up')).toEqual([])
  })
})

describe('closingTaskCodes', () => {
  it('closes only what the conventional-commit scope claims', () => {
    expect(closingTaskCodes('feat(SL-011,SL-033): the sync commands')).toEqual(['SL-011', 'SL-033'])
  })

  it('does NOT close a card merely discussed in the body', () => {
    // The real failure, verbatim. Commit 8f379e9 said SL-028 was still To Do and
    // the hook marked it Done — the board contradicting the commit that fed it.
    const message = [
      'merge: bring wt-web into wt-admin, resolving the grant why-line in their favour',
      '',
      'the weakness SL-032 was carded for ... the admin grant does not exist yet',
      '(SL-028 is still To Do, the grant lands in P3).',
    ].join('\n')

    expect(closingTaskCodes(message)).toEqual([])
    // The general extractor still SEES them — that distinction is the fix.
    expect(taskCodesIn(message)).toEqual(['SL-032', 'SL-028'])
  })

  it('closes nothing for a merge commit, which completes nothing', () => {
    expect(closingTaskCodes('merge: bring wt-web into wt-admin')).toEqual([])
  })

  it('does not treat a scope QUOTED IN THE BODY as a claim', () => {
    // Caught on the very commit that introduced the scope rule: its body
    // explained the convention by quoting `feat(SL-011):`, and the first
    // implementation read that as closing SL-011. A commit has one subject.
    const message = [
      'fix(ops): a commit closes only what its scope claims',
      '',
      'Writing `feat(SL-011):` is a deliberate claim that this commit is that',
      "card's work. Body prose is discussion.",
    ].join('\n')

    expect(closingTaskCodes(message)).toEqual([])
  })

  it('reads the subject even when it arrives wrapped in shell', () => {
    // The hook sees the whole command, heredoc and all — not a bare message.
    const command = ["git commit -q -F - <<'MSG'", 'feat(SL-012): x', '', 'body', 'MSG'].join('\n')
    expect(closingTaskCodes(command)).toEqual(['SL-012'])
  })

  it('ignores a scope that is not a card', () => {
    expect(closingTaskCodes('fix(repo): repair the lockfile')).toEqual([])
    expect(closingTaskCodes('feat(web): stop implying auto-publish works')).toEqual([])
  })

  it('reads every conventional type the repo uses', () => {
    for (const type of ['feat', 'fix', 'chore', 'docs', 'test', 'refactor']) {
      expect(closingTaskCodes(`${type}(SL-7): x`)).toEqual(['SL-007'])
    }
  })
})

describe('isGitCommit', () => {
  it.each(['git commit -m "x"', 'git commit -F -', 'git add . && git commit -q -F -'])(
    'recognises %s',
    (command) => {
      expect(isGitCommit(command)).toBe(true)
    },
  )

  it.each(['git status', 'git log --format=%s', 'echo "git commit"'])(
    'does not mistake %s for a commit',
    (command) => {
      // The echo case matters: a command that merely mentions committing must not
      // close cards.
      expect(isGitCommit(command)).toBe(command.startsWith('git commit'))
    },
  )
})
