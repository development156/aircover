import type { BrainField } from '@/lib/brand/fields'
import type { BrainLeaf } from '@/lib/brand/leaf'

/**
 * Is this value a blank wearing the shape of an answer?
 *
 * ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────
 * MEASURED 2026-09-06 on the wt-core preview against production: three spaces
 * were saved as `hook.core_promise` (version 11 of the QA workspace) and stamped
 * `source: 'owner', confirmed: true`; a single space went in as the third core
 * value (version 8). The console's own copy beside its editor says "There is no
 * way to record “nothing” here", and nothing enforced it: `validate()` in
 * `brand-field.ts` checked type and length, and `pruneBlankListEntries` skips
 * the three fixed lists on purpose (they are pinned at exactly three by the
 * payload contract). Mesh prepends the active brain to every model call, so a
 * confirmed blank promise is the promise every caption is written from.
 *
 * ── ONE RULE, THREE CALLERS ──────────────────────────────────────────────────
 * The server action refuses it (the boundary), and both editors disable their
 * commit button on it (so the refusal is read before the press, not after).
 * Written once so the Identity tab and the console cannot drift apart again —
 * they had: the console had a blank branch for a value that ARRIVED blank and
 * the Identity tab had none, and neither checked what was about to be saved.
 *
 * ── WHAT IS NOT BLANK ────────────────────────────────────────────────────────
 * An EMPTY open list. "There are no red lines" is a position a person can
 * hold, and `resolution-row.tsx` offers emptying for exactly that reason. An
 * open list with one real entry beside a whitespace one is not blank either:
 * the save prunes the whitespace and the real entry survives.
 */
export function blankReason(field: BrainField, value: BrainLeaf): string | null {
  if (field.kind === 'list') {
    if (!Array.isArray(value)) return null
    const blanks = value.filter((entry) => typeof entry !== 'string' || entry.trim() === '')
    if (field.fixedLength) {
      return blanks.length > 0
        ? 'All three need words. A blank one cannot be saved as yours.'
        : null
    }
    // Empty is an answer; all-blank is not.
    if (value.length > 0 && blanks.length === value.length) {
      return 'Every line here is blank. Write one, or remove them all to say “none”.'
    }
    return null
  }

  if (typeof value !== 'string') return null
  return value.trim() === ''
    ? 'This is blank. Write something, or cancel. A blank cannot be saved as yours.'
    : null
}
