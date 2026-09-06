import { NextResponse, type NextRequest } from 'next/server'

import { scopedAccount } from '@/lib/inbox/read'

export const dynamic = 'force-dynamic'

/**
 * ONE ATTACHMENT, RESOLVED TO A URL THAT WORKS NOW, then a redirect to it.
 *
 * ── THE TENANCY GATE IS `scopedAccount` ──────────────────────────────────────
 * The query names a Zernio account id, and a determined caller can name any.
 * `scopedAccount` resolves it against the SIGNED-IN workspace's connections and
 * answers `not_found` for one that is not there, so this route can only ever
 * ask Zernio about media on an account the caller already has in their inbox.
 * Nothing here trusts the ids beyond passing them to Zernio, which owns them.
 *
 * ── WHY A REDIRECT AND NOT A STREAM ──────────────────────────────────────────
 * Zernio's own endpoint answers 302 to the media by default, for exactly this
 * use: an `<img src>` on a browser session. But a browser cannot carry our API
 * key, so this route makes the JSON call with the key and then does the
 * redirect itself. Bytes never pass through a function; `no-store` because the
 * url it redirects to is signed and short-lived.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const q = request.nextUrl.searchParams
  const accountId = q.get('account') ?? ''
  const conversationId = q.get('conversation') ?? ''
  const messageId = q.get('message') ?? ''
  const index = Number(q.get('index'))
  if (!accountId || !conversationId || !messageId || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: 'missing_field' }, { status: 400 })
  }

  const scoped = await scopedAccount(accountId)
  if (!scoped.ok) {
    return NextResponse.json(
      { error: scoped.failure },
      {
        status: scoped.failure === 'not_found' ? 404 : 503,
        headers: { 'cache-control': 'no-store' },
      },
    )
  }

  const url = await scoped.reads.messageAttachmentUrl(
    scoped.account,
    conversationId,
    messageId,
    index,
  )
  if (url === null) {
    return NextResponse.json(
      { error: 'attachment_unavailable' },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    )
  }
  return NextResponse.redirect(url, { status: 302, headers: { 'cache-control': 'no-store' } })
}
