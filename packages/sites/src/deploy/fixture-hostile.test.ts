import { describe, it, expect } from 'vitest'
import { createFixtureDeployer } from './fixture'
import { checkPersistableInputs } from './fixture-input'
import type { DeployContext, SiteBundle } from './port'
import { bundle, context, file, recordingWriter, unwrapErr } from './fixture-harness'

/**
 * The deployer's contract is `Promise<Result<SiteDeployState>>`: a hostile `bundle`, `ctx` or
 * `bundle.files[i]` must come back as a `VALIDATION_ERROR`, never a raw `TypeError` escaping the
 * Promise. Both parameters are typed but not trusted -- Task 14 and Task 17 have not landed, so
 * nothing enforces that a bundle came from `renderBundle` or a slug/ctx from a previous run.
 *
 * These inputs must be refused BEFORE the first write, for the same reason `fixture-input.ts`
 * documents: a partial write served as a "preview" is its own dishonesty.
 */

const TRACE_ID = 'trace-fixture-hostile'
const OUT_DIR = '/tmp/sahoda-preview'

const deployer = () =>
  createFixtureDeployer({ outDir: OUT_DIR, writeFile: recordingWriter().writeFile })

const asBundle = (value: unknown): SiteBundle => value as SiteBundle
const asCtx = (value: unknown): DeployContext => value as DeployContext

const NON_OBJECTS: ReadonlyArray<readonly [string, unknown]> = [
  ['null', null],
  ['undefined', undefined],
  ['a string', 'abc'],
  ['a number', 7],
  ['a boolean', true],
]

describe('createFixtureDeployer — a hostile bundle never throws out of the Promise', () => {
  for (const [label, value] of NON_OBJECTS) {
    it(`returns a VALIDATION_ERROR when bundle is ${label}`, async () => {
      const result = await deployer()(asBundle(value), context(TRACE_ID))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR')
    })
  }

  it('returns err (files is not an array) when bundle is an array', async () => {
    const result = await deployer()(asBundle([]), context(TRACE_ID))
    expect(result.ok).toBe(false)
  })
})

describe('createFixtureDeployer — a hostile ctx never throws out of the Promise', () => {
  for (const [label, value] of NON_OBJECTS) {
    it(`returns a VALIDATION_ERROR when ctx is ${label}`, async () => {
      const result = await deployer()(bundle(), asCtx(value))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR')
    })
  }
})

/**
 * `null`/`undefined` file elements are the only ones that THREW at `file.path`. A string, number,
 * boolean, array or path-less object all read `.path` as `undefined`, which `isBundleFilePath`
 * already rejected -- so those were honest errs before, and stay errs now. The proof is the same
 * for all: a bad file element yields a `VALIDATION_ERROR`, never a throw.
 */
const FILE_ELEMENTS: ReadonlyArray<readonly [string, unknown]> = [
  ['null', null],
  ['undefined', undefined],
  ['a string', 'index.html'],
  ['a number', 7],
  ['a boolean', true],
  ['an array where an object is expected', []],
  ['an object with no path', { content: 'x', contentType: 'text/html' }],
]

describe('createFixtureDeployer — a hostile bundle.files element never throws', () => {
  for (const [label, value] of FILE_ELEMENTS) {
    it(`returns a VALIDATION_ERROR when a file element is ${label}`, async () => {
      const result = await deployer()(
        asBundle({ bundleId: 'b1', files: [value] }),
        context(TRACE_ID),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR')
    })
  }

  it('reports the index of a null element mixed among valid files', async () => {
    const result = await deployer()(
      asBundle({ bundleId: 'b1', files: [file(), null, file('about/index.html')] }),
      context(TRACE_ID),
    )
    const error = unwrapErr(result)
    expect(error.code).toBe('VALIDATION_ERROR')
    expect((error.details as { fileIndex: number }).fileIndex).toBe(1)
  })
})

describe('checkPersistableInputs — object guards', () => {
  for (const [label, value] of NON_OBJECTS) {
    it(`flags a bundle that is ${label} without throwing`, () => {
      let problem: ReturnType<typeof checkPersistableInputs> | undefined
      expect(() => {
        problem = checkPersistableInputs(asBundle(value), context(TRACE_ID))
      }).not.toThrow()
      expect(problem).not.toBeNull()
    })

    it(`flags a ctx that is ${label} without throwing`, () => {
      let problem: ReturnType<typeof checkPersistableInputs> | undefined
      expect(() => {
        problem = checkPersistableInputs(bundle(), asCtx(value))
      }).not.toThrow()
      expect(problem).not.toBeNull()
    })
  }
})
