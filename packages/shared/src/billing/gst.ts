import { z } from 'zod'

/**
 * India GST — the STRUCTURE of a tax invoice, and nothing that decides the treatment.
 *
 * ── WHAT THIS FILE IS AND IS NOT ─────────────────────────────────────────────
 * Everything here is either (a) statutory reference data that is a matter of public
 * record — the state codes, the GSTIN format and its checksum — or (b) a shape.
 *
 * The three things that are genuinely a TAX OPINION are NOT decided here. They are
 * fields on `GstSupplierConfig`, supplied by the founder and confirmed with a CA:
 *
 *   · `ratePercent`   — 18 for SaaS today, but it is a rate, not a constant.
 *   · `sacCode`       — the service accounting code that appears on the invoice.
 *   · `priceIncludesTax` — whether ₹499 is what the customer pays or what they pay
 *                        tax ON. This changes every number on every invoice and it
 *                        is a pricing decision, not an arithmetic one.
 *
 * Nothing in this repository may invent a GSTIN, a SAC or a supplier state. An
 * invoice is a record, and a fabricated record is the one class of output this
 * product may never produce. Where the config is absent, invoicing is UNAVAILABLE
 * and says so — it never falls back to a plausible default.
 */

// ─────────────────────────────────────────────────────────────────────────────
// State codes — statutory reference data (the first two digits of every GSTIN)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The GST state codes. `deprecated` marks codes that still appear on historical
 * registrations but are no longer issued — a GSTIN carrying one must still PARSE
 * (a customer may legitimately hold an old registration) while never being OFFERED
 * in a picker. Dropping them entirely would reject a real taxpayer's real number.
 */
export const GST_STATES: readonly {
  code: string
  name: string
  deprecated?: true
}[] = Object.freeze([
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '25', name: 'Daman and Diu', deprecated: true },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh (before bifurcation)', deprecated: true },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
  { code: '99', name: 'Centre Jurisdiction' },
])

/**
 * Place-of-supply code used when the recipient is outside India.
 *
 * NOT a state. It is the marker that says "this supply left the country", which is
 * what makes the supply zero-rated rather than taxed at 0% — a distinction that
 * matters to the return, not to the customer. Kept separate from GST_STATES so it
 * can never be offered as somewhere a customer lives.
 */
export const PLACE_OF_SUPPLY_OUTSIDE_INDIA = '96' as const

const STATE_CODES = new Set(GST_STATES.map((s) => s.code))

/** States a picker may offer: issued codes only, no deprecated registrations. */
export const SELECTABLE_GST_STATES = GST_STATES.filter((s) => !s.deprecated)

export const GstStateCodeSchema = z
  .string()
  .refine((v) => STATE_CODES.has(v), { message: 'Not a GST state code' })

export function gstStateName(code: string): string | null {
  return GST_STATES.find((s) => s.code === code)?.name ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// GSTIN — format and checksum
// ─────────────────────────────────────────────────────────────────────────────

/** The 36-symbol alphabet the GSTIN check digit is computed over. */
const GSTIN_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** 2 state + 10 PAN + 1 entity code + 1 fixed 'Z' + 1 check character. */
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/

/**
 * The GSTIN check character, by the published mod-36 algorithm.
 *
 * This is here because format alone accepts a typo: `27AAAAA0000A1Z5` and
 * `27AAAAA0000A1Z6` are both shaped like a GSTIN and only one can be real. A wrong
 * GSTIN on a tax invoice is not a cosmetic error — it denies the customer their
 * input credit and misreports the supply. Checking it is the difference between
 * validating a field and validating a fact.
 */
export function gstinCheckCharacter(first14: string): string | null {
  if (first14.length !== 14) return null
  let sum = 0
  for (let i = 0; i < 14; i += 1) {
    const value = GSTIN_ALPHABET.indexOf(first14[i] as string)
    if (value < 0) return null
    // Factors alternate 1,2,1,2… across the number, starting at 1.
    const product = value * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  return GSTIN_ALPHABET[(36 - (sum % 36)) % 36] as string
}

export interface GstinParts {
  gstin: string
  stateCode: string
  pan: string
}

/** Parse a GSTIN, or `null` if the shape, the state code or the checksum is wrong. */
export function parseGstin(raw: string): GstinParts | null {
  const gstin = raw.trim().toUpperCase()
  if (!GSTIN_SHAPE.test(gstin)) return null
  const stateCode = gstin.slice(0, 2)
  if (!STATE_CODES.has(stateCode)) return null
  if (gstinCheckCharacter(gstin.slice(0, 14)) !== gstin[14]) return null
  return { gstin, stateCode, pan: gstin.slice(2, 12) }
}

export const GstinSchema = z.string().refine((v) => parseGstin(v) !== null, {
  message: 'Not a valid GSTIN. Check the 15 characters',
})

// ─────────────────────────────────────────────────────────────────────────────
// Who is being supplied
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The customer, as the invoice needs them.
 *
 *  · `registered`   — an Indian business with a GSTIN. Place of supply is their state.
 *  · `unregistered` — an Indian customer without one. Place of supply is the state
 *                     they gave us; with no address on record the law falls back to
 *                     the supplier's own location, so we ask.
 *  · `overseas`     — outside India. Export of service, zero-rated.
 *
 * These are three different tax outcomes, so they are three variants rather than one
 * shape with optional fields — a nullable `gstin` would let "registered with no
 * GSTIN" typecheck, which is precisely the state that produces a wrong invoice.
 */
export const TaxIdentitySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('registered'),
    gstin: GstinSchema,
    legalName: z.string().min(1),
  }),
  z.object({
    kind: z.literal('unregistered'),
    stateCode: GstStateCodeSchema,
    legalName: z.string().min(1),
  }),
  z.object({
    kind: z.literal('overseas'),
    /** ISO 3166-1 alpha-2. Recorded for the return, never used to pick a rate. */
    countryCode: z.string().length(2),
    legalName: z.string().min(1),
  }),
])
export type TaxIdentity = z.infer<typeof TaxIdentitySchema>

