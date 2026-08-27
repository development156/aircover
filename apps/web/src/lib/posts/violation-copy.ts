import { CONSTRAINTS } from '@sahoda/shared'
import type { ConstraintViolation } from '@sahoda/shared'

/**
 * Editor copy for Constraint Engine violations.
 *
 * This module is the last gate before violation text reaches a screen, so it is
 * built as an ALLOWLIST, not a denylist. A `ConstraintViolation` is a plain
 * `{ code, message, field }` bag that anything upstream can populate, so its
 * `message` is treated as untrusted: it is rendered only when it matches the
 * exact shape the engine emits for that code, and is otherwise replaced with
 * per-code safe copy.
 *
 * A denylist ("reject text containing SQLSTATE, stack frames, …") cannot work
 * here — every such list is one unlisted Postgres phrasing away from leaking
 * (`duplicate key value violates unique constraint "post_variants_pkey"` names a
 * table and trips no keyword filter). The shape gate below is closed by
 * construction: nothing reaches the UI unless it looks exactly like engine copy.
 *
 * The cost of an allowlist is silent degradation if engine copy is reworded, so
 * `violation-copy.test.ts` drives every pattern from real `validateVariant` /
 * `validateMedia` output — engine drift fails that test loudly instead of
 * quietly downgrading users to generic text.
 *
 * Pure module: no I/O, no React, no clock.
 */

export interface ViolationDisplay {
  code: string
  /** Safe user-facing text. Never raw DB, SQL, key or stack-trace content. */
  message: string
  field?: string
  /** Verb-first CTA, or undefined when the editor has no one-click fix. */
  fixLabel?: string
}

const KNOWN_CODES = [
  'MAX_CHARS',
  'MAX_HASHTAGS',
  'MAX_MEDIA_COUNT',
  'MEDIA_TYPE',
  'MEDIA_SIZE',
  'MEDIA_DIMS',
  // ── THESE TWO WERE MISSING, AND THEY ARE THE INSTAGRAM ONES ────────────────
  // MEASURED 2026-08-20 against real `validateVariant` / `validateMedia` output:
  //   engine: "instagram needs at least one photo. There is no text-only post."
  //   screen: "This does not meet the channel rules. Review it before publishing."
  //   engine: "instagram feed photos must be between 0.75:1 and 1.91:1. This one is 0.56:1."
  //   screen: "This does not meet the channel rules. Review it before publishing."
  // Both are the defects doc 13 section 10 said would go live the moment
  // Instagram became publishable. The engine was fixed and says exactly the
  // right thing; this allowlist threw both sentences away because nobody added
  // the codes.
  'MEDIA_REQUIRED',
  'MEDIA_ASPECT',
  // The format layer (packages/publishing/src/format-refusal.ts). Not the
  // Constraint Engine's, but they arrive at the same list on the same card and
  // must pass the same gate — one path to the screen, not two.
  'FORMAT_UNSUPPORTED',
  'FORMAT_NEEDS_MEDIA',
  'FORMAT_CONTRADICTED',
  'FORMAT_MEDIA_ASPECT',
  // ── THE THREAD LAYER (packages/publishing/src/thread-plan.ts) ──────────────
  // Same reasoning as the format codes above: a different source, the same card,
  // the same gate. And the same trap — a code missing from this list is not a
  // silent no-op, it is the writer being told "This does not meet the channel
  // rules" about a thread whose actual problem is a 400-character URL nobody can
  // break. That is precisely how MEDIA_REQUIRED and MEDIA_ASPECT were lost.
  'THREAD_EMPTY',
  'THREAD_UNBREAKABLE',
  'THREAD_NO_ROOM',
] as const

type KnownCode = (typeof KNOWN_CODES)[number]

const KNOWN_CODE_SET: ReadonlySet<string> = new Set<string>(KNOWN_CODES)

/**
 * One-click fixes only. Type, size and dimension problems need a different file,
 * which the editor cannot produce, so they intentionally carry no CTA.
 */
