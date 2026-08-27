import type { Channel } from '../enums'
import type { ActionType } from '../ledger/pricing'

/**
 * Constraint Engine v0. Declarative per-platform specs + pure validation/formatting,
 * living in @sahoda/shared so the editor (apps/web) AND the adapters
 * (packages/publishing) consume ONE source. Adapters add network I/O on top; they
 * never redefine limits. Surcharges reference a pricing key, never a raw number (D12).
 */
export interface PlatformSpec {
  channel: Channel
  publishable: boolean
  maxChars: number
  linkPolicy: 'counted_fixed' | 'plain' | 'discouraged'
  maxHashtags?: number
  mediaTypes: string[]
  maxMediaMB: number
  maxMediaCount: number
  /**
   * Media is MANDATORY on this channel — there is no text-only post (doc 13 §6:
   * Instagram). Previously the engine only ever capped media with an upper bound,
   * so a caption-only Instagram variant returned `violations: []` and the editor
   * showed green on a post that cannot exist.
   */
  requiresMedia?: boolean
  imageDims?: { minW: number; minH: number; aspectRange?: [number, number] }
  gbp?: { ctaTypes: string[]; supportsOffer: boolean }
  surchargeAction?: ActionType
  /**
   * The most posts this channel accepts from one account in a UTC day.
   *
   * ── IT WAS DECLARED ON ALL FOUR CHANNELS AND READ BY NOTHING ────────────────
   * From the Constraint Engine's first commit until 2026-08-20 no code path
   * anywhere referenced this field. A limit that exists and does nothing is worse
   * than no limit: it reads, to anyone auditing the specs, as a cap that is being
   * enforced. `checkPerDayCap` and `perDayCapWindowStart` below are what read it,
   * and `runPublishPost` is what calls them — on the one function every entry into
   * publishing passes through, so there is no rail around it.
   */
  perDayCap: number
  scheduleMinLeadMinutes: number
}

/** A media item as the adapter will send it — a public URL plus what the platform needs. */
export interface MediaRef {
  url: string
  mime: string
  bytes?: number
  altText?: string
}

/**
 * `media` is on EVERY arm, not just instagram.
 *
 * It began instagram-only because instagram was the only channel that could not
 * accept text alone (doc 13 §6). Once x, gbp and linkedin also publish through
 * Zernio they receive media the same way — as a public URL the platform fetches —
 * so the field belongs to the shape rather than to one channel. It is `[]` for a
 * text-only post, which is a legal state everywhere except instagram, and that
 * one difference is expressed by `requiresMedia` on the spec rather than by the
 * type.
 */
export type FormattedContent =
  | { channel: 'x'; text: string; media: MediaRef[]; mediaIds?: string[] }
  | {
      channel: 'gbp'
      summary: string
      media: MediaRef[]
      ctaType?: string
      ctaUrl?: string
      offer?: { title: string; terms?: string }
    }
  | { channel: 'linkedin'; text: string; media: MediaRef[] }
  | { channel: 'instagram'; caption: string; media: MediaRef[] }

/**
 * The words that will actually appear on the platform, whatever the channel
 * called the field.
 *
 * Four arms name the same thing four ways (`text`, `summary`, `caption`), which
 * is correct for adapters — each mirrors its platform's own API — and useless
 * for anything that reads the post rather than sends it. The refusal gate is the
 * first such reader: it must check what goes out, including the hashtag tail
 * `formatForPlatform` appends, and a gate that read `variant.body` instead would
 * miss a red line written into a hashtag.
 */
export function publishedTextOf(content: FormattedContent): string {
  switch (content.channel) {
    case 'x':
    case 'linkedin':
      return content.text
    case 'gbp':
      return content.summary
    case 'instagram':
      return content.caption
  }
}

export interface ConstraintViolation {
  code: string
  message: string
  field?: string
}