/**
 * The supplier — SAHODA LABS. Every field here is a fact about a real registered
 * business and MUST come from configuration. There is no default and there is no
 * placeholder: a GSTIN this code invented would appear on a document that claims to
 * be a tax invoice.
 */
export const GstSupplierConfigSchema = z.object({
  legalName: z.string().min(1),
  gstin: GstinSchema,
  /** Derived from the GSTIN, but stated so a mismatch is caught rather than assumed. */
  stateCode: GstStateCodeSchema,
  address: z.string().min(1),
  /** Service accounting code printed on the invoice. CONFIRM WITH A CA. */
  sacCode: z.string().min(4),
  /** Whole-number GST rate for the supply, e.g. 18. CONFIRM WITH A CA. */
  ratePercent: z.int().min(0).max(100),
  /**
   * Whether catalogue prices are tax-INCLUSIVE (₹499 is what the card is charged) or
   * tax-EXCLUSIVE (₹499 + GST). Changes every figure on every invoice. CONFIRM WITH A CA.
   */
  priceIncludesTax: z.boolean(),
  /**
   * Whether exports are being made under a Letter of Undertaking (zero-rated, no tax
   * collected) rather than on payment of IGST with a refund claim. CONFIRM WITH A CA.
   */
  exportUnderLut: z.boolean(),
  /**
   * Invoice serial prefix, e.g. 'SL'. Part of the number, so it must never change mid-year.
   * Capped at MAX_SERIAL_PREFIX characters — see the arithmetic there.
   */
  serialPrefix: z.string().min(1).max(3),
  /**
   * Credit-note serial prefix, e.g. 'SLC'. A SEPARATE value rather than the invoice prefix
   * with a letter appended: deriving it would silently overflow the 16-character statutory
   * cap for any prefix already at the limit, and the overflow would first be noticed when a
   * real chargeback failed to produce a document.
   */
  creditNotePrefix: z.string().min(1).max(3),
})
export type GstSupplierConfig = z.infer<typeof GstSupplierConfigSchema>

// ─────────────────────────────────────────────────────────────────────────────
// The computed breakdown
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which heads the tax lands under. One axis, three outcomes, and they are mutually
 * exclusive — an invoice is never both CGST/SGST and IGST.
 */
export const TaxTreatmentSchema = z.enum([
  /** Supplier and recipient in the same state: CGST + SGST, equal halves. */
  'intra_state',
  /** Different states, or an Indian recipient in a union territory with legislature: IGST. */
  'inter_state',
  /** Recipient outside India: export of service, zero-rated. */
  'zero_rated_export',
])
export type TaxTreatment = z.infer<typeof TaxTreatmentSchema>

/**
 * Every figure on the invoice, in PAISE.
 *
 * Integers throughout, deliberately. `499 * 0.18` in floating point is
 * 89.82000000000001, and money that carries a rounding error into a statutory
 * document is money that will not reconcile with the bank. Nothing here is a float.
 *
 * The invariant this shape must always satisfy: `taxable + cgst + sgst + igst == gross`.
 */
export const TaxBreakdownSchema = z.object({
  treatment: TaxTreatmentSchema,
  /** Place-of-supply code recorded on the invoice: a state code, or '96' for an export. */
  placeOfSupply: z.string(),
  ratePercent: z.int(),
  /** What the customer is charged, all-in. */
  grossPaise: z.int().min(0),
  /** The value the tax is computed on. */
  taxablePaise: z.int().min(0),
  cgstPaise: z.int().min(0),
  sgstPaise: z.int().min(0),
  igstPaise: z.int().min(0),
  /** cgst + sgst + igst. Stored rather than re-derived so the document cannot drift. */
  totalTaxPaise: z.int().min(0),
  /** True when the supply is zero-rated rather than taxed — a different claim from 0%. */
  zeroRated: z.boolean(),
  /** True when the supplier collects no tax because the export is under LUT. */
  underLut: z.boolean(),
})
export type TaxBreakdown = z.infer<typeof TaxBreakdownSchema>

// ─────────────────────────────────────────────────────────────────────────────
// The serial number's shape
// ─────────────────────────────────────────────────────────────────────────────

/** GST caps an invoice number at 16 characters. Not a preference. */
export const MAX_SERIAL_LENGTH = 16

/** Digits in the counter. Six allows 999,999 documents per series per financial year. */
export const SERIAL_COUNTER_DIGITS = 6

/**
 * How many characters are left for a prefix, after the parts whose length is fixed.
 *
 * `prefix` + `/` + `YY-YY` + `/` + six digits = 16, so the prefix gets 3. This is derived
 * rather than written down as `3`, because the derivation is the reason — and if the
 * counter ever needs a seventh digit, the cap has to move with it rather than silently
 * start producing numbers the law will not accept.
 */
export const MAX_SERIAL_PREFIX = MAX_SERIAL_LENGTH - 1 - 'YY-YY'.length - 1 - SERIAL_COUNTER_DIGITS

/** The printed number. The database allocates `seq`; this is the only place it is formatted. */
export function invoiceSerial(prefix: string, financialYear: string, seq: number): string {
  return `${prefix}/${financialYear}/${String(seq).padStart(SERIAL_COUNTER_DIGITS, '0')}`
}

/** Rupees from paise, for display. Never used to compute anything. */
export const paiseToRupees = (paise: number): number => paise / 100
