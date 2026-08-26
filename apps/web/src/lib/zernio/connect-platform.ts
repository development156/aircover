import { type ConnectionPlatform } from '@sahoda/shared'

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
 * MEASURED 2026-08-26 by PROBING the live endpoint, one platform per request,
 * `GET /v1/connect/{platform}?profileId=…` against a real profile:
 *
 *   200 + authUrl  twitter instagram facebook linkedin googlebusiness discord
 *                  pinterest reddit slack threads tiktok whatsapp youtube bluesky
 *   200 + code     telegram — {code, expiresAt, expiresIn, botUsername, instructions}
 *   400            x  gbp  google_business  mastodon  medium  substack
 *   403            snapchat — PLATFORM_BETA_RESTRICTED
 *
 * The probe replaced a list read out of `docs.zernio.com/llms-full.txt`, which
 * named `x`, `mastodon`, `medium` and `substack` as connectable (all four are
 * 400) and omitted `reddit`, `slack` and `googlebusiness` (all three are 200).
 * Documentation is not a measurement, and this file exists because a name that
 * looks right is not one.
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
export const CONNECT_PLATFORM: Readonly<Record<ConnectionPlatform, string | null>> = {
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

  /**
   * ── THE EIGHT WHOSE NAME IS SIMPLY THEIR NAME ──────────────────────────────
   * Every one MEASURED 2026-08-26, one probe each against
   * `GET /v1/connect/{platform}` with a live profile id: all eight answered
   * HTTP 200 with an `authUrl` under exactly the id written here.
   *
   * Written out rather than defaulted through `?? channel`. A default would have
   * silently produced `/connect/x` and `/connect/gbp` — the precise bug at the
   * top of this file, where a plausible fallback shipped two buttons that could
   * never work. An exhaustive `Record` makes a new platform a compile error and
   * makes every value here something somebody had to type on purpose.
   */
  discord: 'discord',
  pinterest: 'pinterest',
  reddit: 'reddit',
  slack: 'slack',
  threads: 'threads',
  tiktok: 'tiktok',
  whatsapp: 'whatsapp',
  youtube: 'youtube',
}

/** Zernio's connect name, or null where this platform has no OAuth flow. */
export function connectPlatformFor(platform: ConnectionPlatform): string | null {
  return CONNECT_PLATFORM[platform]
}
