import type { BrandIntake } from '@sahoda/shared'

import { refineWithDoorText, type Basis } from './classify'
import type { Intake } from './intake'

/**
 * What onboarding may persist about the three picks, and how strongly.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The refusal gate resolves its rule set from `regime × locale`, and onboarding
 * used to fold both into a prose sentence for the resolve prompt and keep
 * nothing. So a clinic that picked "Health & care" was judged by the general
 * advertising floor: the MANDATED tier was `regime-_floor` and nothing else, on
 * every workspace that has ever existed. This is the value that changes that.
 *
 * ── THE ONLY HARD RULE HERE ──────────────────────────────────────────────────
 * A default is not a fact about the customer. `classify` returns `assumed` when
 * nothing in their words matched and it fell back to `consumer`, and that case
 * writes NOTHING — not `consumer` with a weak basis, nothing at all. Storing it
 * would convert "we guessed" into "they told us" at the one point where the
 * difference is still visible, and the gate's refusal copy branches on exactly
 * that difference.
 *
 * It also happens to make the resume path correct for free: a user returning to
 * a saved brain has empty `intakeText` and no overrides, so every verdict is
 * `assumed` and this returns `null` — which `saveBrandMemory` reads as "say
 * nothing", leaving whatever they declared the first time untouched.
 *
 *   `chosen`  — they overrode the chip themselves   → `declared`
 *   `matched` — read out of the sentence they typed → `derived`
 *   `assumed` — our fallback                        → null
 *
 * Keyed on the REGIME's basis alone. The regime is what selects the pack, and a
 * confidently-matched locale beside a guessed regime is still a guessed regime.
 */
const BASIS: Partial<Record<Basis, BrandIntake['basis']>> = {
  chosen: 'declared',
  matched: 'derived',
}

export function storedIntakeFrom(
  intakeText: string,
  doorText: string,
  overrides: Partial<Intake>,
): BrandIntake | null {
  // The SAME call the flow already makes to decide what to show on screen 3, so
  // what is stored cannot disagree with what the customer was told they are. A
  // second classification here would be a second answer.
  const classification = refineWithDoorText(intakeText, doorText, overrides)
  const basis = BASIS[classification.regime.basis]
  if (basis === undefined) return null

  return {
    model: classification.intake.model,
    regime: classification.intake.regime,
    locale: classification.intake.locale,
    basis,
  }
}
