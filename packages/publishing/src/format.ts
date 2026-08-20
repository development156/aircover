/**
 * `@sahoda/publishing/format` — the browser-safe leaf that answers everything
 * about what KIND of post a channel version is.
 *
 * ── WHY THIS LIVES HERE AND NOT IN @sahoda/shared ────────────────────────────
 * The Constraint Engine is the natural home and it is a frozen contract, so the
 * format dimension cannot be added to `PlatformSpec`. Everything derivable is
 * therefore DERIVED from the fields the spec already has — `mediaTypes`,
 * `requiresMedia`, `maxMediaCount` — rather than restating rules beside them. If
 * the frozen contract ever gains a video mime, `video` stops being refused with
 * no second list to remember.
 *
 * ── AND IT IS A LEAF, WHICH IS LOAD-BEARING ─────────────────────────────────
 * This entry point exists so a BROWSER bundle can reach these rules without
 * reaching the package barrel. The barrel pulls `oauth/x.ts`, which imports
 * `node:crypto`; a client component that value-imports from it fails the
 * production build with
 * `UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins`.
 *
 * That is not hypothetical — it broke the 2026-08-19 deploy, and nothing caught
 * it, because `turbo build` sits OUTSIDE `pnpm gate`. A type-only import from the
 * barrel is erased and harmless; a value import is not. `no-client-barrel.test.ts`
 * fails on the value form.
 *
 * So the only imports anywhere below this file are TYPES, and nothing may be
 * added that is not.
 *
 * Three modules, split at the seams that are actually different questions:
 *   · format-vocabulary — the strings the database column accepts
 *   · format-rules      — what each format needs, per channel
 *   · format-refusal    — why a given version cannot go out as what it claims
 */

export { POST_FORMATS, isPostFormat, type PostFormat } from './format-vocabulary'

export {
  CHANNEL_FORMATS,
  FORMAT_MEDIA,
  acceptsMultipleMedia,
  acceptsTextOnly,
  acceptsVideo,
  defaultFormatFor,
  formatsFor,
  mediaRuleFor,
  type FormatMediaRule,
  type ResolvedMediaRule,
} from './format-rules'

export {
  refuseFormat,
  refuseFormatMedia,
  type FormatAttachment,
  type FormatRefusal,
} from './format-refusal'

// The thread split. `thread-split` is pure with NO imports at all; `thread-plan`
// value-imports `charCountFor` from `@sahoda/shared`, which is browser-safe — the
// banned barrels are `@sahoda/publishing`, `@sahoda/billing` and `@sahoda/mesh`
// (see `no-client-barrel.test.ts`), and a `'use client'` component already
// value-imports `CONSTRAINTS` from shared today.
export {
  splitIntoThread,
  describeThread,
  countCodePoints,
  type ThreadSegment,
} from './thread-split'
// The per-channel controls, and the rules that make each valid. Reachable from
// the browser so the composer runs the SAME refusal the publish path runs — a
// second copy of "2 to 4 answers" is how an editor and a publisher come to
// disagree. Only a TYPE crosses from outside this package.
export {
  refusePoll,
  refuseGbpTopic,
  parseIsoDate,
  LINKEDIN_POLL_DURATIONS,
  POLL_MIN_OPTIONS,
  POLL_MAX_OPTIONS,
  X_POLL_OPTION_MAX,
  X_POLL_MIN_MINUTES,
  X_POLL_MAX_MINUTES,
  LINKEDIN_POLL_QUESTION_MAX,
  INSTAGRAM_MAX_COLLABORATORS,
  type VariantOptions,
  type PollOption,
  type GbpEventOption,
  type GbpOfferOption,
} from './zernio/variant-options'

export {
  planThread,
  segmentLimitFor,
  linkWeightOf,
  type ThreadPlan,
  type ThreadPlanResult,
} from './thread-plan'
