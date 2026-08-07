import 'server-only'

import { cache } from 'react'
import {
  SitePageSchema,
  SiteSchema,
  SiteSectionSchema,
  type Site,
  type SitePage,
  type SiteSection,
} from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

/**
 * Site reads, RLS-scoped, filtered to the ACTIVE workspace (a correctness
 * filter, not authorization — see lib/posts/read.ts for the full reasoning).
 * Every read degrades to null/empty rather than throwing; rows parse per-row
 * so one malformed row cannot take down the screen.
 */

const activeWorkspaceId = cache(async (): Promise<string | null> => {
  const workspace = await getActiveWorkspace()
  return workspace?.id ?? null
})

/**
 * Recent sites, newest first. `null` means COULD NOT READ — distinct from `[]`
 * (no site was ever generated), because collapsing the two put a "Generate ·
 * 100 credits" button over a transient read error: a founder with a healthy,
 * paid site would see the brand-new empty state and every reason to pay again
 * (review HIGH; same unreadable-≠-zero rule as `readBalance`).
 *
 * More than one row on purpose: a generation whose mid-way cleanup failed can
 * leave a newest row with zero pages, and a single-row read would let that
 * orphan permanently shadow the older, healthy, paid site underneath. The
 * caller walks these until one previews.
 */
export async function recentSites(limit = 3): Promise<Site[] | null> {
  const wsId = await activeWorkspaceId()
  if (!wsId) return null

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) return null

  return data
    .map((row) => SiteSchema.safeParse(row))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
}

export interface SiteTree {
  pages: SitePage[]
  sections: SiteSection[]
}

/** Pages + sections for one site. Null means "could not read", not "empty". */
export async function readSiteTree(siteId: string): Promise<SiteTree | null> {
  const wsId = await activeWorkspaceId()
  if (!wsId) return null

  const supabase = createServerSupabase()
  const { data: pageRows, error: pagesError } = await supabase
    .from('site_pages')
    .select('*')
    .eq('workspace_id', wsId)
    .eq('site_id', siteId)
    .order('sort', { ascending: true })
  if (pagesError || !pageRows) return null

  const pages = pageRows
    .map((row) => SitePageSchema.safeParse(row))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
  if (pages.length === 0) return { pages: [], sections: [] }

  const { data: sectionRows, error: sectionsError } = await supabase
    .from('site_sections')
    .select('*')
    .eq('workspace_id', wsId)
    .in(
      'page_id',
      pages.map((page) => page.id),
    )
    .order('sort', { ascending: true })
  if (sectionsError || !sectionRows) return null

  const sections = sectionRows
    .map((row) => SiteSectionSchema.safeParse(row))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)

  return { pages, sections }
}
