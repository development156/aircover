/**
 * WHAT THE PLATFORM SAID WHEN IT REFUSED, SURFACED INSTEAD OF SWALLOWED.
 *
 * ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────
 * The founder connected several channels, saw nothing useful, and went to
 * Zernio's own dashboard to find out why. It told them immediately:
 *
 *   Google Business Profile token exchange failed: 400 { "error":
 *   "invalid_grant", "error_description": "Bad Request" }
 *
 * We had that fact and threw it away. Zernio's spec is explicit — "On failure
 * every platform appends error details, starting with `error` and `platform`" —
 * and `/api/oauth/zernio/return` ignores every query parameter by design. That
 * design is right about IDS, which can name somebody else's account, and wrong
 * about this: an error string cannot name a resource, and dropping it is how a
 * customer ends up reading a third party's dashboard to use our product.
 *
 * ── EVERYTHING HERE IS UNTRUSTED TEXT ────────────────────────────────────────
 * `error` and its description arrive through the customer's browser and are
 * written by a third party. They are never interpolated into a URL, never used
 * to decide anything, and never rendered unescaped. The CODE is matched against
 * a small allowlist to choose OUR sentence; the raw text is shown only as a
 * secondary line, so a hostile or merely confusing string cannot become the
 * headline a customer acts on.
 */

/** A refusal that came back on the return URL. Data, never an instruction. */
export interface ConnectFailure {
  /** Zernio's own code, lowercased and trimmed. */
  code: string
  /** What the platform said, as it said it. May be long, may be JSON. */
  detail: string | null
}

/**
 * The parameter names Zernio uses, in the order it documents them.
 *
 * `error` is the one the spec names. `error_description` and `message` are the
 * shapes an OAuth-shaped failure commonly carries alongside it, and reading them
 * costs nothing when they are absent. `reason` is OUR OWN parameter on this
 * route and is deliberately NOT read here — it is a status we set ourselves, and
 * treating it as an upstream failure would report our own notices as theirs.
 */
export function readConnectFailure(params: URLSearchParams): ConnectFailure | null {
  const raw = params.get('error')?.trim()
  if (!raw) return null

  const detail =
    params.get('error_description')?.trim() ||
    params.get('message')?.trim() ||
    // The code itself is often the only thing sent, in which case the detail
    // line would repeat the headline. Null means "say nothing more".
    null

  return {
    code: raw.toLowerCase().slice(0, 120),
    detail: detail === null ? null : detail.slice(0, 400),
  }
}

/** What the customer reads. `remedy` is null when we know of none that works. */
export interface FailureCopy {
  headline: string
  body: string
  remedy: string | null
}

/**
 * Turn a refusal into a sentence.
 *
 * ── THE ALLOWLIST IS SMALL ON PURPOSE ────────────────────────────────────────
 * Only codes actually SEEN are mapped. Everything else falls through to a
 * sentence that says what is certainly true — the platform refused, nothing was
 * connected, nothing was charged — and shows the provider's own words underneath
 * rather than inventing a cause. Guessing at a remedy for a code nobody has read
 * is exactly what `no-impossible-remedy.spec.ts` forbids.
 */
export function connectFailureCopy(failure: ConnectFailure, channel: string): FailureCopy {
  const code = failure.code

  // MEASURED from Zernio's own dialog, 2026-08-27. `invalid_grant` at the token
  // exchange means the authorisation code was already spent or had expired —
  // which happens when a consent screen is left open, or the back button is used
  // partway through. Connecting again is a remedy that genuinely works.
  if (code.includes('invalid_grant') || code.includes('token_exchange')) {
    return {
      headline: `${channel} didn’t finish signing in`,
      body:
        `${channel} accepted the sign-in and then refused the handover. That usually ` +
        `means the approval sat too long or was used twice. Nothing was connected ` +
        `and nothing was charged.`,
      remedy: 'Connect again, and complete the sign-in without going back a step.',
    }
  }

  // MEASURED: Zernio's own code for the Facebook case, whose remedy is the one
  // the picker's empty state already carries.
  if (code.includes('no_facebook_pages')) {
    return {
      headline: 'Facebook sent back no Page',
      body:
        'Facebook let Sahoda in and then listed no Page for this account. Nothing ' +
        'was connected and nothing was charged.',
      remedy:
        'Connect again, and on Facebook’s screen choose Edit settings rather than ' +
        'Continue, then tick the Page you want.',
    }
  }

  if (code.includes('access_denied') || code.includes('user_denied') || code.includes('cancel')) {
    return {
      headline: `${channel} wasn’t connected`,
      body: `The sign-in was cancelled. Nothing was connected and nothing was charged.`,
      remedy: null,
    }
  }

  return {
    headline: `${channel} refused the connection`,
    body:
      `${channel} turned the sign-in down and did not say why in a way Sahoda ` +
      `recognises. Nothing was connected and nothing was charged.`,
    // No invented remedy. The provider's own words go on the page underneath
    // this, which is more use than a guess.
    remedy: null,
  }
}
