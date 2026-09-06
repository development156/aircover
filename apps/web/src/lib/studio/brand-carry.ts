/**
 * WHETHER AN EDIT TO A REFINED PROMPT STILL CARRIES THE BRAND.
 *
 * ── THE RULE, AND WHY IT IS SHAPED THIS WAY ──────────────────────────────────
 * `conditionPrompt` must never say the brand twice: once as the refined
 * sentence's own prose, once as the `Brand context:` list underneath. Whether
 * that risk exists after an edit depends on whether the brand's own wording is
 * still IN the sentence, and a computer cannot read that. What it can measure
 * is how much of the previous text survives into the next one, and that turns
 * out to track the founder's own examples closely enough to use:
 *
 *   · "make it evening instead of morning" changes one word in the middle of a
 *     long sentence. Nearly everything on both sides of that word is
 *     unchanged, so most of the previous text survives.
 *   · Clearing the box or pasting over the whole selection leaves nothing, or
 *     almost nothing, of the previous text. Almost none of it survives.
 *
 * ── THE MEASURE ───────────────────────────────────────────────────────────
 * The shared prefix plus the shared suffix (counted without overlapping each
 * other), as a fraction of the PREVIOUS text's length. A person editing in
 * place — inserting, deleting or swapping a word or phrase anywhere in the
 * sentence — leaves both a long matching prefix and a long matching suffix
 * around the edited spot. A person replacing the sentence wholesale, or a
 * starter chip swapping in an unrelated one, shares almost no run at either
 * end.
 *
 * The threshold is a judgement call, not a measured constant: half of the
 * previous text surviving reads as "still recognisably the same sentence."
 * Move it in the same commit as evidence that a real edit sits on the wrong
 * side of it.
 *
 * Pure: no I/O, no clock, no React.
 */
export function editKeepsBrand(previous: string, next: string): boolean {
  const prev = previous.trim()
  const nxt = next.trim()

  // Nothing to carry forward into, and nothing carried into an empty box.
  if (prev === '' || nxt === '') return false

  const maxPrefix = Math.min(prev.length, nxt.length)
  let prefix = 0
  while (prefix < maxPrefix && prev[prefix] === nxt[prefix]) prefix += 1

  // Suffix scan stops where the prefix scan already claimed characters, so an
  // edit near one end of a short string is never counted twice.
  const maxSuffix = Math.min(prev.length, nxt.length) - prefix
  let suffix = 0
  while (suffix < maxSuffix && prev[prev.length - 1 - suffix] === nxt[nxt.length - 1 - suffix]) {
    suffix += 1
  }

  const survived = (prefix + suffix) / prev.length
  return survived >= 0.5
}
