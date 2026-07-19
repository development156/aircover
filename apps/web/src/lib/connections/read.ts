import 'server-only'

import { cache } from 'react'
import { ConnectionSchema, type Connection } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

/**
 * Connection reads, RLS-scoped, filtered to the ACTIVE workspace (correctness
 * filter, not authorization — see lib/posts/read.ts). `null` means COULD NOT
 * READ, `[]` means none connected — the two must not collapse (the wallet's
 * unreadable-≠-zero rule; a read hiccup shown as "nothing connected" would
 * invite a redundant reconnect the moment connecting exists).
 */

const activeWorkspaceId = cache(async (): Promise<string | null> => {
  const workspace = await getActiveWorkspace()
  return workspace?.id ?? null
})

export async function listConnections(): Promise<Connection[] | null> {
  const wsId = await activeWorkspaceId()
  if (!wsId) return null

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: true })
  if (error || !data) return null

  return data
    .map((row) => ConnectionSchema.safeParse(row))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
}
