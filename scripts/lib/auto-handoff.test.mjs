import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  readdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

/**
 * THE STOP HOOK DOES NOT WRITE A SKELETON OVER A REAL HANDOFF.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `auto-handoff.mjs` opens its output with "Written by the Stop hook because
 * this session ended without /handoff". When that sentence is wrong, it is
 * wrong inside the one file whose entire job is to be the record — so the guard
 * that decides whether to write at all is the load-bearing part of the script,
 * not the templating below it.
 *
 * It had a hole. MEASURED 2026-08-26 on `claude/advisor-qvz5wn`: the session ran
 * /handoff, which wrote `advisor-2026-08-26.md`, and the hook then wrote
 * `claude-advisor-qvz5wn-advisor-2026-08-26.md` beside it claiming no handoff had
 * been written. The guard checked only its OWN filename, and the two conventions
 * disagree — `<role>-<date>` against `<who>-<role>-<date>`.
 *
 * ── WHAT IT PROVES, AND HOW ─────────────────────────────────────────────────
 * By RUNNING the script in a throwaway git repository with a real commit, under
 * each of the three states that matter, and looking at what is on disk after. Not
 * by reading the source: the bug was a missing filename, and a source scan for
 * "does it call existsSync" passes on the broken version.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 * Whether the hook is WIRED to Stop in `.claude/settings.json`. This runs the
 * script directly. An unwired hook leaves this green and writes nothing, ever.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const SCRIPT = join(ROOT, 'scripts/auto-handoff.mjs')
const HANDOFFS = 'docs/workflow/handoffs'

/** A throwaway repo with one commit on a branch, so the script has a base to diff. */
function repo(branch = 'claude/advisor-qvz5wn') {
  const dir = mkdtempSync(join(tmpdir(), 'auto-handoff-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@t.t')
  git('config', 'user.name', 'T')
  writeFileSync(join(dir, 'seed.txt'), 'seed\n')
  git('add', '-A')
  git('commit', '-qm', 'seed')
  git('checkout', '-qb', branch)
  writeFileSync(join(dir, 'work.txt'), 'work\n')
  git('add', '-A')
  git('commit', '-qm', 'feat: something worth recording')
  // The script resolves its base as `git merge-base HEAD origin/wt-core`, so a repo
  // with no remote makes it exit 0 having done NOTHING. The first draft of this file
  // omitted this ref and every assertion below "passed" against an empty directory,
  // which is the harness error this repository keeps paying for: a test that runs the
  // wrong situation confidently.
  git('update-ref', 'refs/remotes/origin/wt-core', 'main')
  mkdirSync(join(dir, HANDOFFS), { recursive: true })
  return dir
}

function git2(dir, ...args) {
  execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
}

function run(dir) {
  // Copy rather than run in place, so the test exercises the file as shipped.
  const local = join(dir, 'auto-handoff.mjs')
  copyFileSync(SCRIPT, local)
  execFileSync('node', [local], { cwd: dir, stdio: 'pipe' })
  return readdirSync(join(dir, HANDOFFS)).sort()
}

const REAL = '# Handoff — advisor — today\n\nA person wrote this.\n'

describe('the stop hook writes a skeleton only when there is no real handoff', () => {
  it('writes one when the session left nothing behind', () => {
    const dir = repo()
    const written = run(dir)
    expect(written.length, `expected exactly one skeleton, got ${written.join(', ')}`).toBe(1)
    expect(
      readFileOf(dir, written[0]),
      'a skeleton must announce itself as one, or it can be mistaken for a record',
    ).toContain('AUTOMATIC SKELETON')
  })

  it('writes NOTHING when /handoff already wrote `<role>-<date>.md`', () => {
    // The hole. /handoff's convention omits the owner; the hook's includes it, so
    // the hook used to look straight past a handoff sitting in the same directory.
    const dir = repo()
    const date = today()
    writeFileSync(join(dir, HANDOFFS, `advisor-${date}.md`), REAL)

    const written = run(dir)
    expect(
      written,
      'the hook wrote a skeleton beside a real handoff, and its first line says the ' +
        'session ended without one — which is false',
    ).toEqual([`advisor-${date}.md`])
  })

  it('writes NOTHING when a real handoff sits at its own filename either', () => {
    // The hook's own name is `<owner>-<lane>-<date>.md`, and with neither declared
    // that is `unknown-<branch-slug>-<date>.md`. Retargeted, not deleted: this case
    // pins "a real handoff at the name I would write means stop", and the merge with
    // wt-core changed what that name IS, not whether the rule holds.
    const dir = repo()
    const date = today()
    const own = `unknown-claude-advisor-qvz5wn-${date}.md`
    writeFileSync(join(dir, HANDOFFS, own), REAL)
    expect(run(dir)).toEqual([own])
  })

  it('writes NOTHING when a real handoff sits under the older `<owner>-<role>-<date>.md`', () => {
    // Not hypothetical, and this is why the role derivation survived the merge:
    // docs/workflow/handoffs/divas-advisor-2026-08-26.md is on disk in this
    // repository, written under the scheme that came before <owner>-<lane>. A hook
    // that cannot see it writes a second file claiming the session ended without a
    // handoff, which is the exact fabrication this suite exists to stop.
    const dir = repo()
    const date = today()
    git2(dir, 'config', 'sahoda.owner', 'divas')
    const legacy = `divas-advisor-${date}.md`
    writeFileSync(join(dir, HANDOFFS, legacy), REAL)
    expect(run(dir)).toEqual([legacy])
  })

  it('does NOT eat a real handoff that merely MENTIONS the skeleton marker', () => {
    // THE REGRESSION. MEASURED 2026-08-26: a 520-line handoff was overwritten with a
    // 29-line skeleton because one table row in it read "Drop the AUTOMATIC SKELETON
    // exemption". The guard searched the whole document for the words and found them
    // in a QUOTATION of itself.
    //
    // The text below is the actual row that did it, so this test fails the moment the
    // check goes back to a substring search.
    const dir = repo()
    const date = today()
    const name = `advisor-${date}.md`
    writeFileSync(
      join(dir, HANDOFFS, name),
      [
        '# Handoff — advisor — today',
        '',
        '## Guards written, and the mutation that proved each',
        '',
        '| Mutation | Watched go red |',
        '|---|---|',
        '| Drop the `AUTOMATIC SKELETON` exemption | `DOES overwrite a previous skeleton` |',
        '',
        'A person wrote every line of this.',
      ].join('\n'),
    )

    expect(
      run(dir),
      'the hook overwrote a handoff for quoting the very marker it uses to recognise ' +
        'its own output — the better the handoff documents this hook, the more surely ' +
        'it is destroyed',
    ).toEqual([name])
    expect(readFileOf(dir, name)).toContain('A person wrote every line of this.')
  })

  it('does NOT eat a handoff that quotes the marker INLINE, high in the file', () => {
    // This earns the `^` anchor, and it was added because dropping the anchor left the
    // whole suite GREEN. The clamp to HEAD_LINES hides the anchor for any quotation
    // far down the page, so only a mention near the TOP can tell the two apart, and
    // without this case the anchor was an untested bound — which this project treats
    // as no guard at all.
    //
    // The sentence below is the shape a handoff explaining the hook actually takes:
    // the marker quoted mid-line, inside the header note, in the first few lines.
    const dir = repo()
    const date = today()
    const name = `advisor-${date}.md`
    writeFileSync(
      join(dir, HANDOFFS, name),
      [
        '# Handoff — advisor — today',
        '',
        '> **On the Stop hook.** Its opening line reads > **AUTOMATIC SKELETON.** and',
        '> that is the whole tell.',
        '',
        'A person wrote every line of this.',
      ].join('\n'),
    )

    expect(
      run(dir),
      'a handoff was destroyed for quoting the marker inside a sentence near its top, ' +
        'which is precisely where an explanation of this hook belongs',
    ).toEqual([name])
    expect(readFileOf(dir, name)).toContain('A person wrote every line of this.')
  })

  it('does NOT eat a handoff that QUOTES the marker line verbatim, deep in its body', () => {
    // Stronger than the test above, and not hypothetical: a handoff explaining this
    // hook will paste the template's own line to show what it looks like. That line
    // IS the structural marker, so the anchor alone cannot tell it from the real
    // thing — only its POSITION can. The self-declaration belongs at the top; a
    // quotation lives in the body.
    const dir = repo()
    const date = today()
    const name = `advisor-${date}.md`
    const body = [
      '# Handoff — advisor — today',
      '',
      '## What shipped',
      '',
      ...Array.from({ length: 40 }, (_, i) => `- line ${i} of a real session's real work`),
      '',
      '## How the stop hook marks its own output',
      '',
      '> **AUTOMATIC SKELETON.** Written by the Stop hook because this session ended',
      '',
      'A person wrote every line of this.',
    ].join('\n')
    writeFileSync(join(dir, HANDOFFS, name), body)

    expect(
      run(dir),
      'the marker was quoted at line 48, far below any self-declaration, and the hook ' +
        'still treated the document as its own output',
    ).toEqual([name])
    expect(readFileOf(dir, name)).toContain('A person wrote every line of this.')
  })

  it('DOES overwrite a previous skeleton, because that is not a person’s work', () => {
    // The stale skeleton is produced by RUNNING the script, not hand-written. An
    // earlier draft hand-wrote a bare `AUTOMATIC SKELETON` line, which the template
    // never emits — so it tested a file shape that cannot occur, and went red the
    // moment the real marker became structural. A fixture that drifts from the thing
    // it stands in for is the same defect as a harness with the wrong nesting.
    const dir = repo()
    const first = run(dir)
    expect(first).toHaveLength(1)
    const own = first[0]

    // A second commit the stale skeleton cannot know about.
    execFileSync(
      'git',
      ['commit', '-qm', 'feat: landed after the first skeleton', '--allow-empty'],
      {
        cwd: dir,
        stdio: 'pipe',
      },
    )

    expect(run(dir)).toEqual([own])
    expect(
      readFileOf(dir, own),
      'a stale skeleton must be refreshed, not preserved — it names the wrong commits',
    ).toContain('feat: landed after the first skeleton')
  })
})

function today() {
  return new Date().toISOString().slice(0, 10)
}

function readFileOf(dir, name) {
  return execFileSync('cat', [join(dir, HANDOFFS, name)], { encoding: 'utf8' })
}
