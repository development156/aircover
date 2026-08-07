import { describe, it, expect } from 'vitest'
import { createFixtureDeployer, type WriteBundleFile } from './fixture'
import type { DeployContext, SiteBundle } from './port'

/**
 * `outDir` is the ONE value in this deployer that is never user input -- and the one whose
 * misconfiguration is unrecoverable, because it decides where on the HOST filesystem the
 * write lands. The previous guard rejected only `''`, on the stated rationale that an empty
 * `outDir` "would silently turn `<outDir>/<slug>` into the absolute `/<slug>`". `'/'` reaches
 * that identical outcome (`joinPath` strips trailing slashes, so `'/'` becomes `''`), and so
 * does `'///'`. These tests pin what `outDir` must BE, not merely that it is non-empty, and
 * they enumerate the sibling shapes rather than the single one that was reported.
 */

const TRACE_ID = 'trace-fixture-outdir'

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

function entryBundle(): SiteBundle {
  return {
    bundleId: 'bundle-abc123',
    files: [{ path: 'index.html', content: '<!doctype html>', contentType: 'text/html' }],
  }
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

describe('createFixtureDeployer -- outDir must be an absolute path BELOW the filesystem root', () => {
  const rejected: Array<[string, string]> = [
    ['the empty string', ''],
    ['the filesystem root itself', '/'],
    ['the root written with repeated separators', '///'],
    ['a bare current-directory reference', '.'],
    ['a bare parent reference', '..'],
    ['a relative directory name', 'out'],
    ['a relative multi-segment path', 'out/preview'],
    ['a relative dot-slash path', './out'],
    ['a parent-relative path', '../out'],
    ['an absolute path containing a parent traversal', '/tmp/../etc'],
    ['an absolute path containing a current-directory segment', '/tmp/./x'],
    ['an absolute path with an empty interior segment', '/tmp//x'],
    ['a whitespace-only string', '   '],
  ]

  for (const [label, outDir] of rejected) {
    it('refuses to construct with ' + label, () => {
      const { writeFile } = recordingWriter()

      expect(() => createFixtureDeployer({ outDir, writeFile })).toThrow(/outDir/)
    })
  }

  const accepted: Array<[string, string, string]> = [
    ['a plain absolute path', '/tmp/sahoda-preview', '/tmp/sahoda-preview/acme-chai/index.html'],
    [
      'an absolute path with a tolerated trailing slash',
      '/tmp/sahoda-preview/',
      '/tmp/sahoda-preview/acme-chai/index.html',
    ],
    ['a single-segment absolute path', '/previews', '/previews/acme-chai/index.html'],
    [
      'an absolute path whose segments contain dots that are not traversal',
      '/tmp/sahoda.preview/v1.2',
      '/tmp/sahoda.preview/v1.2/acme-chai/index.html',
    ],
  ]

  for (const [label, outDir, expectedWrite] of accepted) {
    it('accepts ' + label + ' and writes exactly under it', async () => {
      const writer = recordingWriter()
      const deploy = createFixtureDeployer({ outDir, writeFile: writer.writeFile })

      const result = await deploy(entryBundle(), context())

      expect(result.ok).toBe(true)
      expect(writer.calls()).toEqual([expectedWrite])
    })
  }

  it('never writes to the filesystem root, the outcome the original guard named', () => {
    const { writeFile } = recordingWriter()

    for (const outDir of ['', '/', '//', '///']) {
      expect(() => createFixtureDeployer({ outDir, writeFile }), outDir).toThrow(/outDir/)
    }
  })
})

describe('createFixtureDeployer -- the emitted file:// url is well formed, with an EMPTY host', () => {
  /**
   * `file://` + a relative path puts the first path element in the HOST position:
   * `outDir: 'out'` produced `file://out/acme-chai/index.html`, host `out`, which passes
   * `SiteDeployStateSchema` and is persisted as a live preview address resolving to nothing.
   * Requiring an absolute `outDir` subsumes that defect; this pins the subsumption rather
   * than trusting it.
   */
  it('emits three slashes after the scheme, so the authority component is empty', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: '/tmp/sahoda-preview', writeFile })

    const result = await deploy(entryBundle(), context())
    if (!result.ok) throw new Error('expected ok')

    expect(result.data.url).toBe('file:///tmp/sahoda-preview/acme-chai/index.html')
    expect(new URL(String(result.data.url)).host).toBe('')
    expect(new URL(String(result.data.url)).pathname).toBe(
      '/tmp/sahoda-preview/acme-chai/index.html',
    )
  })

  it('records the same well-formed url in history, not just at the top level', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: '/previews', writeFile })

    const result = await deploy(entryBundle(), context())
    if (!result.ok) throw new Error('expected ok')

    expect(result.data.history[0]?.url).toBe('file:///previews/acme-chai/index.html')
    expect(new URL(String(result.data.history[0]?.url)).host).toBe('')
  })

  it('cannot be constructed with any outDir that would yield a non-empty url host', () => {
    const { writeFile } = recordingWriter()

    for (const outDir of ['out', 'out/preview', './out', '../out']) {
      expect(() => createFixtureDeployer({ outDir, writeFile }), outDir).toThrow(/outDir/)
    }
  })
})
