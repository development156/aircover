import 'server-only'

import { ChannelSchema, ConnectionSchema, type Channel, type Connection } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * Connection reads, RLS-scoped, filtered to the ACTIVE workspace (correctness
 * filter, not authorization — see lib/posts/read.ts). `null` means COULD NOT
 * READ, `[]` means none connected — the two must not collapse (the wallet's
 * unreadable-≠-zero rule; a read hiccup shown as "nothing connected" would
 * invite a redundant reconnect the moment connecting exists).
 */

/**
 * The three things that can be true of "what is connected", each with its own
 * sentence and its own remedy:
 *
 *  - `ok`           — we read them. `[]` is a real answer: nothing is connected.
 *  - `no-workspace` — there is no workspace to hold a connection. Create one;
 *                     reloading cannot conjure a channel.
 *  - `unreadable`   — the read failed. Reload. Nothing may be claimed about the
 *                     account from this, in EITHER direction: "nothing connected"
 *                     is as false a report as "your connections broke".
 *
 * `Connection[] | null` could not express this, which is how /connections came to
 * tell a brand-new account that Sahoda "couldn't check your connections" and
 * /settings/integrations still said "Couldn't read your connections just now —
 * reload to try again" for the same non-failure.
 */
export type ConnectionsRead =
  | { status: 'ok'; connections: Connection[] }
  | { status: 'no-workspace' }
  | { status: 'unreadable' }

export async function readConnections(): Promise<ConnectionsRead> {
  const workspace = await activeWorkspaceRead()
  if (workspace.status === 'unreadable') return { status: 'unreadable' }
  if (workspace.status === 'none') return { status: 'no-workspace' }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .eq('workspace_id', workspace.workspace.id)
    .order('created_at', { ascending: true })
  if (error || !data) return { status: 'unreadable' }

  return {
    status: 'ok',
    connections: data
      .map((row) => ConnectionSchema.safeParse(row))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data),
  }
}

/**
 * The lossy view, for callers that only need the rows and already know which of
 * the two nulls they are in. Kept so `/home` — which short-circuits on the
 * wallet's `no-workspace` long before it renders a connection — does not have to
 * re-decide a question it has already answered.
 */
export async function listConnections(): Promise<Connection[] | null> {
  const read = await readConnections()
  return read.status === 'ok' ? read.connections : null
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
export type ConnectedChannelsRead =
  { status: 'ok'; channels: Set<Channel> } | { status: 'no-workspace' } | { status: 'unreadable' }

/**
 * `Set<Channel>` alone could not say "we did not find out", so an unreadable read
 * arrived at `ConnectFirstNote` as an EMPTY SET and /posts, /planner and the post
 * detail all told the writer "Connect a channel to post for real" — a claim about
 * their account made from a question that never got an answer. The banner then
 * points at /connections, which by now says something different again.
 */
export async function readConnectedChannels(): Promise<ConnectedChannelsRead> {
  const read = await readConnections()
  if (read.status !== 'ok') return read
  return {
    status: 'ok',
    channels: new Set(
      read.connections
        .filter((connection) => connection.status === 'active')
        .map((connection) => connection.platform)
        .filter((platform): platform is Channel => CHANNEL_SET.has(platform as Channel)),
    ),
  }
}

/**
 * The lossy view. Correct ONLY where an empty set and an unknown one lead to the
 * same behaviour — the composer offers every channel either way and refuses at
 * publish, which is a gate rather than a claim.
 */
export async function listConnectedChannels(): Promise<Set<Channel>> {
  const read = await readConnectedChannels()
  return read.status === 'ok' ? read.channels : new Set()
}

/** ConnectionPlatform is wider than Channel — a platform we cannot compose for is not one. */
const CHANNEL_SET: ReadonlySet<Channel> = new Set(ChannelSchema.options)

/**
 * The identity of one connection, matching `upsert_zernio_connection`'s conflict
 * target `(workspace_id, platform, external_account ->> 'id')`.
 *
 * Derived from the same tuple the database upserts on, because the whole point of
 * the caller's partition is "would this write CREATE a row or UPDATE one" — and any
 * key that disagrees with the conflict target answers a different question. Keying
 * on `profileId` in particular would collapse every account under one Zernio profile
 * into a single slot, which is most of a workspace's channels.
 */
export const connectionKey = (platform: string, accountId: string): string =>
  `${platform}:${accountId}`

export interface ConnectionSlots {
  /** Every connection row for the workspace — this is the `channels` usage. */
  count: number
  /** `connectionKey` for each existing row. */
  keys: ReadonlySet<string>
}

/**
 * What this workspace already has connected, for the entitlements gate.
 *
 * `null` means COULD NOT READ. A caller must fail closed on it rather than treat it
 * as an empty workspace: without this read there is no way to tell a REFRESH of an
 * existing account (consumes no allowance) from a NEW one (does), and guessing wrong
 * in the permissive direction is exactly the unbounded-channels hole this closes.
 *
 * Counts every row regardless of `status`. An `expired` or `revoked` connection is
 * still an account occupying a slot — it can be reconnected without a new grant, and
 * excluding it would let a workspace hold unlimited channels by letting them lapse.
 *
 * Takes `workspaceId` explicitly rather than reading the active-workspace cache: the
 * OAuth return route derives the workspace from the session itself and must count
 * against THAT one, not against whatever cookie happens to be set.
 */
export async function readConnectionSlots(workspaceId: string): Promise<ConnectionSlots | null> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('connections')
    .select('platform, external_account')
    .eq('workspace_id', workspaceId)
  if (error || !data) return null

  const keys = new Set<string>()
  for (const row of data) {
    const platform = row.platform as string | null
    const accountId = (row.external_account as { id?: unknown } | null)?.id
    if (typeof platform === 'string' && typeof accountId === 'string') {
      keys.add(connectionKey(platform, accountId))
    }
  }

  // `count` is the ROW count, not `keys.size`. A row whose external_account is
  // malformed still occupies a slot, and dropping it from the count would hand the
  // workspace a free channel for every unparseable row it holds.
  return { count: data.length, keys }
}
