import { CardEmpty, EmptyState } from '@/components/empty-state'
import Link from 'next/link'
import { MessagesSquare } from 'lucide-react'

import { FailedAccounts } from '@/components/inbox/surface-notice'
import { PaneScroll } from '@/components/inbox/inbox-panes'
import { buttonVariants } from '@/components/ui/button'
import type { InboxEmptiness } from '@/lib/inbox/emptiness'

/**
 * The thread pane on /inbox, where nothing is open yet.
 *
 * ── WHY THE EXPLANATION LIVES HERE AND NOWHERE ELSE ──────────────────────────
 * With no connected accounts there are no conversations, which is what every
 * new workspace sees. Three panes each announcing "nothing" reads as a broken
 * screen, so the emptiness is stated exactly ONCE — in the widest pane, where
 * there is room for the reason and the remedy — while the list pane keeps its
 * header and a single quiet line.
 *
 * The reason is NOT written here. It comes from `InboxEmptiness`, which already
 * distinguishes "we never asked" from "we asked and got nothing" from "we could
 * not ask" — six states with six different remedies. Re-describing emptiness in
 * this component would be a seventh account of it, free to disagree with the
 * other six.
 *
 * Two shapes, because they are two different sentences:
 *   nothing to open   the reason + the action that changes it
 *   nothing selected  a list exists; pick from it
 */
/**
 * The states where "Connect a channel" is a remedy that actually works.
 *
 * `never_connected` — nothing is connected yet. `unresolved` — something is, and
 * the provider recognised none of it, so reconnecting is the fix. Every other
 * state is ours, and sending the customer to the connect flow would blame them
 * for it.
 */
const CONNECT_FIXES_IT: ReadonlySet<InboxEmptiness['state']> = new Set([
  'never_connected',
  'unresolved',
])

export function ThreadPlaceholder({
  emptiness,
  hasConversations,
  selectLine = 'Pick one from the list to read it and reply.',
}: {
  emptiness: InboxEmptiness
  hasConversations: boolean
  /** What "nothing selected" means on THIS surface — a post, a review, a thread. */
  selectLine?: string
}) {
  return (
    <PaneScroll className="grid place-items-center p-6">
      {hasConversations ? (
        /* "Nothing selected" is NOT an empty state and it used to be dressed as
           one — the same 44px brand-washed marker tile as the state below. It
           carries no remedy and needs none: the list is right there, and the
           answer is to pick from it. Loud has to mean something, so it is kept
           for the one state on this screen that has an action (docs/26 §4.1). */
        <CardEmpty body={selectLine} />
      ) : (
        /* The primitive, not a hand-built copy of it. This block reproduced
           EmptyState's markup — the tile, the heading, the body, the action —
           which is precisely the "same question answered independently on every
           screen" that docs/27 §4 diagnoses. The classifier's own words are
           kept verbatim: its headline and body are written per state and are
           the only account of why this is empty. */
        <div data-surface-state={emptiness.state}>
          <EmptyState
            icon={MessagesSquare}
            title={emptiness.headline}
            body={emptiness.body}
            /* One action, and only when connecting is actually the remedy.
               Telling someone to connect a channel when the real problem is that
               we could not reach the provider sends them to fix something that is
               not broken.

               `unresolved` is in that set and was dropped from it at the
               three-pane rework: it means we HOLD an account and the provider
               recognised none of them, so reconnecting is precisely the fix. The
               product's rule is never to offer a remedy that cannot work, and
               withholding one that can is the same defect facing the other way.
               Restored 2026-09-04, caught by retargeting the deleted
               `SurfaceNotice`'s tests onto this component. */
            action={
              CONNECT_FIXES_IT.has(emptiness.state) ? (
                <Link href="/connections" className={buttonVariants({ variant: 'primary' })}>
                  Connect a channel
                </Link>
              ) : undefined
            }
          />
          {/* Which accounts did not answer. Attached to `could_not_ask` by the
              classifier and rendered nowhere between the rework and 2026-09-04,
              so "we asked and got no answer" could not say who. */}
          <FailedAccounts state={emptiness} className="mt-3 justify-center" />
        </div>
      )}
    </PaneScroll>
  )
}
