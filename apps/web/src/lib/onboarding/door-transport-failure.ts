/**
 * What to say when the door request never produced a verdict about the document.
 *
 * ── THE DEFECT THIS EXISTS TO END ────────────────────────────────────────────
 * `door-step.tsx` collapsed every non-ok HTTP response into one sentence:
 *
 *     "We could not read that — tell us in your own words instead."
 *
 * That sentence is a CLAIM ABOUT THE CUSTOMER'S WEBSITE. It is the right thing
 * to say when Sahoda fetched a page and could not make sense of it. It is wrong
 * on every arm that never got that far, and `app/api/onboarding/door/route.ts`
 * has four of them — it already returns a distinct status and a named cause for
 * each, and the caller threw all four away:
 *
 *   401 `signed_out`            the session expired. Nothing was fetched.
 *   400 `no_workspace`          this account has no workspace. Nothing was fetched.
 *   503 `workspace_unreadable`  Sahoda could not read its OWN database.
 *   500 `failed`                Sahoda threw before the read began.
 *
 * On all four, the document is unexamined. Telling someone their site is
 * unreadable when nothing ever requested it is the same class of error as
 * rendering an em dash for a quantity that does not exist (docs/27 §3.1): a
 * confident answer to a question nobody asked. Worse here, because it is a
 * verdict on something the customer owns and is likely to act on — the remedy
 * it offers ("tell us in your own words") makes them abandon a perfectly good
 * website over an expired sign-in.
 *
 * The route's own comment says exactly this and says it was out of scope to fix:
 * "The caller collapses every non-ok into one sentence … It is wrong for both
 * arms and it lives in components/onboarding, which is out of scope for this
 * run, so it is reported rather than touched." This is that report, actioned.
 *
 * ── WHAT EVERY MESSAGE HERE MAY AND MAY NOT SAY ──────────────────────────────
 * MUST NOT: assert anything about the submitted URL, PDF or its contents.
 * MUST: name what actually happened, and offer the remedy that matches it.
 * A retry is the remedy for a transient fault; re-typing your business in your
 * own words is not, and offering it implies the document was the problem.
 */
export interface DoorTransportFailure {
  message: string
  /**
   * True when trying the same document again is the sensible next move. False
   * when the fault is the session or the account, where a retry just fails
   * again — and where offering "tell us in your own words" would be a diversion
   * rather than a remedy.
   */
  retryable: boolean
}

/**
 * The shape the route returns on a non-streaming failure. Parsed defensively:
 * a 502 from a proxy in front of the app has no JSON body at all, and a body
 * that is not the expected object must not throw on the crash path.
 */
export function doorErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const code = (body as { error?: unknown }).error
  return typeof code === 'string' && code.length > 0 ? code : null
}

/**
 * Map a failed door REQUEST — not a failed read — to a sentence.
 *
 * Keyed on the named cause first and the status second. The code is the thing
 * the route actually decided; the status is a fallback for a response that
 * never reached our handler (a proxy timeout, a platform 502), where the only
 * honest statement is that the request did not arrive.
 */
export function doorTransportFailure(status: number, code: string | null): DoorTransportFailure {
  switch (code) {
    case 'signed_out':
      return {
        // Says what to do, and says the document is untouched — otherwise the
        // obvious reading of "sign in again" is that the upload was rejected.
        message:
          'Your sign-in expired before Sahoda could start reading. Sign in again and press Read this — nothing about your link or PDF was the problem.',
        retryable: false,
      }
    case 'no_workspace':
      return {
        message:
          'This account has no workspace yet, so there is nowhere to save what Sahoda reads. Create one and try again — your link or PDF has not been read either way.',
        retryable: false,
      }
    case 'workspace_unreadable':
      return {
        message:
          'Sahoda could not reach its own database to find your workspace, so the read never started. Nothing about your link or PDF was the problem. Try again in a moment.',
        retryable: true,
      }
    case 'failed':
      return {
        message:
          'Sahoda broke before it opened your link or PDF, so there is nothing to report about the document itself. Try again.',
        retryable: true,
      }
    default:
      break
  }

  // No named cause. Say the truth available at this altitude and no more: the
  // request did not come back, and the document is therefore unexamined.
  if (status === 413) {
    return {
      message:
        'That upload was too large to reach Sahoda, so it was never opened. Try a smaller PDF, or paste your website link instead.',
      retryable: false,
    }
  }
  if (status === 429) {
    return {
      message:
        'Too many reads in a row, so this one was turned away before your link or PDF was opened. Wait a minute and press Read this again.',
      retryable: true,
    }
  }
  return {
    message:
      'The request did not reach Sahoda, so your link or PDF was never opened. This is not a verdict on the document — try again.',
    retryable: true,
  }
}
