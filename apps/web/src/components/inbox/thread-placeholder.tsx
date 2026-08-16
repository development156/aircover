import Link from 'next/link'
import { MessagesSquare } from 'lucide-react'

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
      <div className="max-w-[380px] text-center">
        <span
          aria-hidden
          className="mx-auto mb-3 grid size-11 place-items-center rounded-md bg-brand-wash text-accent shadow-[inset_0_0_0_1px_var(--brand-lift)]"
        >
          <MessagesSquare size={21} strokeWidth={1.7} />
        </span>

        {hasConversations ? (
          <>
            <h2 className="text-[14px] font-semibold">Nothing selected</h2>
            <p className="mt-1 text-[13px] text-muted">{selectLine}</p>
          </>
        ) : (
          <>
            {/* The classifier's own words — its headline and body are already
                written per state and are the only account of why this is
                empty. */}
            <h2 className="text-[14px] font-semibold">{emptiness.headline}</h2>
            <p className="mt-1 text-[13px] text-muted">{emptiness.body}</p>
            {/* One action, and only when connecting is actually the remedy.
                Telling someone to connect a channel when the real problem is
                that we could not reach the provider sends them to fix
                something that is not broken. */}
            {emptiness.state === 'never_connected' ? (
              <Link
                href="/connections"
                className={`${buttonVariants({ variant: 'primary' })} mt-4`}
              >
                Connect a channel
              </Link>
            ) : null}
          </>
        )}
      </div>
    </PaneScroll>
  )
}
