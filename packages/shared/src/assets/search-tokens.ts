import { AssetKindSchema } from '../db/assets'
import { OrientationSchema, UsageStateSchema, type SmartRule } from './organize'

/**
 * WHAT YOU TYPE, TURNED INTO RULES.
 *
 * ── THIS FILE EXISTS TO DELETE A USER INTERFACE ──────────────────────────────
 * Smart folders were built with a rule builder: a modal, a mode toggle, and up
 * to eight rows of field-and-operator dropdowns. It could express everything and
 * nobody wanted to use it, which is the definition of the wrong control. The
 * founder's word was "complicated".
 *
 * The blueprint's first law is Progressive Disclosure: show the 80% interaction
 * and reveal the rest on demand. Its first core feature is a search bar with
 * token chips, `type:image`, `size:>100MB`, `modified:today`. So the builder is
 * gone and this is what replaces it: one box you already knew how to use, which
 * happens to understand a few words.
 *
 * ── AND THE ENGINE UNDERNEATH IS UNCHANGED ───────────────────────────────────
 * A token compiles to a `SmartRule`, so `matchesQuery` and its three-valued
 * answer still decide what matches. Nothing is re-implemented here and nothing
 * about the 'unknown' behaviour is lost: a `shape:landscape` filter still
 * declines to guess about a photo with no recorded width. What changed is the
 * control, not the correctness.
 *
 * A saved search is therefore the SAME row a smart folder always was. Type a
 * filter, press save, and it is a folder. There is no second data model and no
 * migration.
 */

/** A field a token may name, with the words a person would actually type. */
export interface TokenField {
  /** The word before the colon. */
  key: string
  /** What it selects, in the words the hint row shows. */
  label: string
  /** A real, valid example. Shown to a person, so it must actually parse. */
  example: string
}

/**
 * The whole vocabulary. SEVEN fields, deliberately.
 *
 * Every one answers from a column that exists, and every one is a thing a person
 * has actually wanted from a photo library. There is no `colour:` and no
 * `contains:` because nothing could answer them, and a filter that silently
 * matches nothing is worse than a filter that is not offered.
 */
export const TOKEN_FIELDS: readonly TokenField[] = [
  { key: 'type', label: 'the kind of file', example: 'type:image' },
  { key: 'used', label: 'whether a post uses it', example: 'used:no' },
  { key: 'size', label: 'how big it is', example: 'size:>500kb' },
  { key: 'added', label: 'when you added it', example: 'added:7d' },
  { key: 'shape', label: 'landscape, portrait or square', example: 'shape:landscape' },
  { key: 'desc', label: 'whether it has a description', example: 'desc:missing' },
  { key: 'in', label: 'a folder, by name', example: 'in:diwali' },
]

const KEYS = new Set(TOKEN_FIELDS.map((f) => f.key))

/**
 * `kb`, `mb`, and a bare number meaning bytes.
 *
 * `as const` rather than `Record<string, number>` on purpose: under
 * `noUncheckedIndexedAccess` the Record form makes even `UNITS.kb` possibly
 * undefined, and the honest fix is a type that knows its own keys rather than a
 * non-null assertion at every use.
 */
const UNITS = {
  b: 1,
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
} as const

type Unit = keyof typeof UNITS

function unitFor(raw: string | undefined): number | null {
  const key = (raw ?? 'b') as Unit
  return key in UNITS ? UNITS[key] : null
}

function parseBytes(raw: string): number | null {
  const match = /^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/.exec(raw)
  if (match === null) return null
  const size = Number(match[1])
  if (!Number.isFinite(size)) return null
  const unit = unitFor(match[2])
  if (unit === null) return null
  return Math.round(size * unit)
}

/** `today`, `week`, `month`, or `<n>d`. Returns a day count. */
function parseWindow(raw: string): number | null {
  if (raw === 'today') return 1
  if (raw === 'week') return 7
  if (raw === 'month') return 30
  const match = /^(\d+)d$/.exec(raw)
  if (match === null) return null
  const days = Number(match[1])
  return days > 0 && days <= 3650 ? days : null
}

/**
 * What one token turned into.
 *
 * `rule` is the compiled predicate. `folder` is the one token that is NOT a rule
 * over a file's own columns: `in:` names a place, and only the screen knows which
 * folder a name refers to, so it is handed back for the caller to resolve.
 */
export type CompiledToken =
  | { kind: 'rule'; text: string; rule: SmartRule }
  | { kind: 'folder'; text: string; name: string }
  | { kind: 'unusable'; text: string; message: string }

