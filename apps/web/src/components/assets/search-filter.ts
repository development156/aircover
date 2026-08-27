import { matchesQuery, sameFolderName } from '@sahoda/shared'
import type { AssetFolder, ParsedSearch, RuleAnswer } from '@sahoda/shared'

import { organizable } from '@/lib/assets/organize-view'
import type { AssetCard } from '@/lib/assets/view'

/**
 * WHAT THE SEARCH BOX DOES THAT `matchesQuery` ALONE CANNOT.
 *
 * `matchesQuery` already carries the three-valued answer for every rule a
 * token compiles to. This adds the two things typing does that a saved smart
 * folder never had to: free text (always decidable — a name search never
 * shrugs) and `in:` (decidable only when the card's own filings were read).
 * Neither may collapse `unknown` into `no`, and that is the whole reason this
 * is its own module rather than three lines inlined into the screen.
 */

export interface ResolvedFolderNames {
  /** Real folder ids `in:` resolved to. */
  folderIds: string[]
  /** `in:` names that matched no real folder. */
  unresolvedNames: string[]
}

/** `in:` names, matched the way a person reads them: case and spacing are not identity. */
export function resolveFolderNames(
  names: readonly string[],
  folders: readonly AssetFolder[],
): ResolvedFolderNames {
  const folderIds: string[] = []
  const unresolvedNames: string[] = []
  for (const name of names) {
    const match = folders.find((folder) => sameFolderName(folder.name, name))
    if (match) folderIds.push(match.id)
    else unresolvedNames.push(name)
  }
  return { folderIds, unresolvedNames }
}

/**
 * Does this card answer the typed search?
 *
 * An `in:` naming no real folder is a definite `no` for every card — nothing
 * can be filed in a place that does not exist — never a filter that quietly
 * matches everything because it had nothing to check.
 */
export function searchAnswer(
  card: AssetCard,
  parsed: ParsedSearch,
  resolved: ResolvedFolderNames,
  now: Date,
): RuleAnswer {
  const ruleAnswer = matchesQuery({ mode: 'all', rules: parsed.rules }, organizable(card), now)
  if (ruleAnswer === 'no') return 'no'

  let folderAnswer: RuleAnswer = 'yes'
  if (parsed.folderNames.length > 0) {
    if (resolved.unresolvedNames.length > 0) {
      folderAnswer = 'no'
    } else if (card.folderIds === null) {
      // "We did not read this card's filings" cannot answer "is it in Diwali".
      folderAnswer = 'unknown'
    } else {
      const held = card.folderIds
      folderAnswer = resolved.folderIds.every((id) => held.includes(id)) ? 'yes' : 'no'
    }
  }
  if (folderAnswer === 'no') return 'no'

  if (parsed.text !== '') {
    const haystack = `${card.title ?? ''} ${card.alt ?? ''}`.toLowerCase()
    if (!haystack.includes(parsed.text.toLowerCase())) return 'no'
  }

  return ruleAnswer === 'unknown' || folderAnswer === 'unknown' ? 'unknown' : 'yes'
}
