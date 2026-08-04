import type { PostMedia } from '@sahoda/shared'

import type { ChannelRejection } from './attach-decision'

/**
 * Media action state. Lives outside the `'use server'` module that returns it —
 * such a file may export only async functions, and re-exporting a type from one
 * makes Turbopack dev emit a runtime `ReferenceError` that 500s every route
 * importing the action (LEARNINGS.md).
 */

/**
 * `warnings` on the success arm are channels that will NOT use the file even
 * though it was attached — a gif is fine for X and useless for GBP. They are
 * carried rather than dropped so the editor can say so; an attach that silently
 * ignored half the post's channels would read as fully successful.
 */
export type AttachMediaState =
  | { ok: true; media: PostMedia; warnings: ChannelRejection[] }
  | { ok: false; message: string; rejections?: ChannelRejection[] }

export type DetachMediaState = { ok: true } | { ok: false; message: string }