const FIX_LABELS: Readonly<Record<KnownCode, string | undefined>> = {
  MAX_CHARS: 'Trim to fit',
  MAX_HASHTAGS: 'Remove extra keywords',
  MAX_MEDIA_COUNT: 'Remove extra media',
  MEDIA_TYPE: undefined,
  MEDIA_SIZE: undefined,
  MEDIA_DIMS: undefined,
  // A missing photo needs a file, which this editor cannot conjure. The media
  // well is right there on the same screen, so a CTA would only point at it.
  MEDIA_REQUIRED: undefined,
  MEDIA_ASPECT: undefined,
  FORMAT_UNSUPPORTED: 'Pick a different kind of post',
  FORMAT_NEEDS_MEDIA: undefined,
  // The one format problem the editor CAN fix in a click: the kind says text and
  // there are photos attached, so changing the kind resolves it without touching
  // either the words or the files.
  FORMAT_CONTRADICTED: 'Change the kind of post',
  FORMAT_MEDIA_ASPECT: undefined,
  // Nothing the editor can do in one click. Every one of these needs the writer
  // to change words — shorten a link, write something — and a button that
  // rewrote their post for them is not a fix, it is a guess.
  THREAD_EMPTY: undefined,
  THREAD_UNBREAKABLE: undefined,
  THREAD_NO_ROOM: undefined,
}

/**
 * Used when the engine message does not match its expected shape. Deliberately
 * carries no numbers: this module has no verified limit to quote, and inventing
 * one would be worse than being vague.
 */
const FALLBACK_MESSAGES: Readonly<Record<KnownCode, string>> = {
  MAX_CHARS: 'This post is longer than the channel allows.',
  MAX_HASHTAGS: 'This post carries more keywords than Sahoda sends.',
  MAX_MEDIA_COUNT: 'This post has more media than the channel allows.',
  MEDIA_TYPE: 'This channel does not accept this file type.',
  MEDIA_SIZE: 'This file is larger than the channel allows.',
  MEDIA_DIMS: 'This image is smaller than the channel allows.',
  MEDIA_REQUIRED: 'This channel has no text-only post. Attach at least one photo.',
  MEDIA_ASPECT: 'This image is the wrong shape for this channel.',
  FORMAT_UNSUPPORTED: 'This channel cannot publish this kind of post.',
  FORMAT_NEEDS_MEDIA: 'This kind of post needs a photo that is not attached yet.',
  FORMAT_CONTRADICTED: 'This post is not the kind it says it is.',
  FORMAT_MEDIA_ASPECT: 'This photo is the wrong shape for this kind of post.',
  THREAD_EMPTY: 'A thread needs something written in it.',
  THREAD_UNBREAKABLE: 'Part of this is too long to split across posts.',
  THREAD_NO_ROOM: 'A link leaves no room for words on this channel.',
}

const GENERIC_MESSAGE = 'This does not meet the channel rules. Review it before publishing.'

/** Shown in place of an unrecognized code so no internal identifier reaches the UI. */
const UNKNOWN_CODE = 'UNKNOWN'

const EMPTY_SUMMARY = 'No issues'

/** Field names the editor knows how to focus. Anything else is dropped. */
const SAFE_FIELDS: ReadonlySet<string> = new Set([
  'body',
  'hashtags',
  'media',
  'mime',
  'bytes',
  'dimensions',
])

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Channel names come from the engine's own spec table, never a local copy. */
const CHANNEL = Object.keys(CONSTRAINTS).map(escapeRegExp).join('|')

/** Bounded so a pathological number or mime cannot become a wall of text. */
const NUM = String.raw`\d{1,9}`
const DECIMAL = String.raw`\d{1,9}(?:\.\d{1,3})?`
const MIME = String.raw`[a-z0-9][a-z0-9.+_-]{0,62}\/[a-z0-9][a-z0-9.+_-]{0,62}`

