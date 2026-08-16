import { currentUser } from '@clerk/nextjs/server'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'

import { getWorkspaceRole } from '@/lib/workspace-role'
import { readBalance, type BalanceRead } from '@/lib/wallet/read'
import { getActiveWorkspaceSlug, listWorkspaces, resolveActiveWorkspace } from '@/lib/workspaces'

/**
 * The rail's docked bottom block (reference `.side__foot`).
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────
 * The reference sidebar has THREE blocks: brand, nav, and this. The app shipped
 * two. Everything the foot carries — how many credits are left, who you are
 * signed in as, what you are allowed to do here — was reachable only by leaving
 * the page you were on, so the shell never answered "who am I and what do I
 * have" without a navigation.
 *
 * ── WHAT IT SHOWS WHEN THE RAIL COLLAPSES ────────────────────────────────────
 * MEASURED from the reference at 1024px: `.side__foot` survives at 72px and
 * keeps ONLY the user block; the credits meter drops. That is the behaviour
 * copied here rather than invented — a 64px rail has no room for a number, its
 * label and a link, and stacking them vertically would push the nav off-screen.
 *
 * ── THE DENOMINATOR THAT DOES NOT EXIST ──────────────────────────────────────
 * The reference reads "130 of 300 · Credits left", a monthly allowance being
 * drawn down. Sahoda's wallet is not that shape: credits are GRANTED and TOPPED
 * UP, and `available` is a balance, not a remainder. `PLAN_CATALOG.monthlyCredits`
 * exists, but pairing the two would invent a relationship the ledger does not
 * have — a Free workspace that tops up 500 credits would render "600 of 100".
 *
 * So the numerator is real and the denominator is an em dash, and the ratio BAR
 * is omitted entirely rather than drawn empty. A bar encodes a fraction; with no
 * denominator there is no fraction, and an unfilled track is not a neutral
 * container, it is a 0% claim.
 */

/** One read, degraded rather than thrown — the rail renders on every page. */
async function soft<T>(label: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read()
  } catch (error) {
    Sentry.captureException(error, { tags: { shell_read: label } })
    return fallback
  }
}

/** Initials for the avatar, from whatever name we actually have. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Workspace owner',
  editor: 'Editor',
  approver: 'Approver',
  viewer: 'Viewer',
}

function creditsText(balance: BalanceRead): string {
  if (balance.status === 'ok') return balance.balance.available.toLocaleString('en-IN')
  // Deliberately NOT 0. "We could not read it" and "you have none" are different
  // claims, and only one of them is true — the same rule CreditChip follows.
  return '—'
}

export async function RailFoot() {
  const [user, workspaces, activeSlug, balance] = await Promise.all([
    soft('clerk_user', currentUser, null),
    soft('workspaces', listWorkspaces, [] as Awaited<ReturnType<typeof listWorkspaces>>),
    soft('active_workspace_slug', getActiveWorkspaceSlug, null as string | null),
    soft<BalanceRead>('available_credits', readBalance, { status: 'unreadable' }),
  ])

  const active = resolveActiveWorkspace(workspaces, activeSlug)
  const role = active ? await soft('workspace_role', () => getWorkspaceRole(active.id), null) : null

  const name =
    user?.fullName?.trim() ||
    user?.primaryEmailAddress?.emailAddress ||
    user?.username ||
    'Signed in'
  // An unreadable role is an em dash, never a guess at the friendliest one.
  // getWorkspaceRole already returns null on any doubt.
  const roleLabel = role ? (ROLE_LABEL[role] ?? role) : '—'

  return (
    <div className="flex-none border-t border-line-soft">
      {/* Credits. Dropped when the rail collapses, matching the reference. */}
      <div className="px-3 pt-3 pb-2 max-wide:hidden">
        <div className="flex items-baseline gap-1.5">
          <span className="num text-[19px] leading-none font-[650] tracking-[-0.02em]">
            {creditsText(balance)}
          </span>
          <span className="text-[12px] text-muted">of &mdash;</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[12px] text-muted">Credits left</span>
          <Link
            href="/wallet"
            className="rounded-sm text-[12px] font-semibold text-accent transition-micro hover:underline"
          >
            Usage
          </Link>
        </div>
      </div>

      {/* Who you are signed in as. The one part that survives the collapse. */}
      <Link
        href="/settings/profile"
        data-guide="nav.identity"
        className="flex items-center gap-2 px-3 py-2.5 transition-micro hover:bg-s2 max-wide:justify-center max-wide:px-0"
      >
        <span
          aria-hidden
          className="grid size-[26px] flex-none place-items-center rounded-full bg-brand-wash text-[11px] font-bold text-accent"
        >
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1 max-wide:hidden">
          <span className="block truncate text-[13px] font-semibold">{name}</span>
          <span className="block truncate text-[11px] text-muted">{roleLabel}</span>
        </span>
      </Link>
    </div>
  )
}
