import { describe, it, expect } from 'vitest'
import type { AppError, Result } from '@sahoda/shared'
import { createFixtureDeployer, type WriteBundleFile } from './fixture'
import type { BundleFile, DeployContext, SiteBundle, SiteDeployState } from './port'

/**
 * The per-path guard rejected an unsafe NAME; nothing rejected two names that cannot coexist.
 * Two entries both called `index.html` deployed `ok:true` and the first entry's bytes were
 * discarded with nothing reported -- a silent discard, and a direct contradiction of the
 * rationale `fixture.ts` itself gives for refusing to coerce paths ("silently fixing an
 * untrusted name is how two entries collide on one file"). These tests pin the refusal.
 */

const OUT_DIR = '/tmp/sahoda-preview'
const TRACE_ID = 'trace-fixture-collision'

function context(): DeployContext {
  return {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    siteId: '22222222-2222-4222-8222-222222222222',
    slug: 'acme-chai',
    baseDomain: 'sahoda.site',
    traceId: TRACE_ID,
    previous: [],
    now: () => new Date('2026-07-19T09:30:00.000Z'),
  }
}

function file(path: string, content = '<!doctype html>'): BundleFile {
  return { path, content, contentType: 'text/html' }
}

function bundle(files: BundleFile[]): SiteBundle {
  return { bundleId: 'bundle-abc123', files }
}

function recordingWriter(): { writeFile: WriteBundleFile; calls: () => string[] } {
  const calls: string[] = []
  return {
    writeFile: async (path) => {
      calls.push(path)
    },
    calls: () => calls,
  }
}

function unwrapErr(result: Result<SiteDeployState>): AppError {
  if (result.ok) {
    throw new Error('expected an error result, got ok')
  }
  return result.error
}

describe('fixtureDeployer -- a duplicated path is reported, never silently overwritten', () => {
  it('rejects two entries named index.html instead of discarding the first file bytes', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const result = await deploy(
      bundle([file('index.html', 'FIRST'), file('index.html', 'SECOND')]),
      context(),
    )
    const error = unwrapErr(result)

    expect(result.ok).toBe(false)
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.traceId).toBe(TRACE_ID)
    expect(writer.calls()).toEqual([])
  })

  it('names BOTH positions so the caller can find the pair in the bundle it supplied', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const error = unwrapErr(
      await deploy(bundle([file('index.html'), file('styles.css'), file('styles.css')]), context()),
    )

    expect(error.details).toEqual({ fileIndex: 2, conflictsWithIndex: 1 })
  })

  it('rejects a duplicated SUBPAGE, the sibling shape of the reported input', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const error = unwrapErr(
      await deploy(
        bundle([file('index.html'), file('about/index.html'), file('about/index.html')]),
        context(),
      ),
    )

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(writer.calls()).toEqual([])
  })

  it('rejects a duplicated ASSET, which no entry-document guard would have caught', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const error = unwrapErr(
      await deploy(
        bundle([file('index.html'), file('assets/app.js', 'A'), file('assets/app.js', 'B')]),
        context(),
      ),
    )

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(writer.calls()).toEqual([])
  })

  it('does not echo the duplicated path, holding the same line the other two guards hold', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const error = unwrapErr(
      await deploy(
        bundle([file('index.html'), file('assets/secret-name.js'), file('assets/secret-name.js')]),
        context(),
      ),
    )

    expect(JSON.stringify(error)).not.toContain('secret-name')
  })

  it('still deploys a bundle whose paths merely SHARE a directory', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const result = await deploy(
      bundle([file('index.html'), file('about/index.html'), file('about/styles.css')]),
      context(),
    )

    expect(result.ok).toBe(true)
    expect(writer.calls()).toHaveLength(3)
  })
})

describe('fixtureDeployer -- one name may not be asked to be both a file and a directory', () => {
  /**
   * `isBundleFilePath` accepts `a` AND `a/index.html`; both are safe names in isolation, and no
   * per-path check can see that together they demand `a` be a file and a directory at once. On a
   * real filesystem the second write takes `ENOTDIR`, which the deployer classifies honestly as
   * `PROVIDER_ERROR` -- but only AFTER a partial write. This rejects it before the first byte.
   */
  it('rejects a bare name alongside the index page beneath it, writing NOTHING', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const result = await deploy(
      bundle([file('index.html'), file('a'), file('a/index.html')]),
      context(),
    )
    const error = unwrapErr(result)

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.details).toEqual({ fileIndex: 2, conflictsWithIndex: 1 })
    expect(writer.calls()).toEqual([])
  })

  it('rejects the same pair listed in the opposite order', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const error = unwrapErr(
      await deploy(bundle([file('index.html'), file('a/index.html'), file('a')]), context()),
    )

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(writer.calls()).toEqual([])
  })

  it('rejects an asset that shadows a directory holding another asset', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const error = unwrapErr(
      await deploy(
        bundle([file('index.html'), file('assets'), file('assets/styles.css')]),
        context(),
      ),
    )

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(writer.calls()).toEqual([])
  })

  it('blames the NEAREST shadowing entry when two ancestors of one path are present', async () => {
    // The indices are the ONLY information the caller gets -- the paths are deliberately
    // withheld -- so `bundle-paths.ts`'s longest-first walk is a user-visible contract, not an
    // implementation detail. `a/b` (index 2) and `a` (index 3) both shadow `a/b/c.css`.
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const error = unwrapErr(
      await deploy(
        bundle([file('index.html'), file('a/b/c.css'), file('a/b'), file('a')]),
        context(),
      ),
    )

    expect(error.details).toEqual({ fileIndex: 2, conflictsWithIndex: 1 })
    expect(writer.calls()).toEqual([])
  })

  it('distinguishes the two defects in the MESSAGE, not only in the details', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const duplicate = unwrapErr(
      await deploy(bundle([file('index.html'), file('a.css'), file('a.css')]), context()),
    )
    const shadowed = unwrapErr(
      await deploy(bundle([file('index.html'), file('a'), file('a/index.html')]), context()),
    )

    expect(duplicate.message).not.toBe(shadowed.message)
    expect(writeFile).toBeTypeOf('function')
  })
})
