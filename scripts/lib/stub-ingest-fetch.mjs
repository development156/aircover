/**
 * A stand-in ingest endpoint, preloaded into ops-sync.mjs with `node --import`.
 *
 * TEST SUPPORT ONLY, and deliberately not a seam in the production script: the
 * sync talks to a real server via the real `fetch`, and nothing in it knows this
 * file exists. It is loaded from ops-sync.test.mjs so that the ACKNOWLEDGED path
 * — the one that decides what gets deleted from the outbox — can be exercised
 * without opening a socket, which is what makes that test run the same way on a
 * laptop, in CI and inside a restricted sandbox.
 *
 *   OPS_STUB_CAPTURE  file to write the outgoing payload to
 *   OPS_STUB_STATUS   HTTP status to answer with (default 200)
 */
import { writeFileSync } from 'node:fs'

const capture = process.env.OPS_STUB_CAPTURE
const status = Number(process.env.OPS_STUB_STATUS ?? 200)

globalThis.fetch = async (_url, init) => {
  if (capture) writeFileSync(capture, String(init?.body ?? ''))

  const body =
    status === 200
      ? JSON.stringify({
          ok: true,
          roadmap: 0,
          tasks: 0,
          changelog: 0,
          qa: 0,
          archived: 0,
          session: true,
        })
      : JSON.stringify({ ok: false, error: 'invalid_payload' })

  return new Response(body, { status, headers: { 'content-type': 'application/json' } })
}
