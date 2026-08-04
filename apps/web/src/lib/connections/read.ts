import 'server-only'

import { cache } from 'react'
import { ChannelSchema, ConnectionSchema, type Channel, type Connection } from '@sahoda/shared'

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

/**
 * The channels this workspace can actually publish to right now.
 *
 * ── WHY THE COMPOSER NEEDS THIS ──────────────────────────────────────────────
 * Without it a shop owner picks Instagram, writes the post, attaches a photo,
 * sets a time — and learns there is no Instagram connection at the moment they
 * press Publish, with all the work already done. The composer knew nothing about
 * connections, so every one of those steps was offered as though it would work.
 *
 * `status = 'active'` only. An `expired` or `revoked` row is a connection that
 * exists and cannot publish, and offering it would recreate the same surprise one
 * layer down.
 */
export async function listConnectedChannels(): Promise<Set<Channel>> {
  const connections = await listConnections()
  if (connections === null) return new Set()
  return new Set(
    connections
      .filter((connection) => connection.status === 'active')
      .map((connection) => connection.platform)
      .filter((platform): platform is Channel => CHANNEL_SET.has(platform as Channel)),
  )
}

/** ConnectionPlatform is wider than Channel — a platform we cannot compose for is not one. */
const CHANNEL_SET: ReadonlySet<Channel> = new Set(ChannelSchema.options)