export interface VariantDraft {
  body: string
  hashtags?: string[]
  hasLink?: boolean
  mediaCount?: number
  /**
   * Whether the published keyword tail wears its brackets.
   *
   * ABSENT MEANS TRUE, and that is load-bearing rather than a shrug. Brackets
   * are what §34 shipped and what every row written since then publishes; making
   * absence mean `false` would silently change what those posts put out. A
   * writer who wants plain words unticks the box, which writes `false`.
   */
  keywordBrackets?: boolean
}

export interface MediaAttachment {
  mime: string
  bytes: number
  width?: number
  height?: number
}

const GBP_CTA_TYPES = ['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL']
const MB = 1024 * 1024
/** A t.co-wrapped link counts as a fixed 23 chars on X regardless of real length. */
const X_LINK_WEIGHT = 23
const SCHEDULE_MIN_LEAD_MINUTES = 5

/** The single declarative source consumed by editor validation AND adapter formatting. */
export const CONSTRAINTS: Record<Channel, PlatformSpec> = {
  x: {
    channel: 'x',
    publishable: true,
    maxChars: 280,
    linkPolicy: 'counted_fixed',
    mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxMediaMB: 5,
    maxMediaCount: 4,
    imageDims: { minW: 4, minH: 4 },
    perDayCap: 100,
    scheduleMinLeadMinutes: SCHEDULE_MIN_LEAD_MINUTES,
  },
  gbp: {
    channel: 'gbp',
    publishable: true,
    maxChars: 1500,
    linkPolicy: 'plain',
    mediaTypes: ['image/jpeg', 'image/png'],
    maxMediaMB: 5,
    maxMediaCount: 1,
    imageDims: { minW: 250, minH: 250 },
    gbp: { ctaTypes: GBP_CTA_TYPES, supportsOffer: true },
    perDayCap: 10,
    scheduleMinLeadMinutes: SCHEDULE_MIN_LEAD_MINUTES,
  },
  linkedin: {
    channel: 'linkedin',
    publishable: true,
    maxChars: 3000,
    linkPolicy: 'plain',
    mediaTypes: ['image/jpeg', 'image/png'],
    maxMediaMB: 5,
    maxMediaCount: 9,
    perDayCap: 10,
    scheduleMinLeadMinutes: SCHEDULE_MIN_LEAD_MINUTES,
  },
  instagram: {
    channel: 'instagram',
    // Publishable via the Zernio rail — our app holds no Meta credential and files
    // no Meta app review; Zernio owns both (doc 13 §7, confirmed [LIVE]).
    publishable: true,
    maxChars: 2200,
    linkPolicy: 'discouraged',
    maxHashtags: 30,
    mediaTypes: ['image/jpeg', 'image/png'],
    maxMediaMB: 8,
    maxMediaCount: 10,
    // There is no text-only Instagram post. Without this the editor showed green
    // on a caption-only variant that Meta rejects at publish time.
    requiresMedia: true,
    // Instagram was the ONLY channel with no imageDims, so `validateMedia`'s
    // `if (spec.imageDims && …)` guard skipped it entirely and `aspectRange` — a
    // field PlatformSpec already declared — was never read for the one channel
    // that needs it. A 1080×1920 phone photo (0.56) used to pass.
    // ── 0.75, NOT 0.8, AND THE VENDOR'S OWN VALIDATOR SETTLED IT ────────────
    // MEASURED 2026-08-20 against `POST /v1/tools/validate/post`, at the
    // boundary rather than near it: a 750×1000 image (0.7500) is accepted and a
    // 749×1000 image (0.7490) is refused with *"Aspect ratio 0.75:1 is outside
    // Instagram's allowed range (0.75 to 1.91)"*. The upper end is confirmed the
    // same way — 1910×1000 passes, 1911×1000 does not.
    //
    // The old floor of 0.8 was [DOC]-sourced and it was WRONG IN THE DIRECTION
    // THAT COSTS A CUSTOMER A POST: every image between 0.75 and 0.80 — which
    // includes plenty of ordinary upright phone crops — was refused by us and
    // would have been accepted by Instagram. Loosening on primary evidence is
    // safe in a way that tightening on a summarised page is not, which is why
    // this is the ONLY bound docs/31 §6.3 listed that this lane changed. The
    // other five are recorded in docs/32 with the control that shows the
    // validator never looked at them.
    //
    // Reproduce: `node scripts/zernio/validate-probe.mjs` → group `ig-aspect-feed`.
    imageDims: { minW: 320, minH: 320, aspectRange: [0.75, 1.91] },
    perDayCap: 25,
    scheduleMinLeadMinutes: SCHEDULE_MIN_LEAD_MINUTES,
  },
}

