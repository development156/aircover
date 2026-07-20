import type { ActionType, LedgerEntry, LedgerEntryType, ModelTier } from '@sahoda/shared'

import { cogsUsd } from './parse-entries'

/**
 * Which way a ledger row moved the wallet, from the user's point of view.
 * `neutral` is reserved for money that has not resolved yet (a HOLD) or a
 * genuinely zero-sum row.
 */
export type Direction = 'credit' | 'debit' | 'neutral'

export interface EntryDisplay {
  /** Human label for the row, e.g. 'Post variants'. Never a raw machine token. */
  label: string
  direction: Direction
  /** Rendered sign + magnitude, e.g. '-3' / '+50' / '3' (reserved) / '0'. */
  signedAmount: string
  /** Honest detail line, or `null` when there is nothing truthful to add. */
  why: string | null
  /** A HOLD is credits reserved, not credits spent. */
  pending: boolean
}

/** Generic label used whenever we cannot name the action safely. */
const GENERIC_ACTION_LABEL = 'AI action'

const MAX_OBJECT_REF_CHARS = 48

/** Smallest cost we render exactly; below this we say "under" rather than round to zero. */
const MIN_DISPLAYED_USD = 0.0001

/**
 * Human labels for every action priced in pricing.config.json.
 *
 * Typed `Record<ActionType, string>` on purpose — `ActionType` is derived from
 * the config itself (`@sahoda/shared` → `ledger/pricing`), so adding a priced
 * action without teaching this map fails typecheck instead of silently shipping
 * an auto-humanised label. Anything absent is humanised or degraded — never
 * dumped raw (see `actionLabel`).
 */
const ACTION_LABELS: Record<ActionType, string> = {
  caption_rewrite: 'Caption rewrite',
  inbox_reply: 'Inbox reply',
  post_variants: 'Post variants',
  twin_preflight: 'Twin preflight',
  image_standard: 'Standard image',
  image_premium: 'Premium image',
  carousel: 'Carousel',
  video_script: 'Video script',
  site_edit: 'Site edit',
  // Named for the button the user actually pressed. 'loop_cycle' is the
  // internal action id (the weekly Loop's seed); a wallet row reading "Loop
  // cycle" leaves someone who clicked "Plan my week" unable to match the
  // charge to what they did.
  loop_cycle: 'Plan my week',
  playbook_run: 'Playbook run',
  radar_scan: 'Radar scan',
  seo_article: 'SEO article',
  remix_pack: 'Remix pack',
  campaign_plan: 'Campaign plan',
  brand_research: 'Brand research',
  site_generate: 'Site generation',
  voice_minute: 'Voice minute',
}

/** Widened view for lookup: `action_type` is free text, not an `ActionType`. */
const ACTION_LABEL_LOOKUP: Readonly<Record<string, string>> = ACTION_LABELS

const TIER_LABELS: Record<ModelTier, string> = {
  nano: 'Nano',
  economy: 'Economy',
  standard: 'Standard',
  premium: 'Premium',
  research: 'Research',
}

/**
 * Labels for the ledger rows that are not tied to a spend action. Spend rows
 * (DEBIT/HOLD) take their label from `action_type` instead.
 */
const ENTRY_TYPE_LABELS: Record<LedgerEntryType, string | null> = {
  GRANT: 'Plan credits',
  TOPUP: 'Credits purchased',
  PERF_REWARD: 'Performance reward',
  RELEASE: 'Credits returned',
  EXPIRE: 'Credits expired',
  ADJUST: 'Manual adjustment',
  DEBIT: null, // from action_type
  HOLD: null, // from action_type
}

/**
 * GRANT rows carry their origin in `action_type`: `bootstrap_workspace` writes
 * the signup grant as `signup_grant`, while `applyPlanGrant` writes plan grants
 * with a null `action_type`. The signup grant must not claim "your plan" — a
 * fresh user has none. Unknown origins fall back to the plan copy, which is the
 * only other GRANT writer today.
 */
const GRANT_SOURCE_LABELS: Readonly<Record<string, string>> = {
  signup_grant: 'Welcome credits',
}

