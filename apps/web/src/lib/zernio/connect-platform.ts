import { type Channel } from '@sahoda/shared'

/**
 * ZERNIO'S NAME FOR A CHANNEL ON THE CONNECT ENDPOINT.
 *
 * ── THE BUG THIS EXISTS TO CLOSE ─────────────────────────────────────────────
 * `connectUrl` passed our channel id straight into `GET /connect/{platform}`, so
 * pressing Connect on X requested `/connect/x` and on Google Business
 * `/connect/gbp`. Zernio knows neither name. Both came back as an error the
 * screen rendered as "Couldn't start the connection. Try again." — a sentence
 * that invites a retry which can never succeed, on a button that was never going
 * to work. Instagram, LinkedIn and Facebook worked throughout, because for those
 * three our name and Zernio's happen to be the same string.
 *
 * MEASURED against `docs.zernio.com/api/openapi`, `GET /v1/connect/{platform}`:
 *
 *   [facebook, instagram, linkedin, twitter, tiktok, youtube, threads, reddit,
 *    pinterest, bluesky, googlebusiness, telegram, snapchat, discord, slack,
 *    whatsapp]
 *
 * ── THIS IS THE FOURTH VOCABULARY, AND THE REPO ALREADY KNEW ABOUT THREE ─────
 * `zernio/recovery.ts` documents that edit, unpublish and publish each name these
 * channels differently, and asserts they DISAGREE so a refactor cannot collapse
 * them. Connect is a fourth, and it was the one nobody had mapped — it was
 * reading the publish vocabulary by accident, which is right for three channels
 * out of six and silently wrong for the rest.
 *
 * So: never reuse `ZERNIO_PLATFORM_NAME` here. It maps `gbp` to `google`, which
 * connect refuses just as unpublish does.
 */
export const CONNECT_PLATFORM: Readonly<Record<Channel, string | null>> = {
  // Ours is `x`; Zernio still calls it twitter, as it does on edit and unpublish.
  x: 'twitter',
  // `googlebusiness`, NOT `google`. The publish endpoint's name is refused here.
  gbp: 'googlebusiness',
  instagram: 'instagram',
  linkedin: 'linkedin',
  facebook: 'facebook',
  /**
   * TELEGRAM IS NOT AN OAUTH FLOW, so it has no name on this endpoint.
   *
   * `GET /v1/connect/telegram` does not return an `authUrl`. It returns an access
   * CODE valid for 15 minutes: the customer adds Zernio's bot as an admin of
   * their channel, sends the bot that code plus their @channel, and the app polls
   * `PATCH /v1/connect/telegram` until it takes. There is no consent screen to
   * send anyone to.
   *
   * `null` rather than a string, so the type system makes "Telegram cannot use
   * the OAuth path" a fact a caller must handle rather than a discovery made at
   * runtime when `connectUrl` throws MISSING_FIELDS — which is exactly how it was
   * found, as a "Couldn't start the connection" under a button that could never
   * have started one.
   */
  telegram: null,
}

/** Zernio's connect name, or null where this channel has no OAuth flow. */
export function connectPlatformFor(channel: Channel): string | null {
  return CONNECT_PLATFORM[channel]
}
