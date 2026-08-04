import { describe, it, expect } from 'vitest'
import type { AppError, Result } from '@sahoda/shared'
import { createFixtureDeployer, type WriteBundleFile } from './fixture'
import { pathToFile } from '../normalize/path'
import type { BundleFile, DeployContext, SiteBundle, SiteDeployState } from './port'

/**
 * `bundle.files[].path` is the SECOND untrusted string this deployer joins onto a host
 * filesystem path, and it has exactly as little enforced provenance as `ctx.slug`: Task 14
 * (`renderBundle`) has not landed, so every bundle reaching this function today is
 * hand-constructed by a caller. These tests pin the traversal guard on that field and the
 * refusal to report a live site for a bundle that contains no entry document.
 */

const OUT_DIR = '/tmp/sahoda-preview'
const TRACE_ID = 'trace-fixture-bundle'

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

function file(path: string): BundleFile {
  return { path, content: '<!doctype html>', contentType: 'text/html' }
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

const NUL = String.fromCharCode(0)

describe('fixtureDeployer -- every bundle file path is host-filesystem input', () => {
  const hostile: Array<[string, string]> = [
    ['a parent traversal escaping outDir', '../../../etc/cron.d/x'],
    ['a traversal hidden mid-path', 'assets/../../../etc/passwd'],
    ['a bare parent reference', '..'],
    ['a single dot', '.'],
    ['an absolute path', '/etc/passwd'],
    ['a leading slash on the entry file', '/index.html'],
    ['a home reference', '~/.ssh/authorized_keys'],
    ['a backslash separator', 'assets\\..\\..\\x'],
    ['a URL-encoded traversal', '%2e%2e/x'],
    ['an empty path', ''],
    ['a bare separator naming the site DIRECTORY, not a file', '/'],
    ['a doubled internal separator', 'assets//styles.css'],
    ['a trailing separator', 'assets/'],
    ['a NUL byte', 'styles' + NUL + '.css'],
    ['a dotfile', '.env'],
    ['a windows device name', 'nul.html'],
  ]

  // A valid `index.html` accompanies every hostile path on purpose: without it the
  // entry-document guard would reject the bundle first and these cases would pass while
  // proving nothing about the traversal guard.
  for (const [label, path] of hostile) {
    it('rejects ' + label + ' with a VALIDATION_ERROR and writes NOTHING', async () => {
      const writer = recordingWriter()
      const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

      const error = unwrapErr(await deploy(bundle([file('index.html'), file(path)]), context()))

      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.traceId).toBe(TRACE_ID)
      expect(writer.calls()).toEqual([])
    })
  }

  it('rejects a hostile path even when a valid index.html precedes it, before ANY write', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const error = unwrapErr(
      await deploy(bundle([file('index.html'), file('../../../etc/cron.d/x')]), context()),
    )

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(writer.calls()).toEqual([])
  })

  it('reports WHICH entry was rejected by position, without echoing the untrusted path', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const error = unwrapErr(
      await deploy(bundle([file('index.html'), file('../../../etc/cron.d/x')]), context()),
    )

    expect(error.details).toEqual({ fileIndex: 1 })
    expect(JSON.stringify(error)).not.toContain('cron.d')
  })

  /**
   * `BundleFile.path` is declared `string`, and this file's own docblock explains why that is
   * not a guarantee: no bundle reaching this function has enforced provenance today. While
   * `isBundleFilePath` took a `string`, `path: 42` reached `raw.endsWith` and threw a TypeError
   * that escaped `Promise<Result<SiteDeployState>>` -- the caller got a rejected promise where
   * the envelope promises a `Result`, which is exactly the failure mode `slug.ts` funnels every
   * `isTaken` call through `probeTaken` to prevent.
   */
  const nonStrings: Array<[string, unknown]> = [
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
    ['a nested array', ['index.html']],
    ['a plain object', { path: 'index.html' }],
  ]

  for (const [label, path] of nonStrings) {
    it(
      'reports ' + label + ' as a rejected path rather than throwing out of the Result',
      async () => {
        const writer = recordingWriter()
        const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })
        const hostile = { path, content: 'x', contentType: 'text/html' } as unknown as BundleFile

        const result = await deploy(bundle([file('index.html'), hostile]), context())

        expect(result.ok).toBe(false)
        expect(unwrapErr(result).code).toBe('VALIDATION_ERROR')
        expect(unwrapErr(result).details).toEqual({ fileIndex: 1 })
        expect(writer.calls()).toEqual([])
      },
    )
  }

  it('accepts every shape pathToFile actually produces, so the guard cannot reject a real bundle', async () => {
    const produced = ['/', '/about', '/about/team', '/shop-2026'].map(pathToFile)
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    for (const path of produced) {
      // The accompanying entry document is added only when the produced path is not ALREADY
      // the entry document: `pathToFile('/')` is `index.html`, so pairing it with a fixed
      // `index.html` builds a bundle with two identically-named entries. That bundle is now
      // rejected as a duplicate, and rightly -- but the rejection would say nothing about the
      // traversal guard this test exists to exercise.
      const files = path === 'index.html' ? [file(path)] : [file('index.html'), file(path)]
      const result = await deploy(bundle(files), context())
      expect(result.ok, path).toBe(true)
    }
  })

  it('accepts the sibling asset files a bundle ships beside its pages', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    for (const path of ['styles.css', 'assets/styles.css', 'robots.txt']) {
      const result = await deploy(bundle([file('index.html'), file(path)]), context())
      expect(result.ok, path).toBe(true)
    }
  })
})

describe('fixtureDeployer -- outDir is config, joined but never guessed at', () => {
  it('tolerates a trailing slash on outDir, since /tmp/x and /tmp/x/ are one directory', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({
      outDir: '/tmp/sahoda-preview/',
      writeFile: writer.writeFile,
    })

    await deploy(bundle([file('index.html')]), context())

    expect(writer.calls()).toEqual(['/tmp/sahoda-preview/acme-chai/index.html'])
  })

  it('refuses to construct with an empty outDir, which would write to the filesystem root', () => {
    const { writeFile } = recordingWriter()

    expect(() => createFixtureDeployer({ outDir: '', writeFile })).toThrow(/outDir/)
  })
})

describe('fixtureDeployer -- a bundle with no entry document is not a live site', () => {
  it('rejects an EMPTY bundle instead of reporting a live url for zero bytes written', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const result = await deploy(bundle([]), context())
    const error = unwrapErr(result)

    expect(result.ok).toBe(false)
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.traceId).toBe(TRACE_ID)
    expect(writer.calls()).toEqual([])
  })

  it('rejects a bundle of only styles.css -- files were written, but nothing is openable', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const error = unwrapErr(await deploy(bundle([file('styles.css')]), context()))

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.message).toContain('index.html')
    expect(writer.calls()).toEqual([])
  })

  it('rejects a bundle whose only html is a SUBPAGE, since the url points at the root', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const error = unwrapErr(await deploy(bundle([file('about/index.html')]), context()))

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(writer.calls()).toEqual([])
  })

  it('the reported url always names a file this deploy actually wrote', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const result = await deploy(bundle([file('styles.css'), file('index.html')]), context())
    if (!result.ok) throw new Error('expected ok')

    expect(result.data.url).toBe('file:///tmp/sahoda-preview/acme-chai/index.html')
    expect(writer.calls()).toContain('/tmp/sahoda-preview/acme-chai/index.html')
  })
})