/**
 * The exact sentence `validateVariant` / `validateMedia` emit per code
 * (`packages/shared/src/publishing/constraints.ts`). Anchored, so a real message
 * with anything appended fails the gate.
 */
const MESSAGE_SHAPES: Readonly<Record<KnownCode, RegExp>> = {
  MAX_CHARS: new RegExp(`^(?:${CHANNEL}) allows ${NUM} characters; this has ${NUM}\\.$`),
  // ── MOVED WITH THE SENTENCE, IN THE SAME COMMIT ───────────────────────────
  // It read `^(?:instagram|…) allows 30 hashtags\.$`. The engine now says
  // "Sahoda takes at most 30 keywords per instagram post." because the number is
  // Instagram's HASHTAG limit and the field stopped holding hashtags
  // (REQUESTS §34) — attributing the refusal to Instagram was false.
  //
  // This gate's failure mode is a silent downgrade to vaguer copy, so it is
  // still anchored at both ends and still names the channel and the number.
  MAX_HASHTAGS: new RegExp(`^Sahoda takes at most ${NUM} keywords per (?:${CHANNEL}) post\\.$`),
  MAX_MEDIA_COUNT: new RegExp(`^(?:${CHANNEL}) allows ${NUM} media items\\.$`),
  MEDIA_TYPE: new RegExp(`^(?:${CHANNEL}) does not accept ${MIME}\\.$`, 'i'),
  MEDIA_SIZE: new RegExp(`^(?:${CHANNEL}) media must be ≤ ${DECIMAL} MB\\.$`),
  MEDIA_DIMS: new RegExp(`^(?:${CHANNEL}) images must be ≥ ${NUM}×${NUM}\\.$`),
  MEDIA_REQUIRED: new RegExp(
    `^(?:${CHANNEL}) needs at least one photo\\. There is no text-only post\\.$`,
  ),
  MEDIA_ASPECT: new RegExp(
    `^(?:${CHANNEL}) feed photos must be between ${DECIMAL}:1 and ${DECIMAL}:1\\. This one is ${DECIMAL}:1\\.$`,
  ),
  // ── THE FORMAT SENTENCES, AS ALTERNATIONS OF CLOSED LITERALS ───
  // `refuseFormat` emits a fixed set of sentences with the channel and a count
  // as the only variable parts, so each shape is that set anchored — the same
  // discipline the engine codes get, for the same reason: nothing reaches a
  // screen unless it looks exactly like copy this repo wrote.
  FORMAT_UNSUPPORTED: new RegExp(
    `^(?:Sahoda can’t publish video yet\\.` +
      `|(?:${CHANNEL}) has no stories\\.` +
      `|(?:${CHANNEL}) posts don’t chain into a thread\\.` +
      `|(?:${CHANNEL}) takes one photo per post, so there is no set to swipe through\\.)$`,
  ),
  FORMAT_NEEDS_MEDIA: new RegExp(
    `^(?:(?:${CHANNEL}) has no text-only post\\. This one needs at least one photo\\.` +
      `|A story is a picture\\. This one has none attached\\.` +
      `|This was written as a photo post but has no image attached\\.` +
      `|A set needs at least two images\\.)$`,
  ),
  FORMAT_CONTRADICTED: new RegExp(
    `^(?:This was written as a text-only post but has (?:an image|images) attached\\.` +
      `|This was written as a single photo but has ${NUM} attached\\. Choose a set instead\\.)$`,
  ),
  FORMAT_MEDIA_ASPECT: new RegExp(
    `^A story is taller than it is wide\\. This photo is ${DECIMAL}:1\\. ` +
      `Crop it upright, or post it to the feed instead\\.$`,
  ),
  // ── THE THREAD SENTENCES, AS CLOSED LITERALS WITH BOUNDED NUMBERS ─────────
  // `planThread` emits a fixed set; the counts are the only variable parts.
  THREAD_EMPTY: /^A thread needs something written in it\.$/,
  THREAD_UNBREAKABLE: new RegExp(
    `^This has ${NUM} characters in a row with no space to break at, and one post ` +
      `holds ${NUM}\\. Splitting it would cut it in half\\. Shorten it, or put it on ` +
      `its own line\\.$`,
  ),
  THREAD_NO_ROOM: /^A link leaves no room for words on this channel\.$/,
}

