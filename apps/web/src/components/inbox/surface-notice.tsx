import type { InboxEmptiness } from '@/lib/inbox/emptiness'

import { cn } from '@/lib/utils'

/**
 * The banner that sits ABOVE a real list when the view is incomplete.
 *
 * ── WHAT LEFT THIS FILE, AND WHY ─────────────────────────────────────────────
 * `SurfaceNotice` used to live here too: the full-page treatment for when there
 * was no list to show at all. It went on 2026-09-04, superseded by
 * `thread-placeholder.tsx`'s `ThreadPlaceholder`, which renders the same
 * `EmptyState` from the same `InboxEmptiness` inside the three-pane shell.
 *
 * It had already been unreachable for a fortnight. All five inbox routes
 * rendered it until the three-pane rework, and `inbox/page.tsx` records why it
 * stopped: blanking the whole screen "was right for a single-pane list… In three
 * panes it is wrong: blanking the screen would also remove the list pane's
 * header and the layout itself." So it sat exported, tested and mounted nowhere
 * — which is exactly what `scripts/lib/unmounted-components.test.mjs` now
 * refuses, and how this was found.
 *
 * ── THE DISTINCTION THIS FILE STILL CARRIES ──────────────────────────────────
 * `partial` and `unknown` are the two states where rows DID arrive and the user
 * must not read a subset as the whole. Every other state means there is no list
 * at all, and saying so is the placeholder's job now, not this one's.
 *
 * `role="status"` rather than `role="alert"`: this is information about the
 * list, not an interruption, and an alert on every partial refresh would be
 * noise.
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
 * Names the platform and account so the failure is actionable. The upstream
 * `error` string is dropped upstream of here (in @sahoda/shared) because it can
 * carry an auth header fragment, and this list renders in the browser.
 *
 * Exported because `SurfaceBanner` is not the only place it belongs.
 * `classifyInboxResult` also attaches `failed` to `could_not_ask`
 * (`lib/inbox/emptiness.ts`), and the banner early-returns on that state — so
 * from the three-pane rework until 2026-09-04, a "we asked and got no answer"
 * named none of the accounts that did not answer, on any screen. It is rendered
 * by `ThreadPlaceholder` again now. The gap was found by retargeting the deleted
 * component's tests rather than dropping them.
 */
export function FailedAccounts({
  state,
  className,
}: {
  state: InboxEmptiness
  className?: string
}) {
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
