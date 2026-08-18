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
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * Site reads, RLS-scoped, filtered to the ACTIVE workspace (a correctness
 * filter, not authorization — see lib/posts/read.ts for the full reasoning).
 * Every read degrades to null/empty rather than throwing; rows parse per-row
 * so one malformed row cannot take down the screen.
 */

const activeWorkspaceId = cache(async (): Promise<string | null> => {
  const read = await activeWorkspaceRead()
  return read.status === 'ok' ? read.workspace.id : null
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
export type SitesRead =
  { status: 'ok'; sites: Site[] } | { status: 'no-workspace' } | { status: 'unreadable' }

/**
 * The three-way answer. `null` used to carry "no workspace" as well as "could not
 * read", and /sites rendered the failure copy for both — telling a brand-new
 * account "Couldn't check your sites just now — reload before generating. You may
 * already have a site, and generating again costs credits." Not one clause of that
 * was true, and it warned about a charge over an account that has no wallet.
 */
export async function readRecentSites(limit = 3): Promise<SitesRead> {
  const workspace = await activeWorkspaceRead()
  if (workspace.status === 'unreadable') return { status: 'unreadable' }
  if (workspace.status === 'none') return { status: 'no-workspace' }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('workspace_id', workspace.workspace.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) return { status: 'unreadable' }

  return {
    status: 'ok',
    sites: data
      .map((row) => SiteSchema.safeParse(row))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data),
  }
}

/** The lossy view, for callers that cannot render the difference. */
export async function recentSites(limit = 3): Promise<Site[] | null> {
  const read = await readRecentSites(limit)
  return read.status === 'ok' ? read.sites : null
}

/**
 * How many sites this workspace has — the `currentUsage` the entitlements gate
 * needs. `null` means COULD NOT COUNT, never 0, and every caller must treat it as a
 * refusal: the whole point of the gate is that a Starter workspace with its one site
 * cannot generate a second, and a count that silently degraded to 0 would hand it
 * back the unlimited behaviour the gate exists to remove.
 *
 * Takes `workspaceId` explicitly instead of reading the active-workspace cache, so
 * the number is bound to the SAME workspace the caller is about to insert into. It
 * counts every row including drafts, because `sites.status` never leaves 'draft'
 * today — counting only published sites would count nothing at all.
 */
export async function countSites(workspaceId: string): Promise<number | null> {
  const supabase = createServerSupabase()
  const { count, error } = await supabase
    .from('sites')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  if (error || count === null || count === undefined) return null
  return count
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
