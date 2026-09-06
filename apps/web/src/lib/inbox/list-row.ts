import type { ZernioConversation } from '@sahoda/publishing'

/**
 * One row of an inbox list, from EITHER half of the read.
 *
 * ── WHY A WIDER TYPE AND NOT A SECOND ONE ────────────────────────────────────
 * The list is a merge: rows the webhook receiver filed into `inbox_threads` and
 * rows the live Zernio read supplied. They render identically and must sort into
 * one order, so they are one type — with the two facts only a STORED row can
 * state marked optional, rather than a union the row builders would have to
 * discriminate in the middle of JSX.
 *
 * Both extra fields are `undefined` on a live row and that is a measurement, not a
 * placeholder: Zernio does not tell us our own row id, and its `unreadCount` is a
 * count the store cannot take.
 */
export interface InboxListRow extends ZernioConversation {
  /**
   * `inbox_threads.id` — our own row id, present only on a stored row.
   *
   * It is what makes a thread openable when no connected Zernio account can
   * address it. Before this existed such a row rendered as a dead paragraph.
   */
  storedThreadId?: string
  /**
   * The newest STORED message on this thread came from the customer.
   *
   * Not a count and never rendered as one. `unreadCount` is Zernio's, and the
   * store has no read state to count — what it can say is which side spoke last,
   * which is the question the shop owner is actually asking of the list.
   * `undefined` means the question was not asked (a live row, or a store read
   * that could not reach that far), never "no".
   */
  needsReply?: boolean
}
