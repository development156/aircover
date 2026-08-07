import { describe, it, expect } from 'vitest'
import { createFixtureDeployer } from './fixture'
import { SiteDeployStateSchema, type SiteBundle } from './port'
import {
  bundle,
  context,
  file,
  LONGEST_SLUG,
  MAX_OUT_DIR_LENGTH,
  MAX_TEXT_LENGTH,
  outDirOfLength,
  recordingWriter,
  unwrapErr,
  unwrapOk,
} from './fixture-harness'

/**
 * The deployer refused every input that could put bytes in the wrong PLACE and none that made
 * the RESULT unpersistable. `outDir: '/' + 'd'.repeat(3000)` returned `ok: true`, wrote the
 * file, and handed back a state whose 3024-character url `SiteDeployStateSchema` rejects --
 * a success-shaped answer carrying a value its own column refuses, discovered only after the
 * bytes were on disk. `bundle.bundleId` was copied into the state and the new history entry with
 * no check at all, and the schema was never applied on the write path (it appeared only in
 * tests, so nothing on the producer side could fail).
 *
 * These tests pin the contract that replaced it: **every state this deployer returns `ok` with
 * satisfies `SiteDeployStateSchema`**, and every input that would have broken it is refused
 * BEFORE the first write. The inherited history and the clock are the same contract at two
 * further inputs; they are in `fixture-history.test.ts`.
 */

const TRACE_ID = 'trace-fixture-persistable'
const ctx = context.bind(null, TRACE_ID)

describe('outDir is bounded so the url it builds can never exceed the column', () => {
  it('accepts an outDir of exactly the maximum length', () => {
    expect(() =>
      createFixtureDeployer({
        outDir: outDirOfLength(MAX_OUT_DIR_LENGTH),
        writeFile: async () => {},
      }),
    ).not.toThrow()
  })

  it('rejects an outDir one character longer, at CONSTRUCTION, before any deploy', () => {
    expect(() =>
      createFixtureDeployer({
        outDir: outDirOfLength(MAX_OUT_DIR_LENGTH + 1),
        writeFile: async () => {},
      }),
    ).toThrow()
  })

  it('rejects the reported 3000-character outDir instead of deploying it', () => {
    expect(() =>
      createFixtureDeployer({ outDir: '/' + 'd'.repeat(3000), writeFile: async () => {} }),
    ).toThrow()
  })

  it('does NOT echo the rejected outDir, which is a host path reaching the logs', () => {
    const secret = '/srv/' + 's3cret-host-dir'.repeat(200)

    expect(() => createFixtureDeployer({ outDir: secret, writeFile: async () => {} })).toThrow(
      /outDir/,
    )
    try {
      createFixtureDeployer({ outDir: secret, writeFile: async () => {} })
    } catch (error: unknown) {
      expect((error as Error).message).not.toContain('s3cret-host-dir')
    }
  })

  it('measures the TRAILING-SLASH-STRIPPED form, which is what enters the url', () => {
    // `joinPath` strips them, so they never reach the url and must not count against the bound.
    expect(() =>
      createFixtureDeployer({
        outDir: outDirOfLength(MAX_OUT_DIR_LENGTH) + '////',
        writeFile: async () => {},
      }),
    ).not.toThrow()
  })

  it('emits a url of exactly 2048 characters for the worst case, and the schema accepts it', async () => {
    // The longest legal outDir joined to the longest legal slug: the exact boundary the bound
    // was derived from. One character more anywhere and the column would refuse the row.
    const deploy = createFixtureDeployer({
      outDir: outDirOfLength(MAX_OUT_DIR_LENGTH),
      writeFile: async () => {},
    })

    const state = unwrapOk(await deploy(bundle(), ctx({ slug: LONGEST_SLUG })))

    expect(state.url).toHaveLength(2048)
    expect(SiteDeployStateSchema.safeParse(state).success).toBe(true)
  })
})

describe('bundleId is bounded before the write, not discovered after it', () => {
  it('rejects an over-long bundleId with NOTHING written', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: '/tmp/out', writeFile: writer.writeFile })

    const error = unwrapErr(
      await deploy(bundle({ bundleId: 'z'.repeat(MAX_TEXT_LENGTH + 1) }), ctx()),
    )

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.traceId).toBe(TRACE_ID)
    expect(error.details).toEqual({
      bundleIdLength: MAX_TEXT_LENGTH + 1,
      maxLength: MAX_TEXT_LENGTH,
    })
    expect(writer.calls()).toEqual([])
  })

  it('accepts a bundleId of exactly the maximum, so an off-by-one cannot survive', async () => {
    const deploy = createFixtureDeployer({ outDir: '/tmp/out', writeFile: async () => {} })

    const state = unwrapOk(await deploy(bundle({ bundleId: 'z'.repeat(MAX_TEXT_LENGTH) }), ctx()))

    expect(SiteDeployStateSchema.safeParse(state).success).toBe(true)
  })

  it('reports the LENGTH rather than echoing the id, which is model-adjacent data', async () => {
    const deploy = createFixtureDeployer({ outDir: '/tmp/out', writeFile: async () => {} })

    const error = unwrapErr(
      await deploy(bundle({ bundleId: 'leaky-id-' + 'q'.repeat(MAX_TEXT_LENGTH) }), ctx()),
    )

    expect(JSON.stringify(error)).not.toContain('leaky-id-')
  })

  it('rejects a non-string bundleId instead of persisting it, and does not throw', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: '/tmp/out', writeFile: writer.writeFile })
    const wrong = { bundleId: 42, files: [file()] } as unknown as SiteBundle

    const result = await deploy(wrong, ctx())

    expect(unwrapErr(result).code).toBe('VALIDATION_ERROR')
    expect(writer.calls()).toEqual([])
  })

  it('rejects a files list that is not an array, the sibling field on the same bundle', async () => {
    const deploy = createFixtureDeployer({ outDir: '/tmp/out', writeFile: async () => {} })
    const wrong = { bundleId: 'b', files: 'index.html' } as unknown as SiteBundle

    // Every other guard iterates `files`; without this one they threw out of the Result.
    const result = await deploy(wrong, ctx())

    expect(unwrapErr(result).code).toBe('VALIDATION_ERROR')
  })
})
