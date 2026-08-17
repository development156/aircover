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
] as const

type KnownCode = (typeof KNOWN_CODES)[number]

const KNOWN_CODE_SET: ReadonlySet<string> = new Set<string>(KNOWN_CODES)

/**
 * One-click fixes only. Type, size and dimension problems need a different file,
 * which the editor cannot produce, so they intentionally carry no CTA.
 */
const FIX_LABELS: Readonly<Record<KnownCode, string | undefined>> = {
  MAX_CHARS: 'Trim to fit',
  MAX_HASHTAGS: 'Remove extra hashtags',
  MAX_MEDIA_COUNT: 'Remove extra media',
  MEDIA_TYPE: undefined,
  MEDIA_SIZE: undefined,
  MEDIA_DIMS: undefined,
}

/**
 * Used when the engine message does not match its expected shape. Deliberately
 * carries no numbers: this module has no verified limit to quote, and inventing
 * one would be worse than being vague.
 */
const FALLBACK_MESSAGES: Readonly<Record<KnownCode, string>> = {
  MAX_CHARS: 'This post is longer than the channel allows.',
  MAX_HASHTAGS: 'This post uses more hashtags than the channel allows.',
  MAX_MEDIA_COUNT: 'This post has more media than the channel allows.',
  MEDIA_TYPE: 'This channel does not accept this file type.',
  MEDIA_SIZE: 'This file is larger than the channel allows.',
  MEDIA_DIMS: 'This image is smaller than the channel allows.',
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
  MAX_HASHTAGS: new RegExp(`^(?:${CHANNEL}) allows ${NUM} hashtags\\.$`),
  MAX_MEDIA_COUNT: new RegExp(`^(?:${CHANNEL}) allows ${NUM} media items\\.$`),
  MEDIA_TYPE: new RegExp(`^(?:${CHANNEL}) does not accept ${MIME}\\.$`, 'i'),
  MEDIA_SIZE: new RegExp(`^(?:${CHANNEL}) media must be ≤ ${DECIMAL} MB\\.$`),
  MEDIA_DIMS: new RegExp(`^(?:${CHANNEL}) images must be ≥ ${NUM}×${NUM}\\.$`),
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
  // Group only bare 4+ digit integers. Shorter numbers (280, 10) read fine
  // unseparated and match how the counter renders them.
  return out.replace(/\b(\d{4,9})\b/g, (n) => Number(n).toLocaleString('en-IN'))
}
