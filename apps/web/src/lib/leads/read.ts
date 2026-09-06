import 'server-only'

import { LeadSchema, type Lead, type LeadStatus } from '@sahoda/shared'

import { connectionPlatformFor, leadOrigin, originWords, type LeadDoor } from '@/lib/leads/origin'
import { received } from '@/lib/leads/received'
import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead, type WorkspaceOption } from '@/lib/workspaces'

/**
 * READING LEADS — under RLS, filtered to the active workspace.
 *
 * `leads` carries member SELECT and UPDATE policies and nothing else: the two
 * writers are `SECURITY DEFINER` functions, so there is no INSERT policy to read
 * around and no DELETE policy at all. These are plain PostgREST selects under
 * the caller's own JWT.
 *
 * The workspace filter is a CORRECTNESS filter and not an authorization one —
 * RLS is the boundary. The member policy admits every workspace the user belongs
 * to, so a second membership would otherwise fold two shops' enquiries into one
 * list, with real people's names and numbers in it.
 *
 * ── EVERY SENTENCE ON A CARD IS BUILT HERE, NOT IN THE CARD ──────────────────
 * The date, the age and the origin line are formatted server-side. Two reasons,
 * and both are measured facts rather than preferences: a relative age computed
 * during a client render disagrees with the server's copy of it (a hydration
 * mismatch React corrects silently), and `components/leads/lead-card.tsx`
 * records a 26.7 kB regression on this route from ONE client-side import. The
 * card renders strings.
 */

/** How many leads one screen shows. Exported so the screen can state its window. */
export const LEADS_LIMIT = 200

/**
 * Whether the conversation an inbox lead came from can be reopened.
 *
 * THREE ANSWERS, NOT TWO. "The account this came through is no longer connected"
 * is a claim about the customer's connections, and it may only be made when the
 * connections were actually read. A read that FAILED says nothing at all — the
 * same rule the list itself follows two paragraphs down.
 */
export type LeadConversation =
  | { readonly state: 'link'; readonly href: string }
  | { readonly state: 'disconnected' }
  | { readonly state: 'none' }

export interface LeadView {
  readonly id: string
  readonly name: string | null
  readonly email: string | null
  readonly phone: string | null
  readonly message: string | null
  readonly status: LeadStatus
  readonly readAt: string | null
  readonly createdAt: string
  /** Where it came from, in the reader's words. Never an invented provenance. */
  readonly from: string
  /** The same, plus the page, the form and the campaign the row recorded. */
  readonly origin: string
  /** Which door the row DECLARES. `unrecorded` is a real answer. */
  readonly door: LeadDoor
  /** "Sun 6 Sept, 3:12 pm", in the workspace's zone. Null if the stamp will not parse. */
  readonly receivedWhen: string | null
  /** "2 days ago". Null on the same condition. */
  readonly receivedAge: string | null
  /** Whether the conversation behind an inbox lead can be reopened. */
  readonly conversation: LeadConversation
  /**
   * The raw platform key an inbox lead arrived on — `instagram`, `whatsapp` — or
   * null for a site form and for a row whose source records nothing.
   *
   * Separate from `from`, which is a SENTENCE. A card that shows a platform mark
   * needs the key, and parsing it back out of "Your inbox · Instagram" would be
   * a second decoder that could disagree with the first.
   *
   * Null is a real answer: a site form has no platform, and neither does a lead
   * that predates both doors. Neither gets a mark rather than being assigned one.
   */
  readonly platform: string | null
}

export type LeadsRead =
  | {
      status: 'ok'
      leads: readonly LeadView[]
      /**
       * Rows the schema refused. Counted rather than dropped in silence: a lead
       * missing from a board is a person nobody rings back, and a screen that
       * shows nine of ten enquiries with no notice is lying by omission.
       */
      unreadable: number
    }
  | { status: 'no-workspace' }
  | { status: 'unreadable' }

