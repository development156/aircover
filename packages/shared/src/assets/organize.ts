import { z } from 'zod'
import { AssetKindSchema } from '../db/assets'
import { isLockedSite, type AssetUsageSite } from './delete-gate'

/**
 * SMART FOLDERS — a saved question, re-asked every time the library is drawn.
 *
 * ── WHY A RULE AND NOT A SUGGESTION ──────────────────────────────────────────
 * The reference this is measured against (Google Drive) offers "Suggested
 * folders": an opaque model output with no stated reason, which a person can
 * neither predict nor correct. Every rule here is a PREDICATE a person can run
 * in their head against the tiles on screen, which is the property
 * `lib/assets/folders.ts` already established for the three derived folders and
 * the reason those were built instead of five named containers holding nothing.
 *
 * A smart folder therefore has no membership table. It is not a place files are
 * put; it is a question, and its contents are whatever answers that question at
 * the moment you look. Nothing has to be re-filed when a photo is used in a
 * post, and a file uploaded thirty seconds ago is already in every smart folder
 * whose rule it matches.
 *
 * ── THE THIRD ANSWER, WHICH IS THE WHOLE POINT ───────────────────────────────
 * `matchesRule` returns `'yes' | 'no' | 'unknown'`, not a boolean.
 *
 * A rule can be UNDECIDABLE for a given file. "Landscape photos" cannot be
 * answered for a row whose `width` is null; "over 2 MB" cannot be answered when
 * `bytes` is null; nothing about usage can be answered when the usage read did
 * not come back. Drive resolves all three to false and silently drops the file.
 * That is the `100 of —` failure in folder form: a container that quietly
 * under-reports, with no sentence anywhere saying so.
 *
 * Returning `'unknown'` lets the screen say "3 files, 1 could not be checked",
 * which is a different and truer claim than "3 files". A folder that cannot tell
 * must be able to say it cannot tell.
 */

// ── The fields a rule may ask about ──────────────────────────────────────────
/**
 * Deliberately small, and every member is answerable from a column that already
 * exists on `assets` or from `asset_usages`. There is no `field` here whose
 * value would have to be invented, guessed, or produced by a model.
 */
export const SmartFieldSchema = z.enum([
  'kind',
  'usage',
  'name',
  'description',
  'orientation',
  'bytes',
  'added',
])
export type SmartField = z.infer<typeof SmartFieldSchema>

export const UsageStateSchema = z.enum(['used', 'unused', 'locked'])
export type UsageState = z.infer<typeof UsageStateSchema>

export const OrientationSchema = z.enum(['landscape', 'portrait', 'square'])
export type Orientation = z.infer<typeof OrientationSchema>

/**
 * One rule.
 *
 * A discriminated union on `field` rather than a `{field, op, value}` triple,
 * because the triple admits `{field:'kind', op:'over', value:'landscape'}` —
 * a shape that typechecks, parses, and means nothing. Here every field carries
 * only the operand it can actually take.
 */
export const SmartRuleSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('kind'), is: AssetKindSchema }),
  z.object({ field: z.literal('usage'), is: UsageStateSchema }),
  /** Matched against the name and the description together, case-insensitively. */
  z.object({ field: z.literal('name'), contains: z.string().trim().min(1).max(120) }),
  /** The accessibility gap, as a folder. Drive has no equivalent. */
  z.object({ field: z.literal('description'), is: z.enum(['missing', 'present']) }),
  z.object({ field: z.literal('orientation'), is: OrientationSchema }),
  /**
   * The ONE field carrying a separate operator, and it is written this way
   * because it must be. `discriminatedUnion` keys members by the literal value
   * of `field`, so two members both saying `field: 'bytes'` do not become an
   * either-or: the second silently replaces the first in the lookup and one of
   * the two rule shapes stops parsing, with nothing in the types to say so.
   * One member with `op` is the shape that survives.
   */
  z.object({
    field: z.literal('bytes'),
    op: z.enum(['over', 'under']),
    value: z.number().int().nonnegative(),
  }),
  /** Rolling window, counted back from the moment the page is drawn. */
  z.object({ field: z.literal('added'), withinDays: z.number().int().positive().max(3650) }),
])
export type SmartRule = z.infer<typeof SmartRuleSchema>

export const MatchModeSchema = z.enum(['all', 'any'])
export type MatchMode = z.infer<typeof MatchModeSchema>

/**
 * The saved question. Capped at eight rules: past that nobody can predict what
 * the folder holds, which forfeits the one property this design exists for.
 */
export const SmartQuerySchema = z.object({
  mode: MatchModeSchema,
  rules: z.array(SmartRuleSchema).min(1).max(8),
})
export type SmartQuery = z.infer<typeof SmartQuerySchema>

