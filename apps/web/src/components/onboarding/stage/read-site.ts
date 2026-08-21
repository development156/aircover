import type { DoorState } from '@/app/actions/onboarding-door'
import { doorErrorCode, doorTransportFailure } from '@/lib/onboarding/door-transport-failure'

import type { DoorOutcome } from './door-outcome'

/**
 * Two of the four named causes leave NOWHERE TO SAVE anything.
 *
 * `no_workspace` and `signed_out` are not transient: the resolve that follows
 * would return "Create a workspace first" / "Sign in to resolve your brand", so
 * carrying on is a dead end dressed as a way forward. They are marked fatal and
 * the build halts on them instead of offering to continue.
 *
 * `workspace_unreadable` and `failed` are Sahoda breaking, not the account
 * being wrong, so a retry is a real remedy and the flow may go on without the
 * door — the rest of onboarding does not depend on it.
 */
const FATAL_CAUSES = new Set(['no_workspace', 'signed_out'])

/**
 * Read the customer's website through the existing door route.
 *
 * The route streams NDJSON stage events and one `done`. The stages are the
 * SERVER's own — never invented here — and are ignored by this caller because
 * the read runs in the background while the user keeps answering; the build
 * screen names facets instead.
 */
export async function readSite(url: string, signal?: AbortSignal): Promise<DoorOutcome> {
  const data = new FormData()
  data.set('url', url)
  data.set('sentence', '')

  let res: Response
  try {
    res = await fetch('/api/onboarding/door', { method: 'POST', body: data, signal })
  } catch {
    // Never reached the server. Nothing may be said about the page.
    return {
      kind: 'blocked',
      message:
        'The request did not reach Sahoda, so your website was never opened. This is not a verdict on the site — it will be tried again when you build.',
      retryable: true,
      fatal: false,
    }
  }

  if (!res.ok || !res.body) {
    /**
     * THE DOCUMENT WAS NEVER OPENED ON THIS PATH. The route names its cause —
     * signed_out, no_workspace, workspace_unreadable, failed — and each keeps
     * its own sentence. Collapsing them into "we could not read that" is a
     * claim about the CUSTOMER'S WEBSITE, and it is wrong on all four arms.
     *
     * The body is read defensively: a platform 502 in front of the app carries
     * HTML, so `res.json()` rejects, and the crash path must not crash.
     */
    const body = (await res.json().catch(() => null)) as unknown
    const code = doorErrorCode(body)
    const failure = doorTransportFailure(res.status, code)
    return {
      kind: 'blocked',
      message: failure.message,
      retryable: failure.retryable,
      fatal: code !== null && FATAL_CAUSES.has(code),
    }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let state: DoorState | null = null

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // A chunk may split a line, so the tail is carried over rather than
      // parsed as though it were complete.
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const raw of lines) {
        if (!raw.trim()) continue
        const event = JSON.parse(raw) as
          | { type: 'stage' }
          | { type: 'done'; result: DoorState }
        if (event.type === 'done') state = event.result
      }
    }
  } catch {
    return {
      kind: 'blocked',
      message:
        'The connection dropped while Sahoda was reading your website, so it has no verdict about the page either way. It will be tried again when you build.',
      retryable: true,
      fatal: false,
    }
  }

  if (!state) {
    return {
      kind: 'blocked',
      message:
        'The read ended without an answer, so nothing is known about your website yet. It will be tried again when you build.',
      retryable: true,
      fatal: false,
    }
  }

  // A read that HAPPENED and produced a negative verdict. This one legitimately
  // is about the page, so it keeps the server's own sentence.
  if (!state.ok) return { kind: 'unread', message: state.message }

  return {
    kind: 'read',
    text: state.text,
    label: state.label,
    foundName: state.foundName,
    colors: state.colors,
  }
}