/**
 * Normalise the hashtag list into the exact tokens that will be published.
 *
 * Empty and whitespace-only entries are dropped, a missing `#` is added, and
 * duplicates are removed — a platform counts `#chai` once however many times it
 * appears, so counting it twice here would block a post that is actually fine.
 * Order is preserved because the writer chose it.
 *
 * Exported because the character meter, the validator and the formatter must all
 * be looking at the SAME tokens. That was the defect: the meter counted the raw
 * list, the formatter emitted nothing at all, and the two never had to agree.
 */
export function normalizeHashtags(hashtags: readonly string[] | undefined): string[] {
  if (hashtags === undefined) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of hashtags) {
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed === '#') continue
    const tag = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

/**
 * The tail appended to a body when hashtags are published: a blank line, then the
 * tags separated by single spaces. One definition, used by both the counter and
 * the formatter, so the number on screen describes the string that goes out.
 *
 * KEPT, and no longer on the publish path. `keywordTail` is what `formatForPlatform`
 * and `charCountFor` now use — see the block below for the founder's ruling. This
 * stays because the two functions are what PROVES the change: `hashtag-format.test.ts`
 * renders the same stored list through both and asserts they differ, so a silent
 * revert to the `#` form fails rather than passing quietly.
 */
export function hashtagTail(hashtags: readonly string[] | undefined): string {
  const tags = normalizeHashtags(hashtags)
  return tags.length === 0 ? '' : `\n\n${tags.join(' ')}`
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * KEYWORDS, NOT HASHTAGS — `[marketing]` rather than `#marketing`
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Founder's ruling, from the caption brief: "There are supposed to be keywords
 * instead of hashtags in the following format : [marketing]". Recorded in full,
 * with what it costs, as REQUESTS §34.
 *
 * ── THE STORED FIELD DOES NOT CHANGE, AND THAT IS DELIBERATE ─────────────────
 * `post_variants.extras.hashtags` is untyped jsonb holding a `string[]`, and
 * production rows already carry `#chai`-shaped values. Renaming the KEY would
 * orphan every one of them; renaming the CONCEPT costs nothing. So the storage
 * key stays `hashtags` and only the rendering moves.
 *
 * ── WHICH IS WHY THE NORMALISER STRIPS A LEADING HASH ────────────────────────
 * A row written before this ruling holds `#chai`. Wrapping that naively yields
 * `[#chai]`, which is neither format and looks like a bug. The `#` comes off
 * first, so old rows render in the new form on read with no migration.
 */

/** A keyword token, bare — no `#`, no brackets, no surrounding whitespace. */
function bareKeyword(raw: string): string {
  const trimmed = raw.trim()
  // Both legacy shapes, in either order: `#chai`, `[chai]`, and `[#chai]`.
  const unwrapped =
    trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1).trim() : trimmed
  return unwrapped.startsWith('#') ? unwrapped.slice(1).trim() : unwrapped
}

/**
 * Normalise the keyword list into the exact tokens that will be published.
 *
 * The same contract `normalizeHashtags` has: empties dropped, duplicates removed
 * case-insensitively, order preserved because the writer chose it. What differs
 * is the shape — `[marketing]`, not `#marketing`.
 *
 * A keyword may contain SPACES, and that is the point of the brackets. `#chai
 * pune` is two hashtags; `[chai pune]` is one keyword, which is what somebody
 * searching actually types. `normalizeHashtags` could never express that.
 */
