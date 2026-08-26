import 'server-only'

import { LeadSchema, type Lead, type LeadStatus } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

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
 */

/** How many leads one screen shows. Exported so the screen can state its window. */
export const LEADS_LIMIT = 200

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
  /**
   * The raw platform key an inbox lead arrived on — `instagram`, `whatsapp` — or
   * null for a site form and for a row whose source records nothing.
   *
   * Separate from `from`, which is a SENTENCE. A card that shows a platform mark
   * needs the key, and parsing it back out of "Your inbox · instagram" would be
   * a second decoder that could disagree with the first.
   *
   * Null is a real answer: a site form has no platform, and neither does a lead
   * that predates both doors. Neither gets a mark rather than being assigned one.
   */
  readonly platform: string | null
}

export type LeadsRead =
  | { status: 'ok'; leads: readonly LeadView[] }
  | { status: 'no-workspace' }
  | { status: 'unreadable' }

/**
 * The words for a lead's origin.
 *
 * Read from `source.kind`, which the two writers set. A row whose source says
 * nothing reads as "not recorded" rather than being assigned to a door it may
 * not have come through — every lead in this table predates both doors, so a
 * default of "your site" would be a guess presented as a fact.
 */
function fromOf(source: unknown): string {
  if (typeof source !== 'object' || source === null) return 'Not recorded'
  const kind = (source as { kind?: unknown }).kind
  if (kind === 'site_form') return 'Your site'
  if (kind === 'inbox') {
    const channel = (source as { channel?: unknown }).channel
    return typeof channel === 'string' ? `Your inbox · ${channel}` : 'Your inbox'
  }
  return 'Not recorded'
}

/**
 * The platform key, or null when the row does not carry one.
 *
 * Reads the same `source` object `fromOf` does, and deliberately applies the
 * same rule: only an `inbox` source has a channel. A `site_form` lead has no
 * platform and gets null rather than a default, for the reason `fromOf`'s own
 * header gives — every lead in this table predates both doors.
 */
function platformOf(source: unknown): string | null {
  if (typeof source !== 'object' || source === null) return null
  if ((source as { kind?: unknown }).kind !== 'inbox') return null
  const channel = (source as { channel?: unknown }).channel
  return typeof channel === 'string' && channel.trim() !== '' ? channel : null
}

function toView(lead: Lead): LeadView {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    message: lead.message,
    status: lead.status,
    readAt: lead.read_at,
    createdAt: lead.created_at,
    from: fromOf(lead.source),
    platform: platformOf(lead.source),
  }
}

export async function readLeads(): Promise<LeadsRead> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'none') return { status: 'no-workspace' }
    if (workspace.status !== 'ok') return { status: 'unreadable' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('workspace_id', workspace.workspace.id)
      .order('created_at', { ascending: false })
      .limit(LEADS_LIMIT)

    // No `?? []`. An unreadable list rendered as an empty one would tell a shop
    // owner nobody has enquired, which is a claim about their business made out
    // of a failed request.
    if (error) return { status: 'unreadable' }

    const leads = (data ?? []).flatMap((row) => {
      const parsed = LeadSchema.safeParse(row)
      return parsed.success ? [toView(parsed.data)] : []
    })
    return { status: 'ok', leads }
  } catch {
    return { status: 'unreadable' }
  }
}
