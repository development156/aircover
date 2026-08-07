import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  applyMutant,
  ensureScratchDir,
  formatReport,
  MutationHarnessError,
  restoreBackup,
  runMutants,
  sha256,
  takeBackup,
} from './mutation-harness.mjs'

/**
 * These tests exist because the ad-hoc version of this tool failed twice in one
 * day, in the same way, and reported success both times (SL-064). Every case
 * below is one of those failures, or the guard that now catches it.
 */

const SOURCE = 'export const answer = 42\n'
let root
let scratch
let file

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'mutation-harness-'))
  scratch = resolve(root, 'scratch')
  file = resolve(root, 'subject.mjs')
  writeFileSync(file, SOURCE, 'utf8')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('the scratch directory is proven writable before anything is mutated', () => {
  it('creates it when it does not exist', () => {
    // THE ORIGINAL INCIDENT: the scratch path did not exist, every `cp` failed,
    // and the loop carried on mutating files it had no backup for.
    expect(existsSync(scratch)).toBe(false)
    expect(ensureScratchDir(scratch)).toBe(scratch)
    expect(existsSync(scratch)).toBe(true)
  })

  it('creates missing parents rather than failing on a deep path', () => {
    const deep = resolve(root, 'a/b/c')
    ensureScratchDir(deep)
    expect(existsSync(deep)).toBe(true)
  })

  it('leaves no probe file behind', () => {
    ensureScratchDir(scratch)
    expect(existsSync(resolve(scratch, `.probe-${process.pid}`))).toBe(false)
  })

  it('refuses a directory that exists but cannot be written to', () => {
    // `existsSync` alone would have passed this. A directory you cannot write
    // to fails exactly like one that is not there.
    ensureScratchDir(scratch)
    chmodSync(scratch, 0o500)
    try {
      expect(() => ensureScratchDir(scratch)).toThrow(/not writable|cannot create/i)
    } finally {
      chmodSync(scratch, 0o700)
    }
  })
})

describe('a backup is verified off disk, not assumed', () => {
  it('records the original and its hash', () => {
    ensureScratchDir(scratch)
    const record = takeBackup(file, scratch)

    expect(record.original).toBe(SOURCE)
    expect(record.sha).toBe(sha256(SOURCE))
    expect(readFileSync(record.backupPath, 'utf8')).toBe(SOURCE)
  })

  it('refuses to back up a file that is not there', () => {
    ensureScratchDir(scratch)
    expect(() => takeBackup(resolve(root, 'nope.mjs'), scratch)).toThrow(/does not exist/)
  })

  it('throws rather than returning a broken record when the copy cannot land', () => {
    // Writing into a directory that was never created is the incident itself.
    expect(() => takeBackup(file, resolve(root, 'never-created'))).toThrow()
  })
})

describe('a mutant that changes nothing is an error, never a survivor', () => {
  it('applies a mutation that matches exactly once', () => {
    ensureScratchDir(scratch)
    const record = takeBackup(file, scratch)
    applyMutant(record, '42', '43')

    expect(readFileSync(file, 'utf8')).toBe('export const answer = 43\n')
  })

  it('refuses a target that matches nothing', () => {
    // The first ad-hoc run mutated a COMMENT because the shell mangled the
    // target string, then reported "20 passed" as if the mutant had survived.
    // Zero matches must be an error: a "survived" verdict about unmodified code
    // is a false negative wearing the costume of evidence.
    ensureScratchDir(scratch)
    const record = takeBackup(file, scratch)

    expect(() => applyMutant(record, 'not in the file', 'x')).toThrow(/found 0/)
    expect(readFileSync(file, 'utf8')).toBe(SOURCE)
  })

  it('refuses a target that matches more than once', () => {
    writeFileSync(file, 'const a = 1\nconst b = 1\n', 'utf8')
    ensureScratchDir(scratch)
    const record = takeBackup(file, scratch)

    expect(() => applyMutant(record, '= 1', '= 2')).toThrow(/found 2/)
  })

  it('refuses to mutate a file that changed since it was backed up', () => {
    ensureScratchDir(scratch)
    const record = takeBackup(file, scratch)
    writeFileSync(file, 'something else entirely\n', 'utf8')

    expect(() => applyMutant(record, '42', '43')).toThrow(/changed between backup and mutation/)
  })
})

describe('a restore is confirmed by hash, or it is a failure', () => {
  it('puts the original back', () => {
    ensureScratchDir(scratch)
    const record = takeBackup(file, scratch)
    applyMutant(record, '42', '43')
    restoreBackup(record)

    expect(readFileSync(file, 'utf8')).toBe(SOURCE)
  })

  it('throws — never returns false — when the restore cannot be verified', () => {
    ensureScratchDir(scratch)
    const record = takeBackup(file, scratch)
    // A record whose recorded hash cannot match what is written back.
    expect(() => restoreBackup({ ...record, sha: sha256('a different file') })).toThrow(
      /RESTORE UNVERIFIED/,
    )
  })

  it('names the backup path in the failure, because a human has to recover', () => {
    ensureScratchDir(scratch)
    const record = takeBackup(file, scratch)
    try {
      restoreBackup({ ...record, sha: 'deadbeef' })
      throw new Error('expected a throw')
    } catch (error) {
      expect(error).toBeInstanceOf(MutationHarnessError)
      expect(error.message).toContain(record.backupPath)
    }
  })
})