export function normalizeKeywords(
  keywords: readonly string[] | undefined,
  brackets = true,
): string[] {
  if (keywords === undefined) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of keywords) {
    if (typeof raw !== 'string') continue
    const bare = bareKeyword(raw)
    if (bare === '') continue
    const key = bare.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(brackets ? `[${bare}]` : bare)
  }
  return out
}

/**
 * The tail appended to a body when keywords are published: a blank line, then the
 * bracketed keywords separated by single spaces.
 *
 * ── THIS PUBLISHES LITERALLY, AND THE READER SEES IT BEFORE IT DOES ──────────
 * `[marketing]` reaches the platform exactly as written. That is the literal
 * reading of the ruling, and it is the reading the product can most easily
 * correct: `charCountFor` counts this tail and `PublishPreview` renders it, so
 * the bracketed list is on screen and inside the character meter before anybody
 * presses Send. If the brackets are meant to be stripped at publish, this
 * function is the only place that changes.
 */
export function keywordTail(keywords: readonly string[] | undefined, brackets = true): string {
  const tokens = normalizeKeywords(keywords, brackets)
  return tokens.length === 0 ? '' : `\n\n${tokens.join(' ')}`
}

/**
 * Effective character count (code points; an X link is weighted at 23).
 *
 * ── WHY HASHTAGS ARE COUNTED HERE ────────────────────────────────────────────
 * They are published as part of the caption, so they cost characters. Before this
 * they were validated for COUNT (`maxHashtags`) and then silently discarded by
 * `formatForPlatform`, which meant the composer offered a hashtag box whose
 * contents never reached any platform — and, had they reached it, a caption at
 * exactly 2200 characters plus thirty tags would have been rejected by Instagram
 * while the meter showed green.
 *
 * Counting the normalised tail rather than the raw list is deliberate: it is the
 * string that will actually be sent, including the separating blank line.
 */
export function charCountFor(spec: PlatformSpec, draft: VariantDraft): number {
  const base =
    Array.from(draft.body).length +
    Array.from(keywordTail(draft.hashtags, draft.keywordBrackets ?? true)).length
  if (spec.linkPolicy === 'counted_fixed' && draft.hasLink) {
    return base + X_LINK_WEIGHT
  }
  return base
}

/** Validate a per-channel variant against its spec (used by the editor and adapter formatting). */
export function validateVariant(
  spec: PlatformSpec,
  draft: VariantDraft,
): { violations: ConstraintViolation[]; charCount: number } {
  const violations: ConstraintViolation[] = []
  const charCount = charCountFor(spec, draft)
  if (charCount > spec.maxChars) {
    violations.push({
      code: 'MAX_CHARS',
      message: `${spec.channel} allows ${spec.maxChars} characters; this has ${charCount}.`,
      field: 'body',
    })
  }
  /**
   * ── THE CAP STAYS; ITS SENTENCE HAD TO CHANGE ──────────────────────────────
   * It read "instagram allows 30 hashtags." That number IS Instagram's hashtag
   * limit, and it stopped describing this field the moment the field stopped
   * holding hashtags (REQUESTS §34). Publishing `[a] … [31]` is not something
   * Instagram refuses, so attributing the refusal to Instagram was false.
   *
   * The rule is worth keeping — a thirty-item tail is a real thing to stop, and
   * dropping it would leave `violation-copy.ts`'s MAX_HASHTAGS entry and its
   * fix-it button guarding nothing. So Sahoda owns the limit and says so.
   *
   * The CODE stays `MAX_HASHTAGS`: it is a stored, matched string across
   * `violation-copy.ts`, the fix-it table and the publish logs, and renaming it
   * is a data change rather than a copy change.
   */
  if (spec.maxHashtags !== undefined && (draft.hashtags?.length ?? 0) > spec.maxHashtags) {
    violations.push({
      code: 'MAX_HASHTAGS',
      message: `Sahoda takes at most ${spec.maxHashtags} keywords per ${spec.channel} post.`,
      field: 'hashtags',
    })
  }
  if ((draft.mediaCount ?? 0) > spec.maxMediaCount) {
    violations.push({
      code: 'MAX_MEDIA_COUNT',
      message: `${spec.channel} allows ${spec.maxMediaCount} media items.`,
      field: 'media',
    })
  }
  // The lower bound. Until this existed the only media check was a CAP, so zero
  // media passed on a channel where zero media is unpublishable.
  if (spec.requiresMedia === true && (draft.mediaCount ?? 0) < 1) {
    violations.push({
      code: 'MEDIA_REQUIRED',
      message: `${spec.channel} needs at least one photo. There is no text-only post.`,
      field: 'media',
    })
  }
  return { violations, charCount }
}

