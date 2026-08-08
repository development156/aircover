import type { InboxEmptiness } from '@/lib/inbox/emptiness'
import {
  AlertTriangle,
  Inbox,
  Link2,
  PlugZap,
  PowerOff,
  ShieldQuestion,
  Unplug,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { cn } from '@/lib/utils'

/**
 * One component for every way an inbox list can be short of rows.
 *
 * Deliberately NOT a reviews special case. `meta` rides on `/inbox/conversations` and
 * `/inbox/comments` as well, so all three lists can be short of rows for the same six
 * different reasons, and each reason is a different sentence:
 *
 *   never_connected → we asked nobody. "No reviews" here would be a claim about the
 *                     customer's shop, made from zero evidence.
 *   unresolved      → we hold an account and Zernio queried none of them. Cannot
 *                     resolve, NOT zero — the same distinction `syncStatus: orphaned`
 *                     draws on the analytics side.
 *   not_read        → no Zernio key in this build. Nothing went out. Ours to fix.
 *   could_not_ask   → we asked and got no answer.
 *   unknown         → we could not confirm the view is complete.
 *   empty           → the only case that has earned "nothing yet".
 *
 * `partial` and `ok` render as a banner ABOVE the rows instead — the list is real, but
 * the user must not read a subset as the whole.
 */

const ICONS = {
  never_connected: PlugZap,
  // We hold a connection Zernio did not recognise. A plug icon, like never_connected,
  // would tell the user to connect something they already connected.
  unresolved: Unplug,
  // Our key is missing, not their account. Nothing went out.
  not_read: PowerOff,
  could_not_ask: AlertTriangle,
  unknown: ShieldQuestion,
  empty: Inbox,
  partial: AlertTriangle,
  ok: Inbox,
} satisfies Record<InboxEmptiness['state'], LucideIcon>

/**
 * The states where "Open connections" is the real remedy.
 *
 * `never_connected` → nothing is connected yet. `unresolved` → something is, and Zernio
 * did not recognise it, so reconnecting is exactly the fix.
 */
const CONNECT_ACTION_STATES: ReadonlySet<InboxEmptiness['state']> = new Set([
  'never_connected',
  'unresolved',
])

export interface SurfaceNoticeProps {
  state: InboxEmptiness
  /** Rendered in the empty state only — a banner above a real list gets no CTA. */
  showConnectAction?: boolean
}

/** The full-page treatment, for when there is no list to show. */
export function SurfaceNotice({ state, showConnectAction = true }: SurfaceNoticeProps) {
  return (
    <div data-surface-state={state.state}>
      <EmptyState
        icon={ICONS[state.state]}
        title={state.headline}
        body={state.body}
        action={
          // Only the two states the CUSTOMER can act on get a CTA. `not_read` is our
          // missing key and `could_not_ask` is a refresh — sending either to the connect
          // flow would blame the customer for our failure.
          showConnectAction && CONNECT_ACTION_STATES.has(state.state) ? (
            // A styled Link rather than <Button asChild>: Button always renders a
            // loading-spinner slot beside {children}, so Slot receives two children and
            // throws. Logged for the owner in REQUESTS.md; not fixed here, because a
            // shared control's asChild path deserves its own review.
            <Link
              href="/connections"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              <Link2 size={14} aria-hidden />
              Open connections
            </Link>
          ) : null
        }
      />
      <FailedAccounts state={state} className="mt-3" />
    </div>
  )
}

/**
 * The inline treatment, for when rows DID arrive but the view is incomplete.
 *
 * `role="status"` rather than `role="alert"`: this is information about the list, not
 * an interruption, and an alert on every partial refresh would be noise.
 */
export function SurfaceBanner({ state }: { state: InboxEmptiness }) {
  if (state.state !== 'partial' && state.state !== 'unknown') return null

  return (
    <div
      role="status"
      data-surface-state={state.state}
      className="rounded-card border border-line bg-warn-bg px-4 py-3"
    >
      <p className="text-[14px] font-semibold text-warn">{state.headline}</p>
      <p className="mt-0.5 max-w-[70ch] text-[13px] leading-[20px] text-warn">{state.body}</p>
      <FailedAccounts state={state} className="mt-2" />
    </div>
  )
}

/**
 * Which accounts did not answer.
 *
 * Names the platform and account so the failure is actionable. The upstream `error`
 * string is dropped upstream of here (in @sahoda/shared) because it can carry an auth
 * header fragment, and this list renders in the browser.
 */
function FailedAccounts({ state, className }: { state: InboxEmptiness; className?: string }) {
  if (state.failed.length === 0) return null

  return (
    <ul
      className={cn('flex flex-wrap gap-1.5', className)}
      aria-label="Accounts that did not answer"
    >
      {state.failed.map((f, i) => (
        <li
          key={`${f.platform ?? 'account'}-${f.accountUsername ?? i}`}
          className="rounded-pill bg-s2 px-2.5 py-[3px] text-[12px] leading-[18px] text-muted"
        >
          {f.accountUsername ? `${f.accountUsername} · ` : ''}
          {f.platform ?? 'account'}
          {f.code ? <span className="ml-1 font-mono text-muted tabular-nums">{f.code}</span> : null}
        </li>
      ))}
    </ul>
  )
}
