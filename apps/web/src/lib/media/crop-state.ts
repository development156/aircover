import type { ChannelRejection } from '../posts/attach-decision'

/**
 * What accepting a crop returns. Outside the `'use server'` module for the
 * reason `media-state.ts` gives: such a file may export only async functions.
 *
 * `warnings` are the channels that STILL will not take the cropped file — a
 * photo too small for Google Business is still too small after a crop. They are
 * carried rather than dropped, so a person is never told the fix worked for
 * channels it did not work for.
 */
export type AcceptCropState =
  | { ok: true; warnings: ChannelRejection[]; message: string }
  | { ok: false; message: string }