/** Validate a single attachment against every selected channel's spec, AT ATTACH TIME (FSD 3.1). */
export function validateMedia(
  specs: PlatformSpec[],
  media: MediaAttachment,
): { channel: Channel; violations: ConstraintViolation[] }[] {
  return specs.map((spec) => {
    const violations: ConstraintViolation[] = []
    if (!spec.mediaTypes.includes(media.mime)) {
      violations.push({
        code: 'MEDIA_TYPE',
        message: `${spec.channel} does not accept ${media.mime}.`,
        field: 'mime',
      })
    }
    if (media.bytes > spec.maxMediaMB * MB) {
      violations.push({
        code: 'MEDIA_SIZE',
        message: `${spec.channel} media must be ≤ ${spec.maxMediaMB} MB.`,
        field: 'bytes',
      })
    }
    if (spec.imageDims && media.width !== undefined && media.height !== undefined) {
      if (media.width < spec.imageDims.minW || media.height < spec.imageDims.minH) {
        violations.push({
          code: 'MEDIA_DIMS',
          message: `${spec.channel} images must be ≥ ${spec.imageDims.minW}×${spec.imageDims.minH}.`,
          field: 'dimensions',
        })
      }
      // Aspect ratio. `aspectRange` was declared on PlatformSpec from the start and
      // read by nothing — the check that would have caught a portrait phone photo
      // on the one channel that rejects them.
      const range = spec.imageDims.aspectRange
      if (range && media.height > 0) {
        const aspect = media.width / media.height
        if (aspect < range[0] || aspect > range[1]) {
          violations.push({
            code: 'MEDIA_ASPECT',
            message: `${spec.channel} feed photos must be between ${range[0]}:1 and ${range[1]}:1. This one is ${aspect.toFixed(2)}:1.`,
            field: 'dimensions',
          })
        }
      }
    }
    return { channel: spec.channel, violations }
  })
}

/**
 * Format a validated variant into the exact per-platform payload the adapter sends.
 *
 * `media` is threaded through because `formatForPlatform` previously returned
 * `{ channel:'instagram', caption }` — one field, no media — so even a variant WITH
 * photos lost them here. The formatter structurally could not express a legal
 * Instagram post; that is why this takes media rather than the adapter re-fetching it.
 */
