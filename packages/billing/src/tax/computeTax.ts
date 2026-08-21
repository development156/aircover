import {
  PLACE_OF_SUPPLY_OUTSIDE_INDIA,
  parseGstin,
  type GstSupplierConfig,
  type TaxBreakdown,
  type TaxIdentity,
} from '@sahoda/shared'

/**
 * Turn a price and a customer into the tax lines of an invoice.
 *
 * ── ONE RULE RUNS THROUGH ALL OF IT: INTEGER PAISE ───────────────────────────
 * `49900 * 0.18` is 8982.000000000002 in IEEE-754. A statutory document built on
 * that will, eventually, fail to reconcile with a bank statement by a paisa — and a
 * paisa is enough to make an auditor stop trusting the whole ledger. Nothing in this
 * file is a float, and nothing leaves it as one.
 *
 * ── WHY CGST IS COMPUTED BEFORE THE TAXABLE VALUE, NOT AFTER ─────────────────
 * CGST and SGST must be EQUAL. The obvious order — derive the taxable value, take
 * 18% of it, halve it — produces unequal halves whenever the total tax is an odd
 * number of paise, and an invoice whose two halves differ by one paisa is malformed.
 * So the half is computed FIRST, at half the rate, and the taxable value is whatever
 * is left. Equality then holds by construction rather than by rounding luck.
 *
 * The invariant `taxable + cgst + sgst + igst === gross` is asserted by the tests on
 * every rate, both pricing modes and every treatment, over a swept range of amounts.
 */

export interface ComputeTaxInput {
  supplier: GstSupplierConfig
  identity: TaxIdentity
  /**
   * The catalogue price in paise. Whether this is what the customer PAYS or what they
   * pay tax ON is `supplier.priceIncludesTax` — that is a pricing decision the founder
   * makes, and reading it wrong changes every figure by 18%.
   */
  amountPaise: number
}

/** Half-up on a non-negative rational. Explicit so the rounding rule is one line, not a habit. */
const round = (numerator: number, denominator: number): number =>
  Math.round(numerator / denominator)

export function computeTax(input: ComputeTaxInput): TaxBreakdown {
  const { supplier, identity, amountPaise } = input

  if (!Number.isInteger(amountPaise) || amountPaise < 0) {
    throw new Error(`amountPaise must be a non-negative integer (got ${amountPaise})`)
  }

  const rate = supplier.ratePercent
  const recipientState = recipientStateCode(identity)

  // ── Export of service ─────────────────────────────────────────────────────
  // Zero-RATED is not the same claim as taxed at 0%, and the difference is the whole
  // point: a zero-rated supply lets the supplier keep its input credit. Under a LUT no
  // tax is collected at all; without one the export goes out on payment of IGST and is
  // reclaimed later — same supply, same zero-rating, tax genuinely charged.
  if (identity.kind === 'overseas') {
    if (supplier.exportUnderLut) {
      return {
        treatment: 'zero_rated_export',
        placeOfSupply: PLACE_OF_SUPPLY_OUTSIDE_INDIA,
        ratePercent: 0,
        grossPaise: amountPaise,
        taxablePaise: amountPaise,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
        totalTaxPaise: 0,
        zeroRated: true,
        underLut: true,
      }
    }
    const { taxable, tax, gross } = splitSingleHead(amountPaise, rate, supplier.priceIncludesTax)
    return {
      treatment: 'zero_rated_export',
      placeOfSupply: PLACE_OF_SUPPLY_OUTSIDE_INDIA,
      ratePercent: rate,
      grossPaise: gross,
      taxablePaise: taxable,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: tax,
      totalTaxPaise: tax,
      zeroRated: true,
      underLut: false,
    }
  }

  // ── Domestic ──────────────────────────────────────────────────────────────
  const intraState = recipientState === supplier.stateCode

  if (intraState) {
    const { taxable, half, gross } = splitEqualHalves(amountPaise, rate, supplier.priceIncludesTax)
    return {
      treatment: 'intra_state',
      placeOfSupply: recipientState,
      ratePercent: rate,
      grossPaise: gross,
      taxablePaise: taxable,
      cgstPaise: half,
      sgstPaise: half,
      igstPaise: 0,
      totalTaxPaise: half * 2,
      zeroRated: false,
      underLut: false,
    }
  }

  const { taxable, tax, gross } = splitSingleHead(amountPaise, rate, supplier.priceIncludesTax)
  return {
    treatment: 'inter_state',
    placeOfSupply: recipientState,
    ratePercent: rate,
    grossPaise: gross,
    taxablePaise: taxable,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: tax,
    totalTaxPaise: tax,
    zeroRated: false,
    underLut: false,
  }
}

/**
 * Where the supply lands.
 *
 * For a REGISTERED recipient the state is read from the GSTIN itself, never from a
 * separately-stored field: the two can disagree, and the GSTIN is the one the return
 * is filed against. `parseGstin` has already validated the checksum by the time a
 * `TaxIdentity` exists, so a failure here means the value was constructed bypassing
 * the schema — which must throw, not silently pick a state.
 */
function recipientStateCode(identity: TaxIdentity): string {
  if (identity.kind === 'registered') {
    const parsed = parseGstin(identity.gstin)
    if (!parsed) throw new Error('registered identity carries an invalid GSTIN')
    return parsed.stateCode
  }
  if (identity.kind === 'unregistered') return identity.stateCode
  return PLACE_OF_SUPPLY_OUTSIDE_INDIA
}

/** IGST, or an export on payment of tax: one head, so the taxable value is derived first. */
function splitSingleHead(
  amount: number,
  rate: number,
  inclusive: boolean,
): { taxable: number; tax: number; gross: number } {
  if (inclusive) {
    const taxable = round(amount * 100, 100 + rate)
    return { taxable, tax: amount - taxable, gross: amount }
  }
  const tax = round(amount * rate, 100)
  return { taxable: amount, tax, gross: amount + tax }
}

/** CGST + SGST: the half comes first so the two heads are equal by construction. */
function splitEqualHalves(
  amount: number,
  rate: number,
  inclusive: boolean,
): { taxable: number; half: number; gross: number } {
  if (inclusive) {
    // Half the rate over (100 + full rate) — the standard back-calculation, applied per head.
    const half = round(amount * rate, 2 * (100 + rate))
    return { taxable: amount - half * 2, half, gross: amount }
  }
  const half = round(amount * rate, 200)
  return { taxable: amount, half, gross: amount + half * 2 }
}
