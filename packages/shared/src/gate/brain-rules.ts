import { z } from 'zod'

/**
 * Reading a stored Brand Brain for the gate, tolerantly.
 *
 * ── WHY THIS DOES NOT USE `StoredBrandMemorySchema` ──────────────────────────
 * That schema is strict — fixed-length arrays of exactly 3, six required
 * sections — and it is right to be, because it is the resolve contract. But a
 * strict parse here would mean that a brain written before a field existed, or
 * one section short, produces NO owner rules at all. The post would then sail
 * through the owner tier while the Refine screen still promised those red lines
 * were enforced: the precise failure doc 18 §8 describes, arrived at by being
 * fussy rather than by being lazy.
 *
 * So each field is read on its own, and a field that is missing or the wrong
 * shape contributes nothing while its siblings still contribute. Missing is
 * honest: it means nobody wrote a red line, which is a real and common state.
 */

const StringArray = z.array(z.string())

/** Read one dotted path as a string array, or `[]`. Never throws. */
function stringsAt(payload: unknown, section: string, key: string): readonly string[] {
  if (typeof payload !== 'object' || payload === null) return []
  const sectionValue = (payload as Record<string, unknown>)[section]
  if (typeof sectionValue !== 'object' || sectionValue === null) return []
  const parsed = StringArray.safeParse((sectionValue as Record<string, unknown>)[key])
  return parsed.success ? parsed.data : []
}

/** `taboo.red_lines` — prose, and the classifier's to judge. */
export function ownerRedLinesFrom(payload: unknown): readonly string[] {
  return stringsAt(payload, 'taboo', 'red_lines')
}

/** `voice.banned_phrases` — literal, and the only owner input layer 2 can act on. */
export function ownerBannedPhrasesFrom(payload: unknown): readonly string[] {
  return stringsAt(payload, 'voice', 'banned_phrases')
}

/**
 * The three onboarding picks, IF the brain happens to carry them.
 *
 * ── IT DOES NOT, TODAY, ON ANY WORKSPACE ─────────────────────────────────────
 * `apps/web/src/app/actions/onboarding-resolve.ts` parses model/regime/locale,
 * hands them to `toResolveInput`, and that function folds them into prose
 * (`REGIME_NOUN` into a sentence). `ResolveInput` has nowhere structured to put
 * them and `brand_memory` has no column for them, so the regime a customer
 * PICKED is discarded at the end of onboarding and cannot be read back.
 *
 * The consequence for this gate is exact and must not be glossed: with no
 * stored regime, every workspace resolves to `consumer` with basis `default`,
 * and the MANDATED tier is the floor pack only. A clinic that chose "Health &
 * care" gets the floor, not the healthcare pack. The OWNER tier — their own red
 * lines — works fully today and is the half that protects people on day one.
 *
 * This function reads `payload.intake` because that is where a persisted intake
 * would ride: `resolve_brand_memory` validates the six sections and ignores
 * anything else, which is the same seam `field_meta` already uses. The ask to
 * write it there is filed in `apps/web/REQUESTS.md` — persisting it is
 * onboarding's change to make, not this lane's.
 */
const IntakeShape = z.object({
  regime: z.string().min(1).optional(),
  locale: z.string().min(1).optional(),
})

export interface StoredIntake {
  regime: string | null
  locale: string | null
  basis: 'declared' | 'default'
}

export function intakeFrom(payload: unknown): StoredIntake {
  if (typeof payload !== 'object' || payload === null) {
    return { regime: null, locale: null, basis: 'default' }
  }
  const parsed = IntakeShape.safeParse((payload as Record<string, unknown>).intake)
  if (!parsed.success || parsed.data.regime === undefined) {
    return { regime: null, locale: null, basis: 'default' }
  }
  return {
    regime: parsed.data.regime,
    locale: parsed.data.locale ?? null,
    // `declared` only when a regime was actually stored. A locale on its own
    // does not upgrade the basis — the regime is what selects the pack, and
    // recording a default as a declaration is the audit trail overstating what
    // it knew.
    basis: 'declared',
  }
}
