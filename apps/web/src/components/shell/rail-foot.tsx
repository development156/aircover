import { currentUser } from '@clerk/nextjs/server'

import { SkeletonBar } from '@/components/skeleton'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { ArrowRight, Sparkles } from 'lucide-react'

import { NotYet, Unreadable } from '@/components/design-system/absence-row'
import { getWorkspaceRole } from '@/lib/workspace-role'
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
 * That reasoning was right and the conclusion drawn from it was wrong. Omitting
 * the ratio BAR was correct — a bar encodes a fraction, and an unfilled track is
 * a 0% claim, not a neutral container. But the slot kept the word "of" and an em
 * dash, which invents the same fraction in words: `100 of —` renders a
 * numerator, a relationship and a missing denominator, on every screen in the
 * product. docs/26 §4 rules the third absence state renders NOTHING. Three lanes
 * reported this and none owned it; it is deleted here.
 *
 * ── THE OTHER TWO DASHES IN THIS FILE ────────────────────────────────────────
 * They are a different state and they stay — as MARKS, not as dashes. An
 * unreadable balance and an unreadable role are both "we asked and got nothing
 * back" (docs/26 §4), which is a real claim worth rendering and is NOT the same
 * claim as "you have none". A bare `—` said it without an accessible name, so a
 * screen reader heard silence where a sighted user saw a gap. `Unreadable`
 * carries the name.
 *
 * ── THIS NUMBER DOES NOT COUNT UP ────────────────────────────────────────────
 * It is the authoritative live balance (docs/26 §8.1). `count-up.guard.test.ts`
 * fails if this file ever imports CountUp.
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

/**
 * WHAT REPLACED THE CREDIT METER.
 *
 * Founder's ruling: credits live in the wallet. The meter that stood here put a
 * balance on all 59 routes, and a number you cannot act on from where you are
 * standing is a number that trains you to stop reading it.
 *
 * The slot is not left empty. It carries the one thing that makes every other
 * screen in the product better and that most workspaces never finish — teaching
 * Sahoda the brand. `brain` is the only nudge in the shell, it names its own
 * benefit, and it goes away with the rail when the rail collapses. It states no
 * count: "4 of 15 signals" would be a figure this component does not read, and
 * the Brand Brain card on /home already carries the real one.
 */
function RailNudge() {
  return (
    <div className="px-3 pt-3 pb-1 rail-min:hidden">
      <div className="surface-ring rounded-md bg-brand-wash p-3">
        <p className="flex items-center gap-1.5 type-sm font-[650] text-ink">
          <Sparkles size={14} strokeWidth={2} aria-hidden className="flex-none text-accent" />
          Let Sahoda do more
        </p>
        <p className="mt-1 type-meta text-muted">
          Teach it your brand and it writes more like you.
        </p>
        <Link
          href="/brain"
          className="mt-2.5 inline-flex items-center gap-1 rounded-pill px-2.5 py-1 type-meta font-[650] text-accent transition-micro surface-ring-firm hover:gap-1.5"
        >
          Open Brand Brain
          <ArrowRight aria-hidden className="size-3" />
        </Link>
      </div>
    </div>
  )
}

