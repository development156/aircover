import { describe, it, expect } from 'vitest'
import type { Result } from '@sahoda/shared'
import { ok, err, appError } from '@sahoda/shared'
import { SITE_STORE_METHODS, type SiteStore } from './store'
import type { SiteRows } from './map/to-rows'
import { toRows } from './map/to-rows'
import { resolveSlug } from './slug'
import type { SiteDraft } from './normalize/draft'
import type { NormalizedSection } from './normalize/section-content'
import type { SiteDeployState } from './deploy/port'

const FIXED_NOW = new Date('2026-07-19T10:00:00.000Z')
const TRACE_ID = 'trace-store-15'
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222'
const CREATED_BY = 'user_2abcDEF'

/** noUncheckedIndexedAccess is on: index once, loudly, instead of sprinkling `!`.
 *  The same helper Task 6's to-rows.test.ts defines — a bare `files[0].content` is a
 *  compile error under `tsc --noEmit`, and test files are typechecked. */
const at = <T>(list: readonly T[], index: number): T => {
  const value = list[index]
  if (value === undefined) {
    throw new Error(`expected an element at index ${index}, got a list of length ${list.length}`)
  }
  return value
}

const HERO_SECTION: NormalizedSection = {
  section: {
    kind: 'hero',
    content: {
      headline: 'Fresh chai, delivered',
      subhead: 'Two hours, city wide',
      ctaLabel: 'Order now',
      ctaHref: 'https://chai.example/order',
    },
  },
  sort: 0,
  raw: { headline: 'Fresh chai, delivered' },
}

const CONTACT_SECTION: NormalizedSection = {
  section: { kind: 'contact', content: { headline: 'Talk to us', submitLabel: 'Send' } },
  sort: 1,
  raw: { headline: 'Talk to us' },
}

const DRAFT: SiteDraft = {
  name: 'Chai Point',
  goal: 'leads',
  pages: [
    {
      path: '/',
      title: 'Chai Point',
      seoDescription: 'Fresh chai delivered across the city.',
      sort: 0,
      sections: [HERO_SECTION, CONTACT_SECTION],
    },
  ],
}

const PREVIEW_DEPLOY: SiteDeployState = {
  deployer: 'fixture',
  status: 'live',
  preview: true,
  url: 'file:///tmp/sites/chai-point/index.html',
  bundleId: 'b3f1a2c4',
  scriptName: null,
  deployedAt: FIXED_NOW.toISOString(),
  error: null,
  history: [],
}

type FailingMethod = 'isSlugTaken' | 'createSite' | 'recordDeploy'

interface FakeStoreOptions {
  taken?: string[]
  failOn?: FailingMethod
}

interface FakeSiteStore extends SiteStore {
  readonly sites: Array<{ siteId: string; rows: SiteRows }>
  readonly deploys: Array<{ siteId: string; state: SiteDeployState }>
  readonly calls: string[]
}

/**
 * The in-memory reference implementation of the port. Deterministic ids stand in for
 * the service-role client's `gen_random_uuid()` — the point is that the STORE mints
 * them, never the package.
 */
const createFakeSiteStore = (options: FakeStoreOptions = {}): FakeSiteStore => {
  const taken = new Set(options.taken ?? [])
  const sites: Array<{ siteId: string; rows: SiteRows }> = []
  const deploys: Array<{ siteId: string; state: SiteDeployState }> = []
  const calls: string[] = []
  let minted = 0

  return {
    sites,
    deploys,
    calls,
    async isSlugTaken(slug: string): Promise<boolean> {
      calls.push(`isSlugTaken:${slug}`)
      if (options.failOn === 'isSlugTaken') throw new Error('connection pool exhausted')
      return taken.has(slug)
    },
    async createSite(rows: SiteRows): Promise<{ siteId: string }> {
      calls.push(`createSite:${rows.site.slug}`)
      if (options.failOn === 'createSite') {
        throw new Error('duplicate key value violates unique constraint "sites_slug_key"')
      }
      minted += 1
      const siteId = `site-${String(minted).padStart(4, '0')}`
      sites.push({ siteId, rows })
      taken.add(rows.site.slug)
      return { siteId }
    },
    async recordDeploy(siteId: string, state: SiteDeployState): Promise<void> {
      calls.push(`recordDeploy:${siteId}`)
      if (options.failOn === 'recordDeploy') throw new Error('deploy write failed')
      deploys.push({ siteId, state })
    },
  }
}

interface PersistContext {
  workspaceId: string
  createdBy: string
  traceId: string
}

/**
 * The composed call site, written here rather than exported: wt-web owns this glue at
 * the mount point. The test pins the contract it must honour — implementations THROW,
 * the caller returns a typed Result and never lets a rejection escape.
 */
