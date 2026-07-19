import type { AppError, Result } from '@sahoda/shared'
import type { WriteBundleFile } from './fixture'
import type {
  BundleFile,
  DeployContext,
  SiteBundle,
  SiteDeployHistoryEntry,
  SiteDeployState,
} from './port'

/**
 * Shared fixtures for the deployer tests that assert the PERSISTABILITY contract, extracted for
 * the same reason `port-fixtures.ts` was: the two suites below assert against the same honest
 * baseline, and two divergent copies is how one of them ends up passing against a shape the
 * deployer no longer produces.
 *
 * Deliberately NOT retrofitted onto `fixture.test.ts`, `fixture-bundle.test.ts` and
 * `fixture-collision.test.ts`, which carry their own copies. Those suites are green and owned by
 * other work in flight; rewriting them to share this would be churn with no assertion behind it.
 */

export const FIXED_ISO = '2026-07-19T09:30:00.000Z'

/**
 * Restated as a literal rather than imported from `fixture.ts`, so a change to the derivation
 * there has to be justified against a number rather than silently agreeing with itself:
 * 2048 (`MAX_URL_LENGTH`) - 7 (`file://`) - 63 (the longest slug `isValidSlug` admits) -
 * 10 (`index.html`) - 2 (the two separators `joinPath` inserts).
 */
export const MAX_OUT_DIR_LENGTH = 1966

/** `MAX_TEXT_LENGTH` in `port.ts`, restated for the same reason. */
export const MAX_TEXT_LENGTH = 2048

export const LONGEST_SLUG = 'a'.repeat(63)

export const outDirOfLength = (length: number): string => '/' + 'd'.repeat(length - 1)

export function context(traceId: string, overrides: Partial<DeployContext> = {}): DeployContext {
  return {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    siteId: '22222222-2222-4222-8222-222222222222',
    slug: 'acme-chai',
    baseDomain: 'sahoda.site',
    traceId,
    previous: [],
    now: () => new Date(FIXED_ISO),
    ...overrides,
  }
}

export function file(path = 'index.html'): BundleFile {
  return { path, content: '<!doctype html>', contentType: 'text/html' }
}

export function bundle(overrides: Partial<SiteBundle> = {}): SiteBundle {
  return { bundleId: 'bundle-abc123', files: [file()], ...overrides }
}

export function historyEntry(
  overrides: Partial<SiteDeployHistoryEntry> = {},
): SiteDeployHistoryEntry {
  return {
    bundleId: 'bundle-previous',
    deployedAt: FIXED_ISO,
    url: 'file:///tmp/sahoda-preview/acme-chai/index.html',
    preview: true,
    ...overrides,
  }
}

export function recordingWriter(): { writeFile: WriteBundleFile; calls: () => string[] } {
  const calls: string[] = []
  return {
    writeFile: async (path) => {
      calls.push(path)
    },
    calls: () => calls,
  }
}

export function unwrapErr(result: Result<SiteDeployState>): AppError {
  if (result.ok) {
    throw new Error('expected an error result, got ok')
  }
  return result.error
}

export function unwrapOk(result: Result<SiteDeployState>): SiteDeployState {
  if (!result.ok) {
    throw new Error(`expected an ok result, got ${result.error.code}: ${result.error.message}`)
  }
  return result.data
}
