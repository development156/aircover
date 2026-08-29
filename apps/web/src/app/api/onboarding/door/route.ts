import { auth } from '@clerk/nextjs/server'

import { reportServerError } from '@/lib/observability/report'
import { readDoorStreaming, type Stage } from '@/lib/onboarding/read-door'
import { seedLibraryFromSite } from '@/lib/onboarding/seed-library'
import { readActiveWorkspace } from '@/lib/workspaces'

/**
 * The door, streamed.
 *
 * WHY THIS IS A ROUTE AND NOT A SERVER ACTION. An action returns once, at the
 * end, so anything shown during the wait can only be a guess dressed as
 * progress — a spinner and a timer, with the stage names invented by the client
 * from what it submitted. The read takes ~26s at p50; that is far too long to
 * be honest with a guess.
 *
 * A streamed response can say what is happening AS it happens: the crawl
 * reports the page count it actually found, the free parser reports what it
 * actually yielded, and the OCR escalation announces itself at the moment it is
 * decided. Every line the user reads corresponds to something that has already
 * occurred on the server.
 *
 * NDJSON rather than SSE: the client needs one JSON object per line and nothing
 * SSE adds (no reconnection, no event ids — a re-read is a new request).
 */

export const runtime = 'nodejs'
/** The read can take ~45s with a slow site; the platform default would cut it. */
export const maxDuration = 120

export async function POST(request: Request): Promise<Response> {
  try {
    const { userId } = await auth()
    if (!userId) return Response.json({ error: 'signed_out' }, { status: 401 })

    /**
     * ── `no_workspace` WAS ALSO SAYING "THE READ BROKE" ────────────────────────
     * The lookup returned null for both, so a failed workspace query left here as
     * a 400 tagged `no_workspace`: a client-error status, and a named cause that
     * was not the cause. Run 23 split this at the reader and named the handlers as
     * unaudited; this is one of them.
     *
     * The caller USED TO collapse every non-ok into one sentence — "We could not
     * read that — tell us in your own words instead" — which is a claim about
     * the SITE the customer submitted, and wrong on every arm below because
     * none of them opens the document. That report is now actioned: the four
     * named causes each get their own sentence in
     * `lib/onboarding/door-transport-failure.ts`, and `door-step.tsx` reads the
     * code off this body rather than discarding it. Renaming a cause here
     * without adding it there falls through to the unnamed default, which is
     * honest but vaguer — so keep the two in step.
     */
    const workspaceRead = await readActiveWorkspace()
    if (workspaceRead.status === 'unreadable') {
      return Response.json({ error: 'workspace_unreadable' }, { status: 503 })
    }
    if (workspaceRead.status === 'none') {
      return Response.json({ error: 'no_workspace' }, { status: 400 })
    }
    const workspace = workspaceRead.workspace

    const form = await request.formData()
    const file = form.get('pdf')
    const pdf =
      file instanceof File && file.size > 0
        ? { name: file.name, size: file.size, bytes: await file.arrayBuffer() }
        : null

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const line = (obj: unknown) => {
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`))
          } catch {
            /* client hung up mid-read; the work is already paid for either way */
          }
        }
        try {
          const result = await readDoorStreaming(
            {
              pdf,
              url: String(form.get('url') ?? ''),
              sentence: String(form.get('sentence') ?? ''),
              workspaceId: workspace.id,
              userId,
            },
            (stage: Stage) => line({ type: 'stage', ...stage }),
          )
          line({ type: 'done', result })

          /**
           * The website the customer just gave becomes the first document in
           * their library, without anybody asking for it.
           *
           * AFTER `done`, and deliberately. The customer's screen moves on as
           * soon as that line lands; this rides on text already in memory and
           * fetches nothing, but it does write two rows, and no part of it may
           * hold up the answer they are waiting for. `seedLibraryFromSite`
           * cannot throw — see its header — so the stream still closes cleanly
           * if the library refuses the document.
           *
           * Only the `url` kind. A PDF door already puts its document in front
           * of a person who chose it; and when both are given the site text is
           * not what `result` carries, so seeding here would store the wrong
           * thing under the right address.
           */
          if (result.ok && result.kind === 'url') {
            await seedLibraryFromSite({
              workspaceId: workspace.id,
              url: String(form.get('url') ?? ''),
              text: result.text,
              title: result.foundName || null,
            })
          }
        } catch (error) {
          reportServerError(error, { action: 'door.stream', workspaceId: workspace.id })
          /**
           * `readDoorStreaming` RETURNING `{ ok: false }` is a classified
           * verdict on the document and carries its own sentence. Reaching THIS
           * catch means it THREW — an unclassified fault in Sahoda, at an
           * unknown point, possibly before the document was opened at all.
           *
           * This used to emit "We could not read that — tell us in your own
           * words instead", the same claim the caller made on every transport
           * failure and the reason `lib/onboarding/door-transport-failure.ts`
           * exists. It is wrong for the same reason here: it is a verdict on
           * the customer's website issued by a code path that does not know
           * whether the website was ever fetched, and the remedy it offers
           * sends someone to retype their business by hand over our own crash.
           */
          line({
            type: 'done',
            result: {
              ok: false,
              message:
                'Sahoda broke part-way through reading, so it cannot say whether your link or PDF is usable. Nothing was charged. Try again.',
              stages: [],
              costUsd: 0,
            },
          })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store, no-transform',
        // Without this a proxy may buffer the whole body and deliver every
        // stage at once at the end, which is the same as not streaming at all.
        'x-accel-buffering': 'no',
      },
    })
  } catch (error) {
    reportServerError(error, { action: 'door.stream' })
    return Response.json({ error: 'failed' }, { status: 500 })
  }
}
