import { describe, it, expect } from 'vitest'
import type { AppError, Result } from '@sahoda/shared'
import { createFixtureDeployer, type WriteBundleFile } from './fixture'
import {
  SiteDeployStateSchema,
  type DeployContext,
  type SiteBundle,
  type SiteDeployHistoryEntry,
  type SiteDeployState,
} from './port'

const FIXED_NOW = new Date('2026-07-19T09:30:00.000Z')
const OUT_DIR = '/tmp/sahoda-preview'
const BASE_DOMAIN = 'sahoda.site'

function bundle(overrides: Partial<SiteBundle> = {}): SiteBundle {
  return {
    bundleId: 'bundle-abc123',
    files: [
      {
        path: 'index.html',
        content: '<!doctype html><title>Acme Chai</title>',
        contentType: 'text/html; charset=utf-8',
      },
      {
        path: 'about/index.html',
        content: '<!doctype html><title>About Acme Chai</title>',
        contentType: 'text/html; charset=utf-8',
      },
      {
        path: 'styles.css',
        content: ':root{--p:oklch(0.55 0.14 250)}',
        contentType: 'text/css; charset=utf-8',
      },
    ],
    ...overrides,
  }
}

function context(overrides: Partial<DeployContext> = {}): DeployContext {
  return {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    siteId: '22222222-2222-4222-8222-222222222222',
    slug: 'acme-chai',
    baseDomain: BASE_DOMAIN,
    traceId: 'trace-fixture-1',
    previous: [],
    now: () => FIXED_NOW,
    ...overrides,
  }
}

/** Records every (path, content) pair the deployer wrote. No mocking library. */
function recordingWriter(): { writeFile: WriteBundleFile; calls: () => Array<[string, string]> } {
  const calls: Array<[string, string]> = []
  return {
    writeFile: async (path, content) => {
      calls.push([path, content])
    },
    calls: () => calls,
  }
}