// ── What a rule is asked about ───────────────────────────────────────────────
/**
 * The minimum a file must expose to be sorted. A view over `assets` plus the
 * `asset_usages` rows, never the row itself: this is imported by the browser,
 * and `storage_path` has no business crossing that boundary.
 *
 * `usage: null` means THE READ DID NOT COME BACK. It never means "nothing uses
 * this file" — that is the empty array, and conflating the two is what lets a
 * scheduled post lose its photo.
 */
export interface OrganizableFile {
  kind: z.infer<typeof AssetKindSchema>
  title: string | null
  alt: string | null
  bytes: number | null
  width: number | null
  height: number | null
  /** ISO 8601. */
  createdAt: string
  usage: readonly AssetUsageSite[] | null
}

export type RuleAnswer = 'yes' | 'no' | 'unknown'

const yn = (value: boolean): RuleAnswer => (value ? 'yes' : 'no')

/**
 * Does this file answer this rule?
 *
 * Pure, total, and never throws: it is called once per file per rule on every
 * render, and an exception here would take the library down rather than lose
 * one tile.
 */
export function matchesRule(rule: SmartRule, file: OrganizableFile, now: Date): RuleAnswer {
  switch (rule.field) {
    case 'kind':
      return yn(file.kind === rule.is)

    case 'usage': {
      // The one place `unknown` is not about a null column but about a failed
      // read. Answering 'no' here would put a locked file in "Not used yet".
      if (file.usage === null) return 'unknown'
      if (rule.is === 'used') return yn(file.usage.length > 0)
      if (rule.is === 'unused') return yn(file.usage.length === 0)
      return yn(file.usage.some(isLockedSite))
    }

    case 'name': {
      // Name AND description, because a person searching for "shopfront" does
      // not remember which of the two boxes they typed it into.
      const haystack = `${file.title ?? ''} ${file.alt ?? ''}`.toLowerCase()
      return yn(haystack.includes(rule.contains.trim().toLowerCase()))
    }

    case 'description': {
      // Always decidable. A missing description is a fact about the row, not an
      // unreadable one, so this never returns 'unknown'.
      const written = typeof file.alt === 'string' && file.alt.trim() !== ''
      return yn(rule.is === 'present' ? written : !written)
    }

    case 'orientation': {
      if (file.width === null || file.height === null) return 'unknown'
      if (file.width <= 0 || file.height <= 0) return 'unknown'
      const shape: Orientation =
        file.width === file.height ? 'square' : file.width > file.height ? 'landscape' : 'portrait'
      return yn(shape === rule.is)
    }

    case 'bytes': {
      if (file.bytes === null) return 'unknown'
      return yn(rule.op === 'over' ? file.bytes > rule.value : file.bytes < rule.value)
    }

    case 'added': {
      const at = Date.parse(file.createdAt)
      // A timestamp that will not parse is unreadable, not old. Treating it as
      // outside every window would hide the file from every dated folder at once.
      if (Number.isNaN(at)) return 'unknown'
      const cutoff = now.getTime() - rule.withinDays * 86_400_000
      return yn(at >= cutoff)
    }
  }
}

/**
 * Does the whole query hold?
 *
 * ── HOW `unknown` PROPAGATES, AND WHY IT IS NOT JUST "FALSE WITH A LABEL" ────
 * Under `all`, one definite `no` settles it: the file is out, and no amount of
 * unreadable columns changes that. Only when nothing says no and something says
 * unknown is the file itself unknown. Under `any`, one definite `yes` settles it
 * the same way in the other direction.
 *
 * So a file is only ever reported unknown when the answer GENUINELY turns on a
 * column that could not be read. This is the difference between a folder that
 * says "1 could not be checked" honestly and one that says it about every file
 * with a null width.
 */
export function matchesQuery(query: SmartQuery, file: OrganizableFile, now: Date): RuleAnswer {
  let sawUnknown = false
  for (const rule of query.rules) {
    const answer = matchesRule(rule, file, now)
    if (answer === 'unknown') {
      sawUnknown = true
      continue
    }
    if (query.mode === 'all' && answer === 'no') return 'no'
    if (query.mode === 'any' && answer === 'yes') return 'yes'
  }
  if (sawUnknown) return 'unknown'
  // Nothing was unknown and nothing settled it, so the mode's identity stands:
  // every rule said yes under `all`, every rule said no under `any`.
  return query.mode === 'all' ? 'yes' : 'no'
}

/** What a smart folder holds, with the part it could not decide kept separate. */
export interface SmartTally {
  /** Files the rules definitely admit. */
  matched: number
  /**
   * Files whose membership turns on something that could not be read. NOT
   * included in `matched`, and never silently dropped: the screen states this
   * number, because a folder that cannot tell must say it cannot tell.
   */
  unknown: number
}

export function tallySmartFolder(
  query: SmartQuery,
  files: readonly OrganizableFile[],
  now: Date,
): SmartTally {
  let matched = 0
  let unknown = 0
  for (const file of files) {
    const answer = matchesQuery(query, file, now)
    if (answer === 'yes') matched += 1
    else if (answer === 'unknown') unknown += 1
  }
  return { matched, unknown }
}
