import { describe, it, expect } from 'vitest'
import {
  SiteInsertSchema,
  SitePageInsertSchema,
  SiteSectionInsertSchema,
  type SitePageInsert,
  type SiteSectionInsert,
} from '@sahoda/shared'
import { toRows } from './to-rows'
import { at, makeDraft, withStoreIds, CREATED_BY, OPTIONS, WORKSPACE_ID } from './to-rows.fixtures'

describe('toRows — conformance to the FROZEN insert schemas in @sahoda/shared', () => {
  it('emits a site row that the real SiteInsertSchema accepts', () => {
    const result = SiteInsertSchema.safeParse(toRows(makeDraft(), OPTIONS).site)

    expect(result.success).toBe(true)
  })

  it('emits page rows that the real SitePageInsertSchema accepts once the store adds the ids', () => {
    const stamped = withStoreIds(toRows(makeDraft(), OPTIONS))

    for (const entry of stamped) {
      expect(SitePageInsertSchema.safeParse(entry.page).success).toBe(true)
    }
    expect(stamped).toHaveLength(2)
  })

  it('emits section rows that the real SiteSectionInsertSchema accepts once the store adds the ids', () => {
    const stamped = withStoreIds(toRows(makeDraft(), OPTIONS))
    const sections = stamped.flatMap((entry) => entry.sections)

    for (const section of sections) {
      expect(SiteSectionInsertSchema.safeParse(section).success).toBe(true)
    }
    expect(sections).toHaveLength(3)
  })

  it('emits a page row the frozen schema REJECTS without site_id, proving the omission is real', () => {
    const rows = toRows(makeDraft(), OPTIONS)

    const result = SitePageInsertSchema.safeParse({
      ...at(rows.pages, 0).page,
      workspace_id: WORKSPACE_ID,
    })

    expect(result.success).toBe(false)
  })

  it('leaves site_id and workspace_id off page rows, because the store owns id generation', () => {
    const rows = toRows(makeDraft(), OPTIONS)

    expect(Object.keys(at(rows.pages, 0).page).sort()).toEqual(['path', 'seo', 'sort', 'title'])
  })

  it('leaves page_id and workspace_id off section rows, because the store owns id generation', () => {
    const rows = toRows(makeDraft(), OPTIONS)

    expect(Object.keys(at(at(rows.pages, 0).sections, 0)).sort()).toEqual([
      'content',
      'kind',
      'sort',
    ])
  })
})

/*
 * workspace_id is a house non-negotiable, so it is pinned twice: at COMPILE time (a child
 * row is structurally not an insert row until the store supplies the tenant) and at RUN
 * time (a bad tenant reaches the frozen schema as a rejection, never as a written row).
 */
describe('toRows — workspace_id cannot be forgotten', () => {
  it('cannot type a page row as SitePageInsert without the store stamping the tenant', () => {
    const rows = toRows(makeDraft(), OPTIONS)

    // @ts-expect-error — missing workspace_id and site_id: only the store can supply them.
    const forgotten: SitePageInsert = at(rows.pages, 0).page

    expect(forgotten).toBeDefined()
  })

  it('cannot type a section row as SiteSectionInsert without the store stamping the tenant', () => {
    const rows = toRows(makeDraft(), OPTIONS)

    // @ts-expect-error — missing workspace_id and page_id: only the store can supply them.
    const forgotten: SiteSectionInsert = at(at(rows.pages, 0).sections, 0)

    expect(forgotten).toBeDefined()
  })

  it('takes the tenant only from options, so a draft cannot smuggle a different one in', () => {
    const other = '44444444-4444-4444-8444-444444444444'

    const rows = toRows(makeDraft(), { ...OPTIONS, workspaceId: other })

    expect(rows.site.workspace_id).toBe(other)
  })

  it('lets an unusable tenant fail the frozen schema rather than papering over it', () => {
    const rows = toRows(makeDraft(), { ...OPTIONS, workspaceId: 'not-a-uuid' })

    expect(rows.site.workspace_id).toBe('not-a-uuid')
    expect(SiteInsertSchema.safeParse(rows.site).success).toBe(false)
  })

  it('lets a blank creator fail the frozen schema rather than inventing a fallback', () => {
    const rows = toRows(makeDraft(), { ...OPTIONS, createdBy: '' })

    expect(SiteInsertSchema.safeParse(rows.site).success).toBe(false)
  })
})

describe('toRows — the site row', () => {
  it('carries the workspace, name, resolved slug and creator required by SiteInsertSchema', () => {
    const rows = toRows(makeDraft(), OPTIONS)

    expect(rows.site).toEqual({
      workspace_id: WORKSPACE_ID,
      name: 'Acme Coffee',
      slug: 'acme-coffee',
      goal: 'Sell monthly subscriptions',
      created_by: CREATED_BY,
    })
  })

  it('takes the slug from options, not from the draft, so the resolved slug always wins', () => {
    const rows = toRows(makeDraft({ name: 'Totally Different Name' }), {
      ...OPTIONS,
      slug: 'acme-coffee-4',
    })

    expect(rows.site.slug).toBe('acme-coffee-4')
    expect(rows.site.name).toBe('Totally Different Name')
  })

  it('writes goal as null when the draft has none, since sites.goal is nullable not absent', () => {
    const rows = toRows(makeDraft({ goal: null }), OPTIONS)

    expect(rows.site.goal).toBeNull()
    expect(SiteInsertSchema.safeParse(rows.site).success).toBe(true)
  })
})
