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
 * RLS scopes the read to the caller's memberships, so no workspace filter is
 * needed here (mirrors `listWorkspaces`).
 */
export async function activeThemeTokens(): Promise<ThemeTokens | null> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('workspace_themes')
      .select('tokens')
      .eq('status', 'active')
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
