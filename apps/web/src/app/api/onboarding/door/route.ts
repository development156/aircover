import { auth } from '@clerk/nextjs/server'

import { bodyTooLarge, parseDoorForm } from '@/lib/onboarding/door-request'
import { doorReadAllowed } from '@/lib/onboarding/limits'
import { readDoorStreaming, type Stage } from '@/lib/onboarding/read-door'
import { seedLibraryFromSite } from '@/lib/onboarding/seed-library'
import { reportServerError } from '@/lib/observability/report'
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
 *
 * ── THE ORDER OF THE REFUSALS IS THE DESIGN ─────────────────────────────────
 *   1. session          nothing without a person
 *   2. workspace        nothing without somewhere to save, and `unreadable` is
 *                       its own arm (503), never "you have no workspace"
 *   3. body length      a header compare, before `formData()` buffers the body
 *   4. rate limit       per person AND per workspace, before anything is parsed
 *   5. shape            zod, before the read
 *   6. the read         the PDF arm holds credits inside `read-door.ts`
 *
 * Each refusal returns a named cause, and `lib/onboarding/door-transport-failure.ts`
 * owns the sentence for every one of them. Add a cause here, add it there.
 */

export const runtime = 'nodejs'
/** The read can take ~45s with a slow site; the platform default would cut it. */
export const maxDuration = 120

export async function POST(request: Request): Promise<Response> {
  try {
    const { userId } = await auth()
    if (!userId) return Response.json({ error: 'signed_out' }, { status: 401 })

    /**
     * `no_workspace` and `workspace_unreadable` are two different facts with two
     * different remedies, and the second is not a client error. The reader was
     * split for this; the caller reads the code off the body.
     */
    const workspaceRead = await readActiveWorkspace()
    if (workspaceRead.status === 'unreadable') {
      return Response.json({ error: 'workspace_unreadable' }, { status: 503 })
    }
    if (workspaceRead.status === 'none') {
      return Response.json({ error: 'no_workspace' }, { status: 400 })
    }
    const workspace = workspaceRead.workspace

    // BEFORE the body is parsed: `request.formData()` buffers the whole
    // multipart body, so a size check after it has already paid for the bytes.
    if (bodyTooLarge(request.headers.get('content-length'))) {
      return Response.json({ error: 'too_large' }, { status: 413 })
    }

    // Keyed on the person as well as the workspace, because a workspace can be
    // erased and re-created and the person cannot.
    if (!(await doorReadAllowed(userId, workspace.id))) {
      return Response.json({ error: 'rate_limited' }, { status: 429 })
    }

    const form = parseDoorForm(await request.formData())
    if (!form.ok) return Response.json({ error: form.reason }, { status: 400 })
    const { pdf, url, sentence } = form

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
            { pdf, url, sentence, workspaceId: workspace.id, userId },
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
              url,
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
           * "Nothing was charged" is true here by construction: the only paid
           * work is inside a `withCredits` whose throw path releases the hold.
           */
          line({
            type: 'done',
            result: {
              ok: false,
              message:
                'Sahoda broke part-way through reading, so it cannot say whether your link or PDF is usable. Nothing was charged. Try again.',
              stages: [],
              costUsd: 0,
              creditsCharged: 0,
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
