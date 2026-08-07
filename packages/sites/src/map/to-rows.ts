import type { SiteInsert, SitePageInsert, SiteSectionInsert } from '@sahoda/shared'
import type { SectionContent } from '../normalize/section-content'
import type { SiteDraft } from '../normalize/draft'

/**
 * One page plus its sections, with the foreign keys the STORE owns left off.
 *
 * `site_id` / `page_id` / `workspace_id` are absent on purpose: the store inserts the
 * parent, reads back the generated uuid, and stamps it onto the children. The composite
 * FKs `(site_id, workspace_id)` and `(page_id, workspace_id)` mean the tenant binding
 * must match the parent row that was actually written — a mapper cannot know that.
 *
 * The omission is load-bearing, not cosmetic: because these are `Omit<…>` and the frozen
 * schemas require the tenant, a child row is not assignable to `SitePageInsert` /
 * `SiteSectionInsert` until the store supplies it. Forgetting `workspace_id` is a type
 * error before it is ever an RLS violation.
 */
export interface SiteRowsPage {
  page: Omit<SitePageInsert, 'site_id' | 'workspace_id'>
  sections: Array<Omit<SiteSectionInsert, 'page_id' | 'workspace_id'>>
}

export interface SiteRows {
  site: SiteInsert
  pages: SiteRowsPage[]
}

export interface ToRowsOptions {
  /** The only source of tenancy in this module — never read off the draft. */
  workspaceId: string
  /** The globally-unique slug from `resolveSlug` — never re-derived here. */
  slug: string
  /** Clerk subject id; `sites.created_by` is `z.string().min(1)`, not a uuid. */
  createdBy: string
}

/**
 * The narrowed section content types are plain interfaces, which TypeScript will not
 * assign to `Record<string, unknown>` (no index signature) even though every field is
 * already JSON-safe. The cast is the whole point of this helper: it is the ONLY place
 * the widening happens, and it copies nothing, so the value that reaches the jsonb
 * column is byte-for-byte the value normalization produced.
 */
const asJsonb = (content: SectionContent['content']): Record<string, unknown> =>
  content as unknown as Record<string, unknown>

/**
 * Project a normalized draft onto the frozen insert shapes.
 *
 * Total: every draft maps, including one with no pages. Nothing is validated here that
 * the frozen schemas already validate — an unusable `workspaceId` or `createdBy` is
 * carried through verbatim so it fails at `SiteInsertSchema`, which is the honest
 * outcome; substituting a default would turn a caller's bug into a silently mis-tenanted
 * site.
 *
 * Ordering: `sort` is the ARRAY INDEX, not any `sort` carried on the draft. The mesh
 * emits position only, `site_sections` has no unique constraint on `(page_id, sort)`
 * and no tiebreaker, so this mapper is the sole ordering authority and readers must
 * `order by sort, created_at`.
 */
export const toRows = (draft: SiteDraft, options: ToRowsOptions): SiteRows => ({
  site: {
    workspace_id: options.workspaceId,
    name: draft.name,
    slug: options.slug,
    goal: draft.goal,
    created_by: options.createdBy,
  },
  pages: draft.pages.map((page, pageIndex) => ({
    page: {
      path: page.path,
      title: page.title,
      sort: pageIndex,
      seo: page.seoDescription === null ? null : { description: page.seoDescription },
    },
    sections: page.sections.map((section, sectionIndex) => ({
      kind: section.section.kind,
      sort: sectionIndex,
      content: asJsonb(section.section.content),
    })),
  })),
})