export function formatForPlatform(
  spec: PlatformSpec,
  variant: VariantDraft,
  media: MediaRef[] = [],
): FormattedContent {
  // The hashtags the writer typed, appended to the text that goes out.
  //
  // They used to be dropped here for every channel while `validateVariant` went on
  // policing `maxHashtags` — a field that was counted, limited, and then thrown
  // away. GBP is the one exception: `linkPolicy: 'plain'` aside, a Google Business
  // post is a local business update and hashtags do nothing there, so the box is
  // simply not part of that channel's output.
  const body =
    spec.channel === 'gbp'
      ? variant.body
      : variant.body + keywordTail(variant.hashtags, variant.keywordBrackets ?? true)

  switch (spec.channel) {
    case 'x':
      return { channel: 'x', text: body, media }
    case 'gbp':
      return { channel: 'gbp', summary: body, media }
    case 'linkedin':
      return { channel: 'linkedin', text: body, media }
    case 'instagram':
      return { channel: 'instagram', caption: body, media }
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE PER-DAY CAP — the half of the Constraint Engine that was never wired
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * `PlatformSpec.perDayCap` has carried a number for every channel since the engine
 * was written (x 100, gbp 10, linkedin 10, instagram 25) and, until 2026-08-20,
 * nothing read it. A grep for the identifier returned four declarations and zero
 * call sites.
 *
 * ── WHY THAT IS WORSE THAN HAVING NO CAP ─────────────────────────────────────
 * An unenforced limit still LOOKS like a limit. Anyone reading the specs — a
 * reviewer, an adapter author, the person deciding whether a bulk schedule is safe
 * — reads `perDayCap: 25` as a promise that the 26th Instagram post of a day will
 * be refused here. It was not. It went to the platform and was refused THERE, or
 * worse, was accepted and counted against a limit the account holder never saw.
 *
 * ── WHOSE LIMIT THIS IS, STATED SO THE COPY CAN BE HONEST ────────────────────
 * These are PLATFORM caps, unlike `X_MONTHLY_RATION` in @sahoda/publishing, which
 * is Sahoda's own spending decision. The two must never be described in the same
 * words: one is "the channel will not take more today", the other is "we will not
 * pay for more this month". A message that blamed the platform for Sahoda's budget
 * — or Sahoda for the platform's rule — would be a fabricated reason attached to a
 * remedy that does not work.
 */

/** Codes recorded on the refusal. Distinct from anything a platform itself returns. */
export const PER_DAY_CAP_EXHAUSTED_CODE = 'PER_DAY_CAP_EXHAUSTED'

/** Recorded when the day's count could not be READ. Not the same as exhausted. */
export const PER_DAY_CAP_UNREADABLE_CODE = 'PER_DAY_CAP_UNREADABLE'

/**
 * First instant of the UTC day the cap is counted over.
 *
 * UTC, and the reason is the same one `xRationWindowStart` gives: a workspace-local
 * day would make the boundary a per-tenant question nothing in the schema can
 * answer, and the platforms that publish these limits count them in UTC.
 *
 * Exported so the editor and the publish path share ONE window. Two definitions
 * that drifted by a timezone would show a customer one number and refuse them on
 * another — which is exactly the defect `xRationWindowStart` was extracted to stop.
 */
export function perDayCapWindowStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export interface PerDayCapVerdict {
  /** False means: do not send, and do not spend anything on the way to finding out. */
  allowed: boolean
  channel: Channel
  used: number
  cap: number
  /** Never negative — a day that somehow ran over reads as 0 left, not -3. */
  remaining: number
}

/**
 * The cap, answered.
 *
 * `used` MUST be a count of LIVE, SUCCEEDED sends. A count of `publish_status =
 * 'published'` variants would be wrong in the direction that matters: fixtures
 * carry that status without ever reaching a platform, so the cap would refuse a
 * customer over posts that were never sent.
 */
export function checkPerDayCap(args: { channel: Channel; used: number }): PerDayCapVerdict {
  const cap = CONSTRAINTS[args.channel].perDayCap
  // `Math.trunc` on a NEGATIVE would keep it negative and make `remaining` larger
  // than the cap — a cap that got more generous the more wrong the count was.
  const used = Math.max(0, Math.trunc(args.used))
  const remaining = Math.max(0, cap - used)
  return { allowed: remaining > 0, channel: args.channel, used, cap, remaining }
}

/** Names the number, names whose number it is, and gives the remedy that works. */
export function perDayCapRefusalMessage(verdict: PerDayCapVerdict): string {
  return (
    `This workspace has already published ${verdict.used} of the ${verdict.cap} posts ` +
    `${verdict.channel} accepts in a day. It is the channel's own limit, not a Sahoda one. ` +
    `the post is held until tomorrow, and nothing was sent. Other channels are unaffected.`
  )
}
