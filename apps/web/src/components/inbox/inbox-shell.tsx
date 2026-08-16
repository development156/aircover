import { ContextPane } from '@/components/inbox/context-pane'
import { InboxPane, InboxPanes } from '@/components/inbox/inbox-panes'
import { SurfaceBanner } from '@/components/inbox/surface-notice'
import type { InboxEmptiness } from '@/lib/inbox/emptiness'

/**
 * The one frame every inbox surface wears.
 *
 * ── WHY ONE SHELL AND NOT FOUR PAGES ─────────────────────────────────────────
 * The reference has a single inbox structure and no separate comments or reviews
 * screen. Messages, comments and reviews are three READINGS of the same inbox,
 * so giving each its own frame — as this app did — makes them look like three
 * different products that happen to share a tab bar. One shell, three lists.
 *
 * ── WHERE EMPTINESS IS STATED ────────────────────────────────────────────────
 * Once, in the thread pane, from `InboxEmptiness`. Never once per pane: three
 * columns each announcing "nothing" is how an empty screen comes to read as a
 * broken one. The list pane gets a single quiet line instead.
 *
 * ── THE MOBILE SWAP ──────────────────────────────────────────────────────────
 * Below 700px exactly one of list/thread survives. `mobileShow` is decided by
 * the caller because only it knows whether something is open: a detail route
 * shows the THREAD (you tapped a row to read it), a list route shows the LIST
 * when it has rows, and the THREAD when it does not — because that is the pane
 * carrying the reason, and hiding it on a phone leaves a blank column and no
 * explanation.
 */
export function InboxShell({
  emptiness,
  list,
  thread,
  mobileShow,
}: {
  /** Drives the banner only. The thread pane owns the empty-state copy. */
  emptiness: InboxEmptiness
  list: React.ReactNode
  thread: React.ReactNode
  mobileShow: 'list' | 'thread'
}) {
  return (
    <div className="space-y-3">
      {/* `partial` and `unknown` warn ABOVE the panes: they mean the list is
          real but incomplete, which no empty state can express — an empty state
          would claim there is nothing, and there is something. */}
      <SurfaceBanner state={emptiness} />

      <InboxPanes mobileShow={mobileShow}>
        <InboxPane kind="list">{list}</InboxPane>
        <InboxPane kind="thread">{thread}</InboxPane>
        <InboxPane kind="context">
          <ContextPane />
        </InboxPane>
      </InboxPanes>
    </div>
  )
}