function unwrap(result: Result<SiteDeployState>): SiteDeployState {
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`)
  }
  return result.data
}

function unwrapErr(result: Result<SiteDeployState>): AppError {
  if (result.ok) {
    throw new Error('expected an error result, got ok')
  }
  return result.error
}

function historyEntry(bundleId: string): SiteDeployHistoryEntry {
  return { bundleId, deployedAt: '2026-07-18T00:00:00.000Z', url: null, preview: true }
}

describe('fixtureDeployer — the honest default: a local preview, never a public URL', () => {
  it('always reports preview true, because this is not a reachable site', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const state = unwrap(await deploy(bundle(), context()))

    expect(state.preview).toBe(true)
  })

  it('reports status live and deployer fixture, so the UI can label it "preview"', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const state = unwrap(await deploy(bundle(), context()))

    expect(state.status).toBe('live')
    expect(state.deployer).toBe('fixture')
  })

  it('returns a file:// url pointing at the written index.html', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const state = unwrap(await deploy(bundle(), context()))

    expect(state.url).toBe('file:///tmp/sahoda-preview/acme-chai/index.html')
  })

  it('NEVER emits an https url — a plausible public link is the exact v1 sin this forbids', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const state = unwrap(await deploy(bundle(), context()))

    expect(state.url).not.toContain('https://')
    expect(state.url).not.toContain('http://')
  })

  it('NEVER embeds ctx.baseDomain in the url, so a refactor cannot start faking sahoda.site', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const state = unwrap(await deploy(bundle(), context({ baseDomain: BASE_DOMAIN })))

    expect(state.url).not.toContain(BASE_DOMAIN)
    expect(state.url).not.toContain('acme-chai.')
  })

  it('leaves scriptName and error null, since no worker exists on the fixture path', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const state = unwrap(await deploy(bundle(), context()))

    expect(state.scriptName).toBeNull()
    expect(state.error).toBeNull()
  })

  it('writes EVERY bundle file through the injected writer, under outDir/slug', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    await deploy(bundle(), context())

    expect(writer.calls()).toEqual([
      ['/tmp/sahoda-preview/acme-chai/index.html', '<!doctype html><title>Acme Chai</title>'],
      [
        '/tmp/sahoda-preview/acme-chai/about/index.html',
        '<!doctype html><title>About Acme Chai</title>',
      ],
      ['/tmp/sahoda-preview/acme-chai/styles.css', ':root{--p:oklch(0.55 0.14 250)}'],
    ])
  })

  it('reports the deployed bundleId, so the row records WHICH bundle is on disk', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const state = unwrap(await deploy(bundle({ bundleId: 'bundle-zzz999' }), context()))

    expect(state.bundleId).toBe('bundle-zzz999')
    expect(state.bundleId).not.toBe(context().siteId)
  })

  it('returns a typed PROVIDER_ERROR when the writer rejects, instead of throwing at the caller', async () => {
    const writeFile: WriteBundleFile = async () => {
      throw new Error('EACCES: permission denied, open /tmp/sahoda-preview/acme-chai/index.html')
    }
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const result = await deploy(bundle(), context())
    const error = unwrapErr(result)

    expect(result.ok).toBe(false)
    expect(error.code).toBe('PROVIDER_ERROR')
    expect(error.traceId).toBe('trace-fixture-1')
  })

  it('carries only the error NAME in details, never the filesystem error text', async () => {
    const writeFile: WriteBundleFile = async () => {
      throw new Error('EACCES: permission denied, open /home/secret/path')
    }
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const error = unwrapErr(await deploy(bundle(), context()))

    expect(error.details).toEqual({ name: 'Error', path: 'index.html' })
    expect(JSON.stringify(error)).not.toContain('/home/secret/path')
  })

  it('reports name "unknown" when the writer rejects with a non-Error value', async () => {
    const writeFile: WriteBundleFile = async () => {
      throw 'plain string rejection'
    }
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const error = unwrapErr(await deploy(bundle(), context()))

    expect(error.details).toEqual({ name: 'unknown', path: 'index.html' })
    expect(JSON.stringify(error)).not.toContain('plain string rejection')
  })

  it('stops at the first failing file rather than writing a half-broken preview', async () => {
    const written: string[] = []
    const writeFile: WriteBundleFile = async (path) => {
      if (path.endsWith('about/index.html')) throw new Error('ENOSPC')
      written.push(path)
    }
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const result = await deploy(bundle(), context())

    expect(result.ok).toBe(false)
    expect(written).toEqual(['/tmp/sahoda-preview/acme-chai/index.html'])
  })

  it('uses the injected clock so deployedAt is deterministic, not wall-clock', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const state = unwrap(await deploy(bundle(), context()))

    expect(state.deployedAt).toBe('2026-07-19T09:30:00.000Z')
  })

  it('prefers ctx.now over deps.now, so a per-deploy clock wins over the factory default', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({
      outDir: OUT_DIR,
      writeFile,
      now: () => new Date('2000-01-01T00:00:00.000Z'),
    })

    const state = unwrap(await deploy(bundle(), context({ now: () => FIXED_NOW })))

    expect(state.deployedAt).toBe('2026-07-19T09:30:00.000Z')
  })

  it('falls back to deps.now when ctx supplies no clock', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile, now: () => FIXED_NOW })

    const state = unwrap(await deploy(bundle(), context({ now: undefined })))

    expect(state.deployedAt).toBe('2026-07-19T09:30:00.000Z')
  })

  it('prepends this deploy to history and evicts the oldest of five previous entries', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })
    const previous = ['b5', 'b4', 'b3', 'b2', 'b1'].map(historyEntry)

    const state = unwrap(await deploy(bundle(), context({ previous })))

    expect(state.history.map((h) => h.bundleId)).toEqual(['bundle-abc123', 'b5', 'b4', 'b3', 'b2'])
    expect(state.history[0]?.preview).toBe(true)
    expect(state.history[0]?.deployedAt).toBe('2026-07-19T09:30:00.000Z')
  })

  it('does not mutate ctx.previous when building the new history', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })
    const previous = ['b2', 'b1'].map(historyEntry)

    await deploy(bundle(), context({ previous }))

    expect(previous.map((h) => h.bundleId)).toEqual(['b2', 'b1'])
  })

  it('produces a state that parses against SiteDeployStateSchema, so the jsonb write is safe', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })
    const previous = ['b5', 'b4', 'b3', 'b2', 'b1'].map(historyEntry)

    const state = unwrap(await deploy(bundle(), context({ previous })))

    expect(SiteDeployStateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })
})