function compile(key: string, value: string, text: string): CompiledToken {
  switch (key) {
    case 'type': {
      const parsed = AssetKindSchema.safeParse(value)
      return parsed.success
        ? { kind: 'rule', text, rule: { field: 'kind', is: parsed.data } }
        : {
            kind: 'unusable',
            text,
            message: 'Sahoda knows type:image, type:video and type:document.',
          }
    }

    case 'used': {
      // `used:no` is the word a person reaches for, and it is the inverse of the
      // schema's own vocabulary. Mapped here rather than renaming the enum,
      // because the enum is what the database and the saved rows speak.
      const spelled = value === 'no' ? 'unused' : value === 'yes' ? 'used' : value
      const parsed = UsageStateSchema.safeParse(spelled)
      return parsed.success
        ? { kind: 'rule', text, rule: { field: 'usage', is: parsed.data } }
        : { kind: 'unusable', text, message: 'Sahoda knows used:yes, used:no and used:locked.' }
    }

    case 'size': {
      const op = value.startsWith('>') ? 'over' : value.startsWith('<') ? 'under' : null
      if (op === null) {
        return { kind: 'unusable', text, message: 'Sizes need > or <, as in size:>500kb.' }
      }
      const bytes = parseBytes(value.slice(1))
      if (bytes === null) {
        return { kind: 'unusable', text, message: 'Sahoda reads sizes like 500kb, 2mb or 1200.' }
      }
      return { kind: 'rule', text, rule: { field: 'bytes', op, value: bytes } }
    }

    case 'added': {
      const days = parseWindow(value)
      return days === null
        ? {
            kind: 'unusable',
            text,
            message: 'Try added:today, added:week, added:month or added:30d.',
          }
        : { kind: 'rule', text, rule: { field: 'added', withinDays: days } }
    }

    case 'shape': {
      const parsed = OrientationSchema.safeParse(value)
      return parsed.success
        ? { kind: 'rule', text, rule: { field: 'orientation', is: parsed.data } }
        : {
            kind: 'unusable',
            text,
            message: 'Sahoda knows shape:landscape, shape:portrait and shape:square.',
          }
    }

    case 'desc': {
      return value === 'missing' || value === 'present'
        ? { kind: 'rule', text, rule: { field: 'description', is: value } }
        : { kind: 'unusable', text, message: 'Sahoda knows desc:missing and desc:present.' }
    }

    case 'in': {
      return { kind: 'folder', text, name: value }
    }

    default:
      // Unreachable: `KEYS` gates the call. Kept so adding a field to the
      // catalogue without teaching this switch fails loudly rather than silently
      // dropping the token.
      return { kind: 'unusable', text, message: 'Sahoda does not know that filter yet.' }
  }
}

export interface ParsedSearch {
  /** Compiled rules, ready for `matchesQuery`. */
  rules: SmartRule[]
  /** Folder names the person asked for by `in:`. The screen resolves these. */
  folderNames: string[]
  /** Everything that was not a token: the plain name search. */
  text: string
  /**
   * Tokens naming a field Sahoda knows with a value it does not, each with the
   * sentence that says what it does know.
   *
   * These are NOT silently ignored and NOT treated as text. `type:vidoe` quietly
   * becoming a search for the letters "type:vidoe" returns nothing and explains
   * nothing, which reads as a broken library rather than a typo.
   */
  unusable: { text: string; message: string }[]
}

/**
 * Read the search box.
 *
 * ── A COLON DOES NOT MAKE A TOKEN ────────────────────────────────────────────
 * Only a word in `TOKEN_FIELDS` does. "shopfront: final" and "10:30 shoot" are
 * ordinary text and stay ordinary text, because a person typing a filename with
 * a colon in it is far more likely than one inventing a filter Sahoda does not
 * have. An unknown key is text; a known key with a bad value is a mistake worth
 * naming.
 */
export function parseSearch(input: string): ParsedSearch {
  const rules: SmartRule[] = []
  const folderNames: string[] = []
  const unusable: { text: string; message: string }[] = []
  const words: string[] = []

  for (const word of input.trim().split(/\s+/)) {
    if (word === '') continue
    const colon = word.indexOf(':')
    const key = colon > 0 ? word.slice(0, colon).toLowerCase() : ''

    if (colon <= 0 || !KEYS.has(key)) {
      words.push(word)
      continue
    }

    const value = word.slice(colon + 1).toLowerCase()
    if (value === '') {
      // Half-typed, which is what every token looks like mid-keystroke. Not an
      // error and not a filter: it simply does not narrow anything yet.
      continue
    }

    const compiled = compile(key, value, word)
    if (compiled.kind === 'rule') rules.push(compiled.rule)
    else if (compiled.kind === 'folder') folderNames.push(compiled.name)
    else unusable.push({ text: compiled.text, message: compiled.message })
  }

  return { rules, folderNames, text: words.join(' '), unusable }
}

/**
 * Does this search narrow anything?
 *
 * A blank box is not a filter, and the screen has to tell the two apart to know
 * whether "nothing matches" is worth saying.
 */
export function isNarrowing(parsed: ParsedSearch): boolean {
  return parsed.rules.length > 0 || parsed.folderNames.length > 0 || parsed.text !== ''
}

/**
 * The search box's own text, rebuilt from a saved query.
 *
 * Saving a search stores rules; opening one has to put words back in the box, or
 * the person cannot see or edit what they saved. Every branch here is the exact
 * inverse of `compile`, and `search-tokens.test.ts` asserts the round trip.
 */
export function unparseRule(rule: SmartRule): string {
  switch (rule.field) {
    case 'kind':
      return `type:${rule.is}`
    case 'usage':
      return `used:${rule.is === 'unused' ? 'no' : rule.is === 'used' ? 'yes' : 'locked'}`
    case 'bytes': {
      const sign = rule.op === 'over' ? '>' : '<'
      if (rule.value >= UNITS.mb && rule.value % UNITS.mb === 0) {
        return `size:${sign}${rule.value / UNITS.mb}mb`
      }
      if (rule.value >= UNITS.kb && rule.value % UNITS.kb === 0) {
        return `size:${sign}${rule.value / UNITS.kb}kb`
      }
      return `size:${sign}${rule.value}`
    }
    case 'added':
      return `added:${rule.withinDays}d`
    case 'orientation':
      return `shape:${rule.is}`
    case 'description':
      return `desc:${rule.is}`
    case 'name':
      return rule.contains
  }
}
