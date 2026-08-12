import 'server-only'

import { ThemeTokensSchema, type ThemeTokens } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The workspace's active Brand Skin, or `null` when there is none.
 *
 * `null` is a first-class answer, not a failure: a workspace that never
 * uploaded a logo genuinely has no theme, and `themeCss(null)` degrades to the
 * tokens.css defaults. An unreadable or malformed row degrades the same way —
 * showing the default palette is honest, whereas a half-parsed theme would
 * paint a workspace in colors it never chose.
 *
 * RLS scopes the read to the caller's MEMBERSHIPS — which is not the same as
 * the workspace they are currently in. For someone who belongs to two, an
 * unfiltered read returns whichever row sorts first, so it can hand back
 * another workspace's brand. Pass `workspaceId` whenever the answer is about a
 * specific workspace rather than "does this user have any theme at all".
 *
 * The parameter is optional only because the app shell has always called this
 * unfiltered; that call carries the same cross-workspace defect and is a
 * separate fix (`apps/web/REQUESTS.md`). New callers should pass the id.
 */
export async function activeThemeTokens(workspaceId?: string): Promise<ThemeTokens | null> {
  try {
    const supabase = createServerSupabase()
    let query = supabase.from('workspace_themes').select('tokens').eq('status', 'active')
    if (workspaceId) query = query.eq('workspace_id', workspaceId)

    const { data, error } = await query
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return null

    const parsed = ThemeTokensSchema.safeParse((data as { tokens: unknown }).tokens)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
