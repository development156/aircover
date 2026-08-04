import { CONSTRAINTS, ChannelSchema } from '@sahoda/shared'

/**
 * The private Supabase bucket media lives in. Its RLS policies require the first
 * path segment to be the workspace uuid — see `media-path.ts`, which is the only
 * thing allowed to build a key for it.
 */
export const MEDIA_BUCKET = 'media'

/**
 * Hard ceiling on an upload, DERIVED from the Constraint Engine rather than
 * restated: a file bigger than the most generous channel's `maxMediaMB` cannot
 * be posted anywhere, so accepting it would only mean storing something the
 * writer can never use. If a channel's limit rises, this rises with it — and
 * `next.config.ts`'s `serverActions.bodySizeLimit` must be raised to match, or
 * the request is rejected by the framework before this message can be shown.
 */
export const MEDIA_UPLOAD_CAP_BYTES: number =
  Math.max(...ChannelSchema.options.map((channel) => CONSTRAINTS[channel].maxMediaMB)) * 1_000_000
