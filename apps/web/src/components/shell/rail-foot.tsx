import { currentUser } from '@clerk/nextjs/server'

import { SkeletonBar } from '@/components/skeleton'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'

import { NotYet, Unreadable } from '@/components/design-system/absence-row'
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
 * Deliberately NOT 0 when the read fails. "We could not read it" and "you have
 * none" are different claims and only one of them is true — the same rule
 * CreditChip follows. Returns null so the caller renders the `Unreadable` MARK
 * rather than a dash, because the mark carries an accessible name and a dash
 * does not.
 */
function creditsText(balance: BalanceRead): string | null {
  if (balance.status === 'ok') return balance.balance.available.toLocaleString('en-IN')
  return null
}

/**
 * The label row under the credits figure — ONE definition, rendered by both the
 * real foot and its skeleton.
 *
 * It started as a copy inside `RailFootSkeleton`, which the design lint caught:
 * `scripts/design/design-lint.mjs` ratchets hand-written font sizes per file, and
 * duplicating two `text-[12px]` labels took rail-foot.tsx from its baseline of 6 to
 * 8. The lint was right about more than the count — a skeleton that copies the
 * markup it stands in for is a second place for the geometry to drift, and the
 * whole point of this placeholder is that it is exactly the size of the thing that
 * replaces it.
 *
 * Neither label waits on anything, so both are rendered for real in both states:
 * replacing a word the reader could already have read with a grey rectangle makes
 * the page slower to understand while making it look busier. `Usage` therefore
 * also works as a link before the balance has arrived.
 */
function CreditsFootRow() {
  return (
    <div className="mt-1.5 flex items-center justify-between">
      <span className="text-[12px] text-muted">Credits left</span>
      <Link
        href="/wallet"
        // Ink with an underline, not accent: #ff6600 on the rail ground is
        // 2.94:1 (tokens.css), and rail-collapse.spec.ts measured exactly that
        // here (run 34020306051). The underline is the link signal now.
        className="rounded-sm text-[12px] font-semibold text-ink underline decoration-line underline-offset-2 transition-micro hover:decoration-ink"
      >
        Usage
      </Link>
    </div>
  )
}

export async function RailFoot() {
  const [user, workspacesRead, activeSlug, balance] = await Promise.all([
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
    soft<BalanceRead>('available_credits', readBalance, { status: 'unreadable' }),
  ])
  const workspaces = workspacesRead.value

  const credits = creditsText(balance)
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
      {/* Credits. Dropped when the rail collapses, matching the reference.
          There is no "of —" here any more: the quantity has no denominator, so
          per docs/26 §4 the slot does not exist rather than being filled. */}
      <div className="px-3 pt-3 pb-2 rail-min:hidden">
        <div className="flex min-h-[19px] items-baseline gap-1.5">
          {credits === null ? (
            noWorkspaceYet ? (
              <NotYet what="Your credit balance" />
            ) : (
              <Unreadable what="Your credit balance" />
            )
          ) : (
            <span className="num text-[19px] leading-none font-[650] tracking-[-0.02em]">
              {credits}
            </span>
          )}
        </div>
        <CreditsFootRow />
      </div>

      {/* Who you are signed in as. The one part that survives the collapse. */}
      <Link
        href="/settings/profile"
        data-guide="nav.identity"
        className="flex items-center gap-2 px-3 py-2.5 transition-micro hover:bg-s2 rail-min:justify-center rail-min:px-0"
      >
        <span
          aria-hidden
          // `text-ink`, not `text-accent`: MEASURED run 34012814133, the
          // collapsed rail in dark read these initials at 2.75:1 against the
          // wash, the faintest label in the shell. The wash is a 6% tint of the
          // rail, so ink on it clears 4.5:1 in both themes; accent on it does not.
          className="grid size-[26px] flex-none place-items-center rounded-pill bg-brand-wash text-[11px] font-bold text-ink"
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
      <div className="px-3 pt-3 pb-2 rail-min:hidden">
        <div className="flex min-h-[19px] items-baseline gap-1.5">
          <SkeletonBar className="h-[19px] w-16" />
        </div>
        <CreditsFootRow />
      </div>
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
