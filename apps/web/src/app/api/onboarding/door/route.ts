import { auth } from '@clerk/nextjs/server'

import { reportServerError } from '@/lib/observability/report'
import { readDoorStreaming, type Stage } from '@/lib/onboarding/read-door'
import { getActiveWorkspace } from '@/lib/workspaces'

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

    const workspace = await getActiveWorkspace()
    if (!workspace) return Response.json({ error: 'no_workspace' }, { status: 400 })

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
        } catch (error) {
          reportServerError(error, { action: 'door.stream', workspaceId: workspace.id })
          line({
            type: 'done',
            result: {
              ok: false,
              message: 'We could not read that — tell us in your own words instead.',
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