describe('THE REFUSAL — no results are printed over a mutated tree', () => {
  const passing = [{ name: 'm1', killed: true, summary: '1 failed | 5 passed' }]

  it('formats a report when everything was restored', () => {
    const report = formatReport(passing, [])
    expect(report).toContain('1/1 mutants killed')
    expect(report).toContain('KILLED')
  })

  it('THROWS instead of returning a report when a file is still mutated', () => {
    // This is the rule the ad-hoc script broke: it printed three "killed"
    // verdicts while three source files were still carrying their mutants.
    expect(() => formatReport(passing, [{ file: '/x/a.ts', backupPath: '/s/a.bak' }])).toThrow(
      /REFUSING TO REPORT/,
    )
  })

  it('names every unrestored file and its backup', () => {
    try {
      formatReport(passing, [
        { file: '/x/a.ts', backupPath: '/s/a.bak' },
        { file: '/x/b.ts', backupPath: '/s/b.bak' },
      ])
      throw new Error('expected a throw')
    } catch (error) {
      for (const fragment of ['/x/a.ts', '/s/a.bak', '/x/b.ts', '/s/b.bak']) {
        expect(error.message).toContain(fragment)
      }
    }
  })

  it('calls out a mutant that survived rather than burying it in a count', () => {
    const report = formatReport([{ name: 'm1', killed: false, summary: '6 passed' }], [])
    expect(report).toContain('0/1 mutants killed')
    expect(report).toContain('SURVIVED')
    expect(report).toMatch(/not testing what they appear to test/)
  })
})

describe('runMutants end to end', () => {
  it('restores the file and reports the verdict', async () => {
    const seen = []
    const { report, results } = await runMutants({
      scratchDir: scratch,
      mutants: [{ name: 'answer', file, find: '42', replace: '43' }],
      runTests: async (mutant) => {
        // The file really is mutated while the tests run — that is the point.
        seen.push(readFileSync(mutant.file, 'utf8'))
        return { killed: true, summary: '1 failed | 5 passed' }
      },
    })

    expect(seen).toEqual(['export const answer = 43\n'])
    expect(readFileSync(file, 'utf8')).toBe(SOURCE)
    expect(results[0].killed).toBe(true)
    expect(report).toContain('1/1 mutants killed')
  })

  it('restores the file even when the test run throws', async () => {
    await expect(
      runMutants({
        scratchDir: scratch,
        mutants: [{ name: 'answer', file, find: '42', replace: '43' }],
        runTests: async () => {
          throw new Error('the runner exploded')
        },
      }),
    ).rejects.toThrow(/never ran/)

    // The tree is what matters more than the error: it must be clean.
    expect(readFileSync(file, 'utf8')).toBe(SOURCE)
  })

  it('refuses the whole run when the scratch directory cannot be used', async () => {
    // The incident, end to end: no scratch directory, so nothing may proceed.
    ensureScratchDir(scratch)
    chmodSync(scratch, 0o500)
    try {
      await expect(
        runMutants({
          scratchDir: scratch,
          mutants: [{ name: 'answer', file, find: '42', replace: '43' }],
          runTests: async () => ({ killed: true, summary: '' }),
        }),
      ).rejects.toThrow(MutationHarnessError)

      // And crucially, the source was never touched.
      expect(readFileSync(file, 'utf8')).toBe(SOURCE)
    } finally {
      chmodSync(scratch, 0o700)
    }
  })

  it('does not report a mutant that never applied as killed', async () => {
    let ran = false
    await expect(
      runMutants({
        scratchDir: scratch,
        mutants: [{ name: 'typo', file, find: 'no such text', replace: 'x' }],
        runTests: async () => {
          ran = true
          return { killed: true, summary: 'everything is fine' }
        },
      }),
    ).rejects.toThrow(/never ran/)

    expect(ran, 'the tests must not run for a mutant that was never applied').toBe(false)
    expect(readFileSync(file, 'utf8')).toBe(SOURCE)
  })

  it('runs several mutants and leaves every file as it found it', async () => {
    const second = resolve(root, 'other.mjs')
    writeFileSync(second, 'export const flag = true\n', 'utf8')

    const { results } = await runMutants({
      scratchDir: scratch,
      mutants: [
        { name: 'answer', file, find: '42', replace: '43' },
        { name: 'flag', file: second, find: 'true', replace: 'false' },
      ],
      runTests: async () => ({ killed: true, summary: 'ok' }),
    })

    expect(results).toHaveLength(2)
    expect(readFileSync(file, 'utf8')).toBe(SOURCE)
    expect(readFileSync(second, 'utf8')).toBe('export const flag = true\n')
  })
})