const GRANT_SOURCE_WHY: Readonly<Record<string, string>> = {
  signup_grant: 'Included free when you signed up.',
}

/**
 * The static half of the why-line, per entry type. These state only what the
 * entry type itself guarantees — nothing is inferred from `meta` or `actor`.
 */
const ENTRY_TYPE_WHY: Record<LedgerEntryType, string | null> = {
  GRANT: 'Included with your plan.',
  TOPUP: 'Added from a credit purchase.',
  PERF_REWARD: 'Earned from post performance.',
  HOLD: 'Reserved while this action runs — returned in full if it does not complete.',
  RELEASE: 'Returned because the action did not complete. You were not charged.',
  EXPIRE: 'Unused credits expired.',
  ADJUST: 'Adjusted by Sahoda support.',
  DEBIT: null, // the DEBIT why-line is built from action/tier/cost
}

/**
 * Entry types that add credits to the wallet total.
 *
 * RELEASE is deliberately NOT here. `apply_ledger_entry` settles a RELEASE with
 * `balance_held := balance_held - hold.amount` and leaves `balance_total`
 * untouched — no credits are gained, the reservation is simply undone. Rendering
 * it `+3` next to a HOLD that rendered as an unsigned `3` would show a credit
 * the wallet never received: the mirror image of the double-charge that keeps
 * HOLD off the debit side. Both halves of a hold/release pair are zero-sum.
 */
const CREDIT_TYPES: ReadonlySet<LedgerEntryType> = new Set<LedgerEntryType>([
  'GRANT',
  'TOPUP',
  'PERF_REWARD',
])

/** Entry types that resolve a reservation without moving the wallet total. */
const RESERVATION_TYPES: ReadonlySet<LedgerEntryType> = new Set<LedgerEntryType>([
  'HOLD',
  'RELEASE',
])

/** Entry types that remove credits from the wallet. */
const DEBIT_TYPES: ReadonlySet<LedgerEntryType> = new Set<LedgerEntryType>(['DEBIT', 'EXPIRE'])

/**
 * A machine action token we are willing to show after humanising: lowercase
 * snake_case, short enough to read, no markup or punctuation. Anything else
 * degrades to `GENERIC_ACTION_LABEL` rather than reaching the DOM.
 */
const SAFE_ACTION_TOKEN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/

