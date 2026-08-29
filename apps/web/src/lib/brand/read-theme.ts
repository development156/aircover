import 'server-only'

import { cache } from 'react'

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
 * ── THE PARAMETER IS REQUIRED NOW, AND THAT IS THE FIX ──────────────────────
 * It used to be optional, "only because the app shell has always called this
 * unfiltered", with a note asking new callers to pass the id. `/sites` was a new
 * caller and did not (page.tsx:59) — so the site preview was painted in whichever
 * of the user's workspaces happened to hold the highest theme version, which for
 * anyone in two workspaces is a coin toss. The shell caller the note referred to
 * no longer exists; `/onboarding` was already passing the id.
 *
 * A comment asking callers to do the right thing is not a mechanism. Requiring
 * the parameter makes the next occurrence a type error instead of a wrong colour
 * nobody notices. (RLS still confines this to the caller's own memberships — it
 * was never another CUSTOMER's brand, which is why nothing looked wrong.)
 */
/**
 * CACHED PER RENDER, since the app shell began reading this on every route.
 *
 * `/sites` and `/studio` also call it, so a page in either group would otherwise
 * make the same query twice in one render: once for the shell's Brand Skin and
 * once for its own preview. React's `cache` keys on the argument, so two
 * workspaces in one render stay two reads and the tenant scoping is untouched.
 */
export const activeThemeTokens = cache(async function activeThemeTokens(
  workspaceId: string,
): Promise<ThemeTokens | null> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('workspace_themes')
      .select('tokens')
      .eq('status', 'active')
      .eq('workspace_id', workspaceId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return null

    const parsed = ThemeTokensSchema.safeParse((data as { tokens: unknown }).tokens)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
})
