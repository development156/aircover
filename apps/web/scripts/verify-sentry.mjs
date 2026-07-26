#!/usr/bin/env node

/**
 * Drives /api/debug/sentry against a RUNNING dev server and reports what came
 * back. Run `pnpm dev` first, then `pnpm verify:sentry`.
 *
 * WHAT A PASS HERE MEANS, precisely. The `?kind=message` probe now reports the
 * result of a real `Sentry.flush()` on the server, so a pass proves a client was
 * initialised and its queue DRAINED — the envelope left the process. That is a
 * genuine delivery signal, and it is the thing the previous version of this
 * script could not assert: it read a field that was just `Boolean(SENTRY_DSN)`,
 * which is true for a revoked key and a wrong project id alike.
 *
 * It still stops one step short of ARRIVAL, and that gap is real rather than
 * laziness. Sentry's transport drains on `allSettled`, so a 403 empties the
 * queue exactly like a stored event does; nothing inside the process can tell
 * the two apart. Hence the final line still sends you to the Sentry UI with an
 * event id — but only after the local half has actually been proven, instead of
 * being assumed.
 *
 * The other probes prove the deliberate-error branches really do produce 500s
 * (so `onRequestError` had something to capture) and that the server is up at
 * all. It exits non-zero on an unreachable server, on a blocked probe, and on a
 * false flush, so a wrapper script cannot mistake "never ran" or "nothing was
 * sent" for "passed".
 *
 * Dependency-free by design: `fetch` is global from Node 18, and a verification
 * tool that needs its own install step is a verification tool nobody runs.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

/**
 * Optional session cookie, because this endpoint is NOT public.
 *
 * `src/middleware.ts` protects everything except /sign-in and /sign-up, so an
 * unauthenticated request to /api/debug/sentry is stopped by Clerk before the
 * route runs. That is the correct security posture and this script does not try
 * to change it — it just needs a way in. Copy the `__session` cookie from a
 * signed-in browser tab's devtools and pass it through:
 *
 *   SENTRY_VERIFY_COOKIE='__session=…' pnpm verify:sentry
 *
 * Read from a dedicated var rather than anything Next or Clerk owns, so there is
 * no chance of picking up a real secret by accident. The value is sent, never
 * printed.
 */
const COOKIE = process.env.SENTRY_VERIFY_COOKIE

/**
 * The three branches, and what each one is actually evidence of.
 * `expectError: true` means a 500 is the PASS condition — these routes exist to
 * throw, so a 200 would mean the deliberate error never happened.
 */
const PROBES = [
  {
    kind: null,
    label: 'unhandled server error',
    proves: 'onRequestError in instrumentation.ts captured a thrown route error',
    expectError: true,
  },
  {
    kind: 'message',
    label: 'captureMessage + flush',
    proves: 'the SDK initialised AND the transport queue drained — the envelope left the process',
    expectError: false,
  },
  {
    kind: 'secret',
    label: 'error carrying fake credential-shaped text',
    proves: 'scrubbing — the event in Sentry must show [redacted], not the fake token',
    expectError: true,
  },
]

/**
 * Prints only the request URL and the server's response. Never `process.env`,
 * and never the response of anything but this one debug route — a diagnostic
 * script that dumps its environment to a terminal (and from there into a pasted
 * bug report or a CI log) is its own kind of leak.
 */