function safeField(field: string | undefined): string | undefined {
  return typeof field === 'string' && SAFE_FIELDS.has(field) ? field : undefined
}

function isKnownCode(code: string): code is KnownCode {
  return KNOWN_CODE_SET.has(code)
}

/**
 * Turn one engine violation into editor copy. Never throws: an unrecognized code
 * degrades to generic text and drops every caller-supplied detail.
 */
export function describeViolation(v: ConstraintViolation): ViolationDisplay {
  const rawCode = typeof v.code === 'string' ? v.code : ''
  const rawMessage = typeof v.message === 'string' ? v.message.trim() : ''

  if (!isKnownCode(rawCode)) {
    return { code: UNKNOWN_CODE, message: GENERIC_MESSAGE }
  }

  const message = MESSAGE_SHAPES[rawCode].test(rawMessage) ? rawMessage : FALLBACK_MESSAGES[rawCode]
  const field = safeField(v.field)
  const fixLabel = FIX_LABELS[rawCode]

  return {
    code: rawCode,
    message,
    ...(field !== undefined ? { field } : {}),
    ...(fixLabel !== undefined ? { fixLabel } : {}),
  }
}

/** One line for a collapsed channel tab: the lone problem, or how many there are. */
export function summarizeViolations(vs: readonly ConstraintViolation[]): string {
  const first = vs[0]
  if (first === undefined) return EMPTY_SUMMARY
  if (vs.length === 1) return describeViolation(first).message
  return `${vs.length} issues to fix`
}

/**
 * Presentation polish for an already-gated violation sentence.
 *
 * DELIBERATELY SEPARATE FROM `describeViolation`. That function renders the
 * engine's message VERBATIM when it matches the allowlist, and
 * `violation-copy.test.ts` has a load-bearing canary asserting exactly that —
 * the canary is how engine drift gets caught, so normalising inside the gate
 * would trade a real safety net for a cosmetic gain.
 *
 * This runs at the RENDER EDGE instead, on a string that has already passed the
 * anchored shape check, so nothing untrusted can reach it.
 *
 * Two mismatches it fixes, both visible in the editor at once:
 *   · the engine names the channel by its KEY, so a panel headed "Instagram"
 *     said "instagram allows 2200 characters"
 *   · the engine prints bare integers, so "2200" sat directly beneath a counter
 *     reading "2,200" — the same number, two formats, forty pixels apart
 */
export function presentViolation(
  message: string,
  labels: Readonly<Record<string, string>>,
): string {
  let out = message
  // Only ever the LEADING channel key: the engine always opens with it, and
  // anchoring here keeps a channel word inside prose from being rewritten.
  for (const [key, label] of Object.entries(labels)) {
    if (out.startsWith(`${key} `)) {
      out = `${label}${out.slice(key.length)}`
      break
    }
  }
  // ── ONE GRAMMAR REPAIR, ON A SENTENCE WE CANNOT EDIT AT SOURCE ────────────
  // The engine emits "gbp allows 1 media items." — `packages/shared` is a frozen
  // contract, so the plural cannot be fixed where it is written. MEASURED on the
  // Google Business card, which is the ONLY place it shows: that channel is the
  // one with `maxMediaCount: 1`.
  //
  // Repairing it here is in this function's remit — it already rewrites the
  // channel key and regroups digits — and it is safe because the shape gate in
  // `describeViolation` has already matched the message BEFORE this runs.
  out = out.replace(/ allows 1 media items\./, ' takes one photo per post.')

  // Group only bare 4+ digit integers. Shorter numbers (280, 10) read fine
  // unseparated and match how the counter renders them.
  return out.replace(/\b(\d{4,9})\b/g, (n) => Number(n).toLocaleString('en-IN'))
}
