/**
 * Where an attachment's bytes are fetched from, decided ONCE for both thread routes.
 *
 * ── WHY NOT THE URL ON THE MESSAGE ───────────────────────────────────────────
 * On Instagram and Facebook the `url` is a signed Meta CDN link that expires on
 * Meta's schedule. It works when the message is read and stops working later,
 * which is exactly the failure a person meets in a stored thread: a broken
 * image where a customer's photo was. `/api/inbox/attachment` asks Zernio for a
 * url that works right now, with the message id and the attachment's position,
 * and redirects the browser to it. The message id never expires.
 *
 * The proxy is used whenever the ids to build it exist. A stored row has no
 * Zernio account id (`accountId: ''`), so it falls back to the url it holds,
 * which is stable on every platform except the two Meta ones.
 */
export function attachmentHref(args: {
  accountId: string
  conversationId: string
  messageId: string
  index: number
  url: string
}): string {
  if (args.accountId === '' || args.messageId === '' || args.conversationId === '') return args.url
  const q = new URLSearchParams({
    account: args.accountId,
    conversation: args.conversationId,
    message: args.messageId,
    index: String(args.index),
  })
  return `/api/inbox/attachment?${q.toString()}`
}
