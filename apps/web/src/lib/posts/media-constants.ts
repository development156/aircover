import { CONSTRAINTS, ChannelSchema } from '@sahoda/shared'

/**
 * The private Supabase bucket media lives in. Its RLS policies require the first
 * path segment to be the workspace uuid — see `media-path.ts`, which is the only
 * thing allowed to build a key for it.
 */
export const MEDIA_BUCKET = 'media'

/**
 * The most generous channel's own ceiling, DERIVED from the Constraint Engine
 * rather than restated. A file bigger than this cannot be posted anywhere, so
 * accepting it would only mean storing something the writer can never use.
 *
 * This is no longer the upload cap. It is the upper bound the upload cap may
 * never exceed, and it moves on its own when a channel's `maxMediaMB` moves.
 */
export const CHANNEL_MEDIA_CAP_BYTES: number =
  Math.max(...ChannelSchema.options.map((channel) => CONSTRAINTS[channel].maxMediaMB)) * 1_000_000

/**
 * What the hosting platform will carry in a function request body, whatever this
 * application says.
 *
 * https://vercel.com/docs/functions/limitations: a Vercel Function request body
 * over 4.5 MB is answered `413 FUNCTION_PAYLOAD_TOO_LARGE` at the edge, BEFORE
 * Next runs. Media attach posts the file through a server action (see
 * `posts-media.ts` for why the bytes have to reach the server), so the file is
 * the request body and this is a hard ceiling on it.
 */
export const PLATFORM_REQUEST_CAP_BYTES = 4_500_000

/**
 * Hard ceiling on an upload: the LOWER of what a channel accepts and what the
 * platform will carry.
 *
 * ── WHY IT IS NO LONGER THE CONSTRAINT ENGINE'S NUMBER ALONE ─────────────────
 * It was `max(maxMediaMB) × 1,000,000` — Instagram's 8 MB — and
 * `next.config.ts` allowed a 12 MB server-action body to match. Vercel refuses
 * anything over 4.5 MB at the edge, so a 6 MB photo was accepted by `next start`
 * on a laptop and answered with a generic error boundary on
 * app.sahodalabs.com, while the screen promised 8 MB. Every local test passed,
 * because none of them runs behind Vercel's edge.
 *
 * 4,000,000 rather than 4,500,000: the body carries the multipart envelope and
 * the post id as well as the file, `next.config.ts` sets `bodySizeLimit: '4mb'`
 * (4,194,304 binary bytes), and a cap that only just fits refuses nothing until
 * a customer finds the gap. `media-constants.test.ts` reads the config and holds
 * the three numbers together.
 *
 * A channel limit that DROPS below this still wins, which is what the `min`
 * keeps live. Raising the ceiling is not a matter of raising this constant: it
 * needs the signed direct-to-storage upload plus a server-side re-read that
 * `next.config.ts` names, because the 4.5 MB is not ours to move.
 */
export const MEDIA_UPLOAD_CAP_BYTES: number = Math.min(CHANNEL_MEDIA_CAP_BYTES, 4_000_000)

/**
 * The same ceiling in whole decimal megabytes, which is what a file browser
 * shows and therefore what a customer is told.
 *
 * Rounded DOWN, always: "up to 4 MB" has to be true of a 4 MB file, and rounding
 * 4.5 up to "5 MB" would promise a file the server refuses.
 */
export const MEDIA_UPLOAD_CAP_MB: number = Math.floor(MEDIA_UPLOAD_CAP_BYTES / 1_000_000)