const persistSite = async (
  draft: SiteDraft,
  store: SiteStore,
  ctx: PersistContext,
): Promise<Result<{ siteId: string; slug: string }>> => {
  try {
    const slug = await resolveSlug(
      draft.name,
      (candidate) => store.isSlugTaken(candidate),
      ctx.traceId,
    )
    if (!slug.ok) return slug
    const rows = toRows(draft, {
      workspaceId: ctx.workspaceId,
      slug: slug.data,
      createdBy: ctx.createdBy,
    })
    const created = await store.createSite(rows)
    return ok({ siteId: created.siteId, slug: slug.data })
  } catch (error) {
    return err(
      appError('PROVIDER_ERROR', 'Could not save the site. Try again.', ctx.traceId, {
        cause: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

const persistDeploy = async (
  siteId: string,
  state: SiteDeployState,
  store: SiteStore,
  traceId: string,
): Promise<Result<null>> => {
  try {
    await store.recordDeploy(siteId, state)
    return ok(null)
  } catch (error) {
    return err(
      appError('PROVIDER_ERROR', 'Could not record the deploy. Try again.', traceId, {
        cause: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

describe('SITE_STORE_METHODS — the runtime pin on the port surface', () => {
  it('names exactly the three verbs the port declares, so the seam cannot widen unnoticed', () => {
    expect([...SITE_STORE_METHODS]).toEqual(['isSlugTaken', 'createSite', 'recordDeploy'])
  })

  it('is implemented in full by a conforming store, which is what makes the red step honest', () => {
    const store = createFakeSiteStore()

    for (const method of SITE_STORE_METHODS) {
      expect(typeof store[method]).toBe('function')
    }
  })
})

describe('SiteStore port — composes with resolveSlug + toRows end to end', () => {
  it('persists a draft and returns the id the STORE minted, proving the package generates none', async () => {
    const store = createFakeSiteStore()

    const result = await persistSite(DRAFT, store, {
      workspaceId: WORKSPACE_ID,
      createdBy: CREATED_BY,
      traceId: TRACE_ID,
    })

    expect(result).toEqual({ ok: true, data: { siteId: 'site-0001', slug: 'chai-point' } })
    expect(store.sites).toHaveLength(1)
    const rows = at(store.sites, 0).rows
    expect(rows.site.name).toBe('Chai Point')
    expect(rows.site.slug).toBe('chai-point')
    expect(rows.site.created_by).toBe(CREATED_BY)
    expect(rows.pages).toHaveLength(1)
    expect(at(rows.pages, 0).sections).toHaveLength(2)
  })

  it('probes isSlugTaken before createSite, because the global unique index is checked client-side first', async () => {
    const store = createFakeSiteStore()

    await persistSite(DRAFT, store, {
      workspaceId: WORKSPACE_ID,
      createdBy: CREATED_BY,
      traceId: TRACE_ID,
    })

    expect(store.calls).toEqual(['isSlugTaken:chai-point', 'createSite:chai-point'])
  })

  it('stores under the collision-resolved slug, proving the port actually gates slug choice', async () => {
    const store = createFakeSiteStore({ taken: ['chai-point', 'chai-point-2'] })

    const result = await persistSite(DRAFT, store, {
      workspaceId: WORKSPACE_ID,
      createdBy: CREATED_BY,
      traceId: TRACE_ID,
    })

    expect(result).toEqual({ ok: true, data: { siteId: 'site-0001', slug: 'chai-point-3' } })
    expect(at(store.sites, 0).rows.site.slug).toBe('chai-point-3')
    expect(store.calls).toEqual([
      'isSlugTaken:chai-point',
      'isSlugTaken:chai-point-2',
      'isSlugTaken:chai-point-3',
      'createSite:chai-point-3',
    ])
  })

  it('binds the site row to the caller workspace and leaves child rows unbound for the store to fill', async () => {
    const store = createFakeSiteStore()

    await persistSite(DRAFT, store, {
      workspaceId: WORKSPACE_ID,
      createdBy: CREATED_BY,
      traceId: TRACE_ID,
    })

    const rows = at(store.sites, 0).rows
    const firstPage = at(rows.pages, 0)
    expect(rows.site.workspace_id).toBe(WORKSPACE_ID)
    expect(rows.site.workspace_id).not.toBe(OTHER_WORKSPACE_ID)
    expect(Object.keys(firstPage.page)).not.toContain('workspace_id')
    expect(Object.keys(firstPage.page)).not.toContain('site_id')
    expect(Object.keys(at(firstPage.sections, 0))).not.toContain('workspace_id')
    expect(Object.keys(at(firstPage.sections, 0))).not.toContain('page_id')
  })

  it('keeps section order as the mapper assigned it, since the DB has no tiebreaker on sort', async () => {
    const store = createFakeSiteStore()

    await persistSite(DRAFT, store, {
      workspaceId: WORKSPACE_ID,
      createdBy: CREATED_BY,
      traceId: TRACE_ID,
    })

    const sections = at(at(store.sites, 0).rows.pages, 0).sections
    expect(sections.map((s) => s.kind)).toEqual(['hero', 'contact'])
    expect(sections.map((s) => s.sort)).toEqual([0, 1])
  })

  it('records the deploy state verbatim so preview:true survives the port unaltered', async () => {
    const store = createFakeSiteStore()

    const result = await persistDeploy('site-0001', PREVIEW_DEPLOY, store, TRACE_ID)

    expect(result).toEqual({ ok: true, data: null })
    expect(store.deploys).toEqual([{ siteId: 'site-0001', state: PREVIEW_DEPLOY }])
    expect(at(store.deploys, 0).state.preview).toBe(true)
    expect(at(store.deploys, 0).state.url).toBe('file:///tmp/sites/chai-point/index.html')
  })
})

describe('SiteStore port — a throwing implementation surfaces as a typed Result', () => {
  /*
   * The two write paths fail DIFFERENTLY, and the difference is a security property, not an
   * accident. `createSite` throws inside `persistSite`'s own try, so its catch runs and attaches
   * the driver text as `details.cause`. `isSlugTaken` throws one layer deeper — `resolveSlug`
   * funnels every predicate call through `probeTaken`, which catches the throw FIRST and returns
   * a fixed, credential-free `PROVIDER_ERROR`. That scrub is deliberate: a driver-level exception
   * routinely embeds the connection string / host / credentials in its message, and this message
   * is surfaced in the UI and written to logs (see slug.ts `probeTaken`). So `persistSite`'s catch
   * never sees the isSlugTaken throw, and the raw message must not appear anywhere in the Result.
   */

  it("maps a throw in createSite to PROVIDER_ERROR with the driver cause, since the write is the caller's to catch", async () => {
    const store = createFakeSiteStore({ failOn: 'createSite' })

    const result = await persistSite(DRAFT, store, {
      workspaceId: WORKSPACE_ID,
      createdBy: CREATED_BY,
      traceId: TRACE_ID,
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable: expected a failed Result')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(result.error.traceId).toBe(TRACE_ID)
    expect(result.error.message).toBe('Could not save the site. Try again.')
    expect(result.error.details).toEqual({
      cause: 'duplicate key value violates unique constraint "sites_slug_key"',
    })
  })

  it("maps a throw in isSlugTaken to resolveSlug's SCRUBBED PROVIDER_ERROR, never leaking the driver text through the caller", async () => {
    const store = createFakeSiteStore({ failOn: 'isSlugTaken' })

    const result = await persistSite(DRAFT, store, {
      workspaceId: WORKSPACE_ID,
      createdBy: CREATED_BY,
      traceId: TRACE_ID,
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable: expected a failed Result')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(result.error.traceId).toBe(TRACE_ID)
    // probeTaken caught it first: the fixed, credential-free copy — NOT persistSite's message,
    // and NOT the raw throw, which it deliberately discards rather than interpolates.
    expect(result.error.message).toBe('could not check slug availability, please retry')
    // The security property, asserted directly: the driver text (which can carry the connection
    // string) never escapes into the Result the mount surfaces.
    expect(JSON.stringify(result.error)).not.toContain('connection pool exhausted')
    expect(store.sites).toEqual([])
  })

  it('resolves rather than rejects when the store throws, so no unhandled rejection escapes the mount point', async () => {
    const store = createFakeSiteStore({ failOn: 'createSite' })

    await expect(
      persistSite(DRAFT, store, {
        workspaceId: WORKSPACE_ID,
        createdBy: CREATED_BY,
        traceId: TRACE_ID,
      }),
    ).resolves.toMatchObject({ ok: false })
  })

  it('maps a throw in recordDeploy to PROVIDER_ERROR and records nothing, so no half-written deploy is claimed', async () => {
    const store = createFakeSiteStore({ failOn: 'recordDeploy' })

    const result = await persistDeploy('site-0001', PREVIEW_DEPLOY, store, TRACE_ID)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable: expected a failed Result')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(result.error.details).toEqual({ cause: 'deploy write failed' })
    expect(store.deploys).toEqual([])
  })

  it('never leaks a store failure as a success with a plausible id, which would strand an unsaved site', async () => {
    const store = createFakeSiteStore({ failOn: 'createSite' })

    const result = await persistSite(DRAFT, store, {
      workspaceId: WORKSPACE_ID,
      createdBy: CREATED_BY,
      traceId: TRACE_ID,
    })

    expect(result.ok).toBe(false)
    expect(store.sites).toEqual([])
  })
})
