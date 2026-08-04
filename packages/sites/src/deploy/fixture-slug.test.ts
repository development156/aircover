import { describe, it, expect } from 'vitest'
import type { AppError, Result } from '@sahoda/shared'
import { createFixtureDeployer, type WriteBundleFile } from './fixture'
import { slugify } from '../slug'
import type { DeployContext, SiteBundle, SiteDeployState } from './port'

/**
 * `ctx.slug` is joined straight into a HOST filesystem path. `joinPath` strips edge
 * slashes but does NOT reject `..`, and Task 17 -- the seam that would have guaranteed
 * every slug came from `resolveSlug` -- is deferred, so callers hand-wire this field.
 * These tests pin the allowlist that stands in for that missing guarantee.
 */

const OUT_DIR = '/tmp/sahoda-preview'
const TRACE_ID = 'trace-fixture-slug'

function bundle(): SiteBundle {
  return {
    bundleId: 'bundle-abc123',
    files: [{ path: 'index.html', content: '<!doctype html>', contentType: 'text/html' }],
  }
}

function context(slug: string): DeployContext {
  return {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    siteId: '22222222-2222-4222-8222-222222222222',
    slug,
    baseDomain: 'sahoda.site',
    traceId: TRACE_ID,
    previous: [],
    now: () => new Date('2026-07-19T09:30:00.000Z'),
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

function unwrapErr(result: Result<SiteDeployState>): AppError {
  if (result.ok) {
    throw new Error('expected an error result, got ok')
  }
  return result.error
}

const NUL = String.fromCharCode(0)
const NEWLINE = String.fromCharCode(10)

describe('fixtureDeployer -- the slug is host-filesystem input and is validated first', () => {
  const hostile: Array<[string, string]> = [
    ['a bare parent traversal', '..'],
    ['an embedded traversal', 'acme/../../etc'],
    ['a single dot', '.'],
    ['a path separator', 'a/b'],
    ['a backslash separator', 'a\\b'],
    ['an empty slug', ''],
    ['a leading hyphen', '-acme'],
    ['a trailing hyphen', 'acme-'],
    ['a bare hyphen', '-'],
    ['a doubled hyphen slugify can never emit', 'acme--chai'],
    ['uppercase', 'Acme-Chai'],
    ['a dot separator', 'acme.chai'],
    ['a NUL byte', 'acme' + NUL + 'chai'],
    ['a newline', 'acme' + NEWLINE + 'chai'],
    ['whitespace', 'acme chai'],
    ['a tilde home reference', '~'],
    ['a leading slash making it absolute', '/etc/passwd'],
    ['a URL-encoded traversal', '%2e%2e'],
  ]

  for (const [label, slug] of hostile) {
    it('rejects ' + label + ' with a VALIDATION_ERROR and writes nothing', async () => {
      const writer = recordingWriter()
      const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

      const error = unwrapErr(await deploy(bundle(), context(slug)))

      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.traceId).toBe(TRACE_ID)
      expect(writer.calls()).toEqual([])
    })
  }

  it('rejects a slug longer than a DNS label, since the slug becomes a subdomain', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const error = unwrapErr(await deploy(bundle(), context('a'.repeat(64))))

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(writer.calls()).toEqual([])
  })

  it('accepts a slug of exactly 63 characters, the DNS label the cap is derived from', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    const result = await deploy(bundle(), context('a'.repeat(63)))

    expect(result.ok).toBe(true)
    expect(writer.calls()).toEqual(['/tmp/sahoda-preview/' + 'a'.repeat(63) + '/index.html'])
  })

  it('never echoes the rejected slug back, because it is untrusted and surfaced in the UI', async () => {
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    const error = unwrapErr(await deploy(bundle(), context('../../etc/passwd')))

    expect(JSON.stringify(error)).not.toContain('passwd')
  })

  it('accepts every shape slugify actually produces, so the guard cannot reject a real site', async () => {
    const names = ['Acme Chai', 'Café Über', 'ACME  --  CHAI', 'store123', 'a'.repeat(80)]

    for (const name of names) {
      const slug = slugify(name)
      const { writeFile } = recordingWriter()
      const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

      const result = await deploy(bundle(), context(slug))

      expect(result.ok, 'slugify(' + JSON.stringify(name) + ') === ' + JSON.stringify(slug)).toBe(
        true,
      )
    }
  })

  it('accepts the collision-walk suffixes resolveSlug appends to a length-capped root', async () => {
    const root = slugify('a'.repeat(80))
    const { writeFile } = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile })

    for (const slug of [root + '-2', root + '-9', root + '-k7f2qz']) {
      expect((await deploy(bundle(), context(slug))).ok, slug).toBe(true)
    }
  })

  it('writes under the validated slug once it passes, with no traversal reaching the writer', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    await deploy(bundle(), context('acme-chai'))

    expect(writer.calls()).toEqual(['/tmp/sahoda-preview/acme-chai/index.html'])
  })
})