/**
 * The accounts this workspace still holds, by the platform key a LEAD carries.
 *
 * `null` means the question could not be answered, which is not the same as "no
 * accounts" — see `LeadConversation`.
 *
 * ── ONE QUERY, NOT ONE PER LEAD ──────────────────────────────────────────────
 * `lib/zernio/scope.ts` has `accountForWorkspace`, and it is the wrong tool here
 * twice over: it needs a `ScopedProfileId` fetched first, and it THROWS when a
 * workspace holds no profile or no account for a platform. Two hundred leads
 * would be two hundred round trips, and one throw would take the whole board
 * down to "could not read your leads" over a link.
 */
async function activeAccountsByChannel(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
): Promise<Map<string, string> | null> {
  const { data, error } = await supabase
    .from('connections')
    .select('platform, external_account, created_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    // The FIRST account connected on a platform is the one a platform-shaped
    // question resolves to. `accountForWorkspace` states the same rule for the
    // same reason: with two accounts there is no single true answer, so the rule
    // is written down rather than left to whichever row Postgres returned.
    .order('created_at', { ascending: true })

  if (error || !data) return null

  const byPlatform = new Map<string, string>()
  for (const row of data as Array<Record<string, unknown>>) {
    const platform = typeof row.platform === 'string' ? row.platform : null
    const account = row.external_account
    const id =
      typeof account === 'object' && account !== null ? (account as { id?: unknown }).id : undefined
    if (platform === null || typeof id !== 'string' || id === '') continue
    if (!byPlatform.has(platform)) byPlatform.set(platform, id)
  }
  return byPlatform
}

function conversationFor(
  channel: string | null,
  conversationRef: string | null,
  accounts: Map<string, string> | null,
): LeadConversation {
  if (channel === null || conversationRef === null) return { state: 'none' }
  // The connections read failed. Nothing may be claimed about them from that.
  if (accounts === null) return { state: 'none' }

  const accountId = accounts.get(connectionPlatformFor(channel))
  if (accountId === undefined) return { state: 'disconnected' }
  // The same two-segment shape `components/inbox/thread-href.ts` builds, and for
  // the same reason: a conversation id is resolvable only WITHIN an account.
  return {
    state: 'link',
    href: `/inbox/threads/${encodeURIComponent(accountId)}/${encodeURIComponent(conversationRef)}`,
  }
}

function toView(
  lead: Lead,
  now: Date,
  zone: string | null,
  accounts: Map<string, string> | null,
): LeadView {
  const origin = leadOrigin(lead.source)
  const when = received(lead.created_at, now, zone)
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    status: lead.status,
    readAt: lead.read_at,
    createdAt: lead.created_at,
    from: origin.from,
    origin: originWords(origin),
    door: origin.door,
    receivedWhen: when.when,
    receivedAge: when.age,
    conversation: conversationFor(origin.channel, origin.conversationRef, accounts),
    platform: origin.channel,
  }
}

export async function readLeads(now: Date = new Date()): Promise<LeadsRead> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'none') return { status: 'no-workspace' }
    if (workspace.status !== 'ok') return { status: 'unreadable' }
    const active: WorkspaceOption = workspace.workspace

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('workspace_id', active.id)
      .order('created_at', { ascending: false })
      .limit(LEADS_LIMIT)

    // No `?? []`. An unreadable list rendered as an empty one would tell a shop
    // owner nobody has enquired, which is a claim about their business made out
    // of a failed request.
    if (error) return { status: 'unreadable' }

    const rows = data ?? []
    const parsed = rows.map((row) => LeadSchema.safeParse(row))
    const kept = parsed.flatMap((result) => (result.success ? [result.data] : []))
    const unreadable = parsed.length - kept.length
    if (unreadable > 0) {
      // The count, never the row: a refused lead still holds a real person's
      // name and number, and this line goes to a log aggregator.
      console.error(`[leads] ${unreadable} of ${parsed.length} rows did not match the schema`)
    }

    // Only asked when something on the board could use the answer. A board of
    // site-form leads pays for no second round trip.
    const needsAccounts = kept.some((lead) => {
      const origin = leadOrigin(lead.source)
      return origin.channel !== null && origin.conversationRef !== null
    })
    const accounts = needsAccounts ? await activeAccountsByChannel(supabase, active.id) : null

    return {
      status: 'ok',
      leads: kept.map((lead) => toView(lead, now, active.timezone, accounts)),
      unreadable,
    }
  } catch {
    return { status: 'unreadable' }
  }
}