export async function RailFoot() {
  const [user, workspacesRead, activeSlug] = await Promise.all([
    soft('clerk_user', currentUser, null),
    /**
     * Read with its failure VISIBLE, not swallowed.
     *
     * `soft` returns the fallback on a throw, so a failed workspace read and an
     * account that genuinely has no workspace both arrive as `[]`. Those are two
     * different claims — "we asked and got nothing back" versus "there is
     * nothing yet" — and picking the wrong one is how the rail came to announce
     * a failure to a brand-new account. Anything that cannot tell them apart is
     * not entitled to make either claim.
     */
    (async () => {
      try {
        return { value: await listWorkspaces(), failed: false }
      } catch (error) {
        Sentry.captureException(error, { tags: { shell_read: 'workspaces' } })
        return { value: [] as Awaited<ReturnType<typeof listWorkspaces>>, failed: true }
      }
    })(),
    soft('active_workspace_slug', getActiveWorkspaceSlug, null as string | null),
    // The balance read went with the meter. It ran on every page load of every
    // route in the product for a figure nobody could act on from here.
  ])
  const workspaces = workspacesRead.value

  const active = resolveActiveWorkspace(workspaces, activeSlug)
  /**
   * True only when we positively know there is no workspace: the read SUCCEEDED
   * and returned nothing. A failed read stays `Unreadable`, which is the honest
   * claim there.
   */
  const noWorkspaceYet = !workspacesRead.failed && workspaces.length === 0
  const role = active ? await soft('workspace_role', () => getWorkspaceRole(active.id), null) : null

  const name =
    user?.fullName?.trim() ||
    user?.primaryEmailAddress?.emailAddress ||
    user?.username ||
    'Signed in'
  // An unreadable role is a MARK, never a guess at the friendliest one.
  // getWorkspaceRole already returns null on any doubt.
  const roleLabel = role ? (ROLE_LABEL[role] ?? role) : null

  return (
    <div className="flex-none border-t border-line-soft">
      <RailNudge />

      {/* Who you are signed in as. The one part that survives the collapse. */}
      <Link
        href="/settings/profile"
        data-guide="nav.identity"
        className="flex items-center gap-2 px-3 py-2.5 transition-micro hover:bg-s2 rail-min:justify-center rail-min:px-0"
      >
        <span
          aria-hidden
          className="grid size-[26px] flex-none place-items-center rounded-pill bg-brand-wash text-[11px] font-bold text-accent"
        >
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1 rail-min:hidden">
          <span className="block truncate text-[13px] font-semibold">{name}</span>
          <span className="block truncate text-[11px] text-muted">
            {roleLabel ??
              (noWorkspaceYet ? (
                <NotYet what="Your role" />
              ) : (
                <Unreadable what="Your role in this workspace" />
              ))}
          </span>
        </span>
      </Link>
    </div>
  )
}

/**
 * The shape `RailFoot` leaves behind while it streams in.
 *
 * ── SHAPED LIKE THE CONTENT, NOT A GREY BLOCK ────────────────────────────────
 * Every box is the size of the thing that replaces it: the credits number is
 * 19px tall because that is the type size it becomes, the avatar is the same
 * 26px circle, and the two identity lines are 13px and 11px. So the rail does
 * not resize when the real values land — a skeleton whose geometry differs from
 * its content is a layout shift with extra steps.
 *
 * The two STATIC labels — "Credits left" and "Usage" — are rendered for real
 * rather than skeletonised. They are not waiting on anything, and replacing a
 * word you could already have read with a grey rectangle makes the page slower
 * to understand while making it look busier.
 *
 * `aria-hidden` on the placeholder geometry with one polite live region: a
 * screen reader should hear "loading your account" once, not five unlabelled
 * boxes. `animate-pulse` is left to the shared token layer, which already
 * respects prefers-reduced-motion.
 */
export function RailFootSkeleton() {
  return (
    <div className="flex-none border-t border-line-soft">
      {/* The nudge waits on NOTHING — no read feeds it — so the skeleton
          renders the real thing rather than a grey rectangle standing in for a
          sentence that is already known. */}
      <RailNudge />
      <div className="flex items-center gap-2 px-3 py-2.5 rail-min:justify-center rail-min:px-0">
        <span aria-hidden className="size-[26px] flex-none rounded-pill bg-s2" />
        <span className="min-w-0 flex-1 rail-min:hidden">
          <SkeletonBar className="h-[13px] w-24" />
          <SkeletonBar className="mt-1 h-[11px] w-16" />
        </span>
      </div>
      <span className="sr-only" role="status">
        Loading your account
      </span>
    </div>
  )
}
