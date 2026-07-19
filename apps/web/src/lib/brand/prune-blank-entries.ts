import type { BrandMemoryPayload } from '@sahoda/shared'

/**
 * Drop blank entries from the two OPEN-ended lists before persisting a brain.
 *
 * The Refine editors' "Add" button appends an empty row, so a user can easily
 * leave blanks behind — and `resolve_brand_memory` only caps list *length* (40),
 * not content, so they save happily. That matters because mesh prepends the
 * ACTIVE brain to every model call: a blank entry bills tokens on every future
 * action forever, and a blank red line tells the Loop to refuse nothing.
 *
 * Only `voice.banned_phrases` and `taboo.red_lines` are pruned. The three
 * fixed-length arrays (`signature_phrases`, `core_values`, `sample_hooks`) are
 * left exactly as-is — the frozen contract pins them at exactly 3, so filtering
 * them would make the payload INVALID_PAYLOAD. Retained entries are returned
 * byte-identical: this prunes, it never rewrites the user's text.
 */
function withoutBlanks(entries: readonly string[]): string[] {
  return entries.filter((entry) => entry.trim().length > 0)
}

export function pruneBlankListEntries(brain: BrandMemoryPayload): BrandMemoryPayload {
  return {
    ...brain,
    voice: { ...brain.voice, banned_phrases: withoutBlanks(brain.voice.banned_phrases) },
    taboo: { ...brain.taboo, red_lines: withoutBlanks(brain.taboo.red_lines) },
  }
}
