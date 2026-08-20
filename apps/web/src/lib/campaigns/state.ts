/**
 * Action state types for the campaign writes.
 *
 * They live here and not in `app/actions/campaigns.ts` because a `'use server'`
 * module may export only async functions — re-exporting a type from one makes
 * Turbopack dev emit a runtime `ReferenceError` that 500s every route importing
 * the action (LEARNINGS.md:21). Same reason `lib/posts/state.ts` exists.
 */

/** Creating or editing a campaign. The id comes back so a caller can navigate. */
export type CampaignSaveState =
  | { ok: true; campaignId: string }
  | {
      ok: false
      message: string
      /**
       * The field the refusal is about, so a form can put the sentence beside
       * the input rather than in a toast the user has to map back onto a box.
       * Absent when the refusal is about the request as a whole.
       */
      field?: 'name' | 'objective' | 'dates'
    }

/** Adding or removing posts. `changed` is a real count of rows written. */
export type CampaignPostsState = { ok: true; changed: number } | { ok: false; message: string }

export type CampaignDeleteState = { ok: true } | { ok: false; message: string }
