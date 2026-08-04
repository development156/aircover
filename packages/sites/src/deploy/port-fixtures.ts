import type { SiteDeployHistoryEntry, SiteDeployState } from './port'

/**
 * Shared test fixtures for the `sites.deploy` schemas. Extracted rather than duplicated so a
 * cross-field rule added to {@link SiteDeployState} has exactly ONE honest baseline to update:
 * two divergent copies is how a schema test file ends up asserting against a shape the schema
 * no longer accepts.
 */
export const FIXED_ISO = '2026-07-19T09:30:00.000Z'

export const LOCAL_URL = 'file:///tmp/sahoda-preview/acme-chai/index.html'

export function entry(overrides: Partial<SiteDeployHistoryEntry> = {}): SiteDeployHistoryEntry {
  return {
    bundleId: 'bundle-1',
    deployedAt: FIXED_ISO,
    url: LOCAL_URL,
    preview: true,
    ...overrides,
  }
}

/** A LIVE deploy: url and deployedAt present, error null — the only honest live shape. */
export function state(overrides: Partial<SiteDeployState> = {}): SiteDeployState {
  return {
    deployer: 'fixture',
    status: 'live',
    preview: true,
    url: LOCAL_URL,
    bundleId: 'bundle-1',
    scriptName: null,
    deployedAt: FIXED_ISO,
    error: null,
    history: [entry()],
    ...overrides,
  }
}

/** A FAILED deploy: no url, no timestamp, an error that explains it. */
export function failedState(overrides: Partial<SiteDeployState> = {}): SiteDeployState {
  return state({
    status: 'failed',
    url: null,
    deployedAt: null,
    error: { code: 'PROVIDER_ERROR', message: 'Cloudflare rejected the upload with HTTP 401.' },
    history: [],
    ...overrides,
  })
}