function humaniseToken(token: string): string | null {
  if (token.length > 40 || !SAFE_ACTION_TOKEN.test(token)) {
    return null
  }

  const words = token.split('_').join(' ')

  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Human label for a spend row.
 *
 * `action_type` is a free-text column with no CHECK constraint, so an unknown
 * value is a real possibility. Known tokens get a curated label; unknown but
 * well-formed tokens are humanised (still useful, still not a raw dump); and
 * anything malformed, hostile or overlong degrades to a safe generic label.
 */
function actionLabel(actionType: string | null): string {
  if (actionType === null) {
    return GENERIC_ACTION_LABEL
  }

  const known = ACTION_LABEL_LOOKUP[actionType]

  if (known !== undefined) {
    return known
  }

  return humaniseToken(actionType) ?? GENERIC_ACTION_LABEL
}

/** Direction implied by the entry type. ADJUST is the only amount-signed type. */
function directionOf(entryType: LedgerEntryType, amount: number): Direction {
  if (entryType === 'ADJUST') {
    if (amount > 0) return 'credit'
    if (amount < 0) return 'debit'
    return 'neutral'
  }

  // A HOLD reserves and a RELEASE un-reserves: neither moves the wallet total.
  if (RESERVATION_TYPES.has(entryType)) return 'neutral'

  if (CREDIT_TYPES.has(entryType)) return 'credit'
  if (DEBIT_TYPES.has(entryType)) return 'debit'

  return 'neutral'
}

/**
 * Render the sign from the *direction*, never from the stored amount.
 *
 * `amount` is always positive in the DB except on ADJUST, so the magnitude is
 * taken as an absolute value: a contract-violating negative DEBIT still renders
 * as '-3' rather than '+-3'.
 */
function formatSignedAmount(direction: Direction, amount: number): string {
  const magnitude = Math.abs(amount)

  if (direction === 'credit') return `+${magnitude}`
  if (direction === 'debit') return `-${magnitude}`

  return `${magnitude}`
}

/**
 * Render a USD cost without ever rounding a real amount down to `$0.0000`.
 *
 * Exported because the wallet's additive footer sums the same values and must
 * apply the same floor — a total of `0.00002` printed as `~$0.0000` would state
 * a zero cost that was actually incurred. One owner for the threshold.
 */
export function formatUsdAmount(value: number): string {
  if (value > 0 && value < MIN_DISPLAYED_USD) {
    return `under $${MIN_DISPLAYED_USD.toFixed(4)}`
  }

  return `~$${value.toFixed(4)}`
}

function formatCogs(value: number): string {
  return `${formatUsdAmount(value)} provider cost`
}

function formatObjectRef(objectRef: string): string | null {
  const trimmed = objectRef.trim()

  if (trimmed === '') {
    return null
  }

  // Count and cut by code point, not UTF-16 unit: `String.slice` at a fixed
  // index can land inside a surrogate pair and emit a lone surrogate, which
  // renders as a replacement character. `object_ref` is caller-supplied text.
  const points = Array.from(trimmed)

  const clipped =
    points.length > MAX_OBJECT_REF_CHARS
      ? `${points.slice(0, MAX_OBJECT_REF_CHARS).join('')}…`
      : trimmed

  return `Ref ${clipped}`
}

/**
 * Build the honest detail line.
 *
 * Only four fields ever reach the user: `action_type` (via the label),
 * `object_ref`, `model_tier` and `cogs_usd_est` — the FSD 0.1 transparency set.
 * `idempotency_key`, `settles_entry_id`, `actor` and `meta` are internals and
 * are never rendered.
 *
 * `withCredits` writes `model_tier: null` on every DEBIT today, so the missing
 * tier is the common case. We say it was not recorded rather than inventing or
 * inferring one.
 */
function buildWhy(entry: LedgerEntry): string | null {
  const parts: string[] = []

  // Only a settled DEBIT is missing a tier it *should* have had. A HOLD is
  // written before the model call (`withCredits` reserves first, then runs), so
  // it has no tier yet — "not recorded" there would imply lost data.
  const isCharge = entry.entry_type === 'DEBIT'

  const staticWhy =
    entry.entry_type === 'GRANT'
      ? (GRANT_SOURCE_WHY[entry.action_type ?? ''] ?? ENTRY_TYPE_WHY.GRANT)
      : ENTRY_TYPE_WHY[entry.entry_type]

  if (staticWhy !== null) {
    parts.push(staticWhy)
  }

  if (entry.object_ref !== null) {
    const ref = formatObjectRef(entry.object_ref)

    if (ref !== null) {
      parts.push(ref)
    }
  }

  if (entry.model_tier !== null) {
    parts.push(`${TIER_LABELS[entry.model_tier]} model`)
  } else if (isCharge) {
    parts.push('Model tier not recorded')
  }

  const cogs = cogsUsd(entry)

  if (cogs !== null) {
    parts.push(formatCogs(cogs))
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Describe one `credit_ledger` row for the wallet history list.
 *
 * Pure: the input is never mutated and nothing is read from the environment.
 */
export function describeEntry(entry: LedgerEntry): EntryDisplay {
  const direction = directionOf(entry.entry_type, entry.amount)
  const typeLabel =
    entry.entry_type === 'GRANT'
      ? (GRANT_SOURCE_LABELS[entry.action_type ?? ''] ?? ENTRY_TYPE_LABELS.GRANT)
      : ENTRY_TYPE_LABELS[entry.entry_type]

  return {
    label: typeLabel ?? actionLabel(entry.action_type),
    direction,
    signedAmount: formatSignedAmount(direction, entry.amount),
    why: buildWhy(entry),
    pending: entry.entry_type === 'HOLD',
  }
}