async function probe({ kind, label, proves, expectError }) {
  const url = kind ? `${BASE_URL}/api/debug/sentry?kind=${kind}` : `${BASE_URL}/api/debug/sentry`

  console.log(`\n→ ${label}`)
  console.log(`  GET ${url}`)
  console.log(`  proves: ${proves}`)

  let response
  try {
    // `redirect: 'manual'` so a Clerk sign-in redirect is visible as a 3xx here
    // instead of being silently followed into an HTML login page that would then
    // be reported as an unhelpful "response was not JSON".
    response = await fetch(url, {
      redirect: 'manual',
      headers: COOKIE ? { cookie: COOKIE } : undefined,
    })
  } catch (error) {
    // A connection-level failure is the one thing this script treats as fatal:
    // it means nothing was verified, and that must not read as success.
    console.error(`  UNREACHABLE: ${error instanceof Error ? error.message : String(error)}`)
    return { ok: false, unreachable: true }
  }

  // A 3xx is Clerk sending us to the sign-in page: the request never reached the
  // route, so nothing about Sentry was tested.
  if (response.status >= 300 && response.status < 400) {
    console.log(`  ${response.status} — redirected to sign-in; the route did not run.`)
    console.log('  Pass a session cookie via SENTRY_VERIFY_COOKIE.')
    return { ok: false, blocked: true }
  }

  // 404 IS AMBIGUOUS HERE, and pretending otherwise would send someone down the
  // wrong path. Three different things produce it:
  //   · the production guard in the route (NODE_ENV === 'production');
  //   · Clerk's auth.protect() refusing an unauthenticated API request;
  //   · the route genuinely not being deployed.
  // They are indistinguishable from outside on purpose — the guard returns a
  // bare 404 precisely so a scanner cannot confirm the endpoint exists — so the
  // honest thing is to list the causes rather than assert one.
  if (response.status === 404) {
    console.log('  404 — the route did not run. Any of:')
    console.log('    · NODE_ENV is production, so the guard disabled the endpoint (correct);')
    console.log(
      '    · Clerk blocked the request — set SENTRY_VERIFY_COOKIE to a signed-in session;',
    )
    console.log('    · the route is not present in this build.')
    return { ok: false, blocked: true }
  }

  if (expectError) {
    const ok = response.status >= 500
    console.log(`  ${response.status} — ${ok ? 'threw as intended' : 'DID NOT THROW'}`)
    if (ok) console.log('  Find this in Sentry by timestamp; the id is assigned server-side.')
    return { ok }
  }

  let body
  try {
    body = await response.json()
  } catch {
    console.error(`  ${response.status} — response was not JSON`)
    return { ok: false }
  }

  console.log(`  ${response.status} — eventId: ${body.eventId ?? '(none returned)'}`)

  // The two claims, kept apart on the way out exactly as the route keeps them
  // apart on the way in. `configured` is only ever context for `flushed`:
  //
  //   · configured false — no DSN, so the client built no transport and
  //     `flush()` returned true without sending anything. A bare `flushed` would
  //     read as success here, which is why it is never reported alone.
  //   · flushed false — the queue did not empty before the timeout, or no client
  //     was initialised. Whatever else is true, the event did not get out.
  //
  // An event id is NOT part of the verdict. It is assigned locally before any
  // network call and comes back unchanged from a process that sent nothing, so
  // treating its presence as a pass is the bug this script used to have.
  // The label carries the meaning and the value follows it, rather than a
  // trailing gloss — `flushed: false — the transport queue drained` asserts the
  // opposite of the value it is printing.
  console.log(`  configured (a DSN is set):      ${body.configured}`)
  console.log(`  flushed (the queue drained):    ${body.flushed}`)

  if (body.note) console.log(`  ${body.note}`)

  // `ok` is the route's own combined verdict. Recomputed defensively rather than
  // trusted, so an older build that predates the field cannot pass by omission.
  const ok = body.configured === true && body.flushed === true
  if (!ok) console.log('  VERDICT: nothing verifiably left the process.')

  return { ok }
}

async function main() {
  console.log(`Verifying Sentry wiring against ${BASE_URL}`)
  console.log('The server must already be running (pnpm dev).')

  const results = []
  for (const entry of PROBES) {
    // Sequential on purpose. Concurrent requests interleave their output into an
    // unreadable stream, and this script's entire product is readable output.
    results.push(await probe(entry))
  }

  if (results.some((result) => result.unreachable)) {
    console.error(`\nFailed: no server responded at ${BASE_URL}. Start it with pnpm dev.`)
    process.exit(1)
  }

  if (results.every((result) => result.blocked)) {
    console.error(
      '\nFailed: every probe was blocked before the route ran, so nothing was verified.',
    )
    process.exit(1)
  }

  const failed = results.filter((result) => !result.ok).length
  if (failed > 0) {
    console.error(`\nFailed: ${failed} of ${results.length} probes did not behave as expected.`)
    process.exit(1)
  }

  console.log(
    '\nAll probes behaved as expected: the SDK is initialised and events left the process.',
  )
  console.log(
    'One step remains that no local probe can take — a drained queue is not a stored event,',
  )
  console.log(
    'because a rejected envelope drains exactly like a good one. Open Sentry and confirm:',
  )
  console.log('  · the events are there (a missing event means the DSN points somewhere wrong);')
  console.log('  · the fake token reads [redacted], not the literal value.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
