/**
 * Publish failures, in words a shop owner can act on.
 *
 * ── WHY NOT `describeViolation` ──────────────────────────────────────────────
 * That maps CONSTRAINT ENGINE codes and flattens everything it does not know to a
 * generic sentence — correct there, because an unknown violation code means the
 * engine produced something unexpected. Here it would flatten every adapter code
 * in existence, so a post that failed because Instagram rejected the image and a
 * post that failed because the account needs reconnecting would read identically.
 * "Failed" with no reason is the thing this is meant to prevent.
 *
 * ── WHY THE MAP IS AN ALLOWLIST ──────────────────────────────────────────────
 * `post_publish_logs.error.message` is adapter-controlled and can carry text from
 * a third-party API. Rendering it verbatim would put an unreviewed string from
 * Zernio or Meta on our page. So the copy comes from the CODE, which is ours, and
 * an unrecognised code degrades to a safe sentence rather than echoing anything.
 */

export interface PublishErrorDisplay {
  message: string
  /** True when trying again could plausibly work without the user changing anything. */
  worthRetrying: boolean
  /** True when the fix is to reconnect the account. */
  needsReconnect: boolean
}

const GENERIC = 'Something went wrong sending this one. Try again, or ask us to take a look.'

const COPY: Record<string, PublishErrorDisplay> = {
  // ── The account ────────────────────────────────────────────────────────────
  UNAUTHORIZED: {
    message: 'The connection to this account has stopped working. Reconnect it and try again.',
    worthRetrying: false,
    needsReconnect: true,
  },
  FORBIDDEN: {
    message: 'This account no longer allows posting. Reconnect it and try again.',
    worthRetrying: false,
    needsReconnect: true,
  },
  CONNECTION_UNAVAILABLE: {
    message: 'No working connection for this channel. Connect the account first.',
    worthRetrying: false,
    needsReconnect: true,
  },
  CROSS_TENANT_ACCOUNT: {
    message: 'This account is not linked to this workspace. Reconnect it from Connections.',
    worthRetrying: false,
    needsReconnect: true,
  },

  // ── The content ────────────────────────────────────────────────────────────
  MEDIA_REQUIRED: {
    message: 'Instagram needs at least one photo — there is no text-only post.',
    worthRetrying: false,
    needsReconnect: false,
  },
  MEDIA_TYPE: {
    message: 'Instagram takes JPEG and PNG only. Swap the image and try again.',
    worthRetrying: false,
    needsReconnect: false,
  },
  MEDIA_TOO_LARGE: {
    message: 'That image is too large to publish. Use a smaller one.',
    worthRetrying: false,
    needsReconnect: false,
  },
  MEDIA_NOT_FETCHABLE: {
    message: 'The image could not be served to the platform. Re-attach it and try again.',
    worthRetrying: true,
    needsReconnect: false,
  },
  PLATFORM_REJECTED: {
    message: 'The platform refused this post. Change the caption or the image and try again.',
    worthRetrying: false,
    needsReconnect: false,
  },
  MAX_CHARS: {
    message: 'This is longer than the channel allows. Shorten it and try again.',
    worthRetrying: false,
    needsReconnect: false,
  },
  MAX_HASHTAGS: {
    message: 'Too many hashtags for this channel. Remove a few and try again.',
    worthRetrying: false,
    needsReconnect: false,
  },
  CHANNEL_NOT_PUBLISHABLE: {
    message: 'This channel cannot be posted to yet.',
    worthRetrying: false,
    needsReconnect: false,
  },
  VARIANT_NOT_FOUND: {
    message: 'There was nothing written for this channel.',
    worthRetrying: false,
    needsReconnect: false,
  },

  // ── Worth another go ───────────────────────────────────────────────────────
  STILL_PROCESSING: {
    message: 'The platform is still working on this one. It may still go live — check shortly.',
    worthRetrying: true,
    needsReconnect: false,
  },
  RATE_LIMITED: {
    message: 'The platform asked us to slow down. This will be tried again automatically.',
    worthRetrying: true,
    needsReconnect: false,
  },
  NETWORK_ERROR: {
    message: 'We could not reach the platform. Try again in a moment.',
    worthRetrying: true,
    needsReconnect: false,
  },
  STORAGE_ERROR: {
    message: 'We could not read the attached image. Try again in a moment.',
    worthRetrying: true,
    needsReconnect: false,
  },
  MEDIA_UPLOAD_FAILED: {
    message: 'Preparing the image for the platform did not work. Try again in a moment.',
    worthRetrying: true,
    needsReconnect: false,
  },

  // ── Ours to fix, not theirs ────────────────────────────────────────────────
  ACCOUNT_MISMATCH: {
    message: 'We stopped this one: the platform matched it to a different account.',
    worthRetrying: false,
    needsReconnect: true,
  },
  // ── The refusal gate (doc 18 §8) ───────────────────────────────────────────
  // These two are the LAST RESORT, not the refusal. The real one is rendered by
  // `GateRefusalNote` from `last_error.gate`, which names the rule, says whether
  // it is inherited or theirs, and offers the rewrite. This copy is what shows
  // when that structure is missing — an old row, or a shape we cannot read — and
  // it is written to still be actionable rather than to say "something went
  // wrong", because that sentence is what teaches people to route around us.
  //
  // ── ON `worthRetrying` FOR THESE TWO ───────────────────────────────────────
  // It is documented as "trying again could plausibly work WITHOUT the user
  // changing anything", and that is the reading applied here. It does not gate
  // the retry affordance — `ChannelStatusList` branches on `row.retryable`,
  // which is true for any `failed` variant — and nothing in apps/web reads this
  // field today. So it is a claim about the world, not a switch, and the claim
  // has to be the honest one: after a rewrite, retrying a blocked post is
  // exactly the right move and the button is correct to be there.
  GATE_BLOCKED: {
    message:
      'This breaks a rule your brand is held to, so it was not sent. Reword it and try again.',
    // FALSE because the SAME words are refused identically — the deterministic
    // layer is a pure function of the text. Change the wording and retry.
    worthRetrying: false,
    needsReconnect: false,
  },
  GATE_HELD: {
    message: 'This is waiting for a person to read it before it goes out. Nothing was sent.',
    // TRUE, and unusually so: a hold is often the check being unreachable rather
    // than a judgement about the post, and the identical words may clear on a
    // second run. The publisher already retries that case on its own — an
    // unreachable check is recorded transient and the claim is handed back.
    worthRetrying: true,
    needsReconnect: false,
  },

  POST_NOT_PUBLISHABLE: {
    message: 'This post is no longer in a state that can be published.',
    worthRetrying: false,
    needsReconnect: false,
  },
}

/** Copy for one publish-failure code. Unknown codes never echo the stored message. */
export function describePublishError(code: string | null): PublishErrorDisplay {
  if (typeof code !== 'string') {
    return { message: GENERIC, worthRetrying: true, needsReconnect: false }
  }
  return COPY[code] ?? { message: GENERIC, worthRetrying: true, needsReconnect: false }
}
