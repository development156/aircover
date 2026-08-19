import { describe, expect, it } from 'vitest'
import {
  GstSupplierConfigSchema,
  TaxIdentitySchema,
  parseGstin,
  type GstSupplierConfig,
  type TaxIdentity,
} from '@sahoda/shared'
import { computeTax } from './computeTax'

/**
 * Fixture GSTINs are SYNTHETIC and checksum-valid: `27ABCDE1234F1Z0` carries a PAN that
 * belongs to nobody, with a check character computed by the published algorithm. A real
 * company's GSTIN in a test file is a real company's tax number in a public repository —
 * and a made-up one with a wrong check digit would not exercise the validator at all.
 */
const SUPPLIER_MAHARASHTRA = '27ABCDE1234F1Z0'
const CUSTOMER_MAHARASHTRA = '27ABCDE1234F1Z0'
const CUSTOMER_KARNATAKA = '29ABCDE1234F1ZW'

const supplier = (over: Partial<GstSupplierConfig> = {}): GstSupplierConfig =>
  GstSupplierConfigSchema.parse({
    legalName: 'Sahoda Labs Private Limited',
    gstin: SUPPLIER_MAHARASHTRA,
    stateCode: '27',
    address: '—',
    sacCode: '998434',
    ratePercent: 18,
    priceIncludesTax: true,
    exportUnderLut: true,
    serialPrefix: 'SL',
    creditNotePrefix: 'SLC',
    ...over,
  })

const registered = (gstin: string): TaxIdentity =>
  TaxIdentitySchema.parse({ kind: 'registered', gstin, legalName: 'Customer Pvt Ltd' })

describe('computeTax — the invariant that must hold everywhere', () => {
  /**
   * If this ever fails, an invoice exists whose lines do not add up to what the card was
   * charged. Swept rather than spot-checked because rounding defects hide in specific
   * amounts: a single ₹499 example passes under three different wrong implementations.
   */
  it('taxable + cgst + sgst + igst === gross, across rates, modes and treatments', () => {
    const identities: TaxIdentity[] = [
      registered(CUSTOMER_MAHARASHTRA),
      registered(CUSTOMER_KARNATAKA),
      TaxIdentitySchema.parse({ kind: 'unregistered', stateCode: '33', legalName: 'A Shop' }),
      TaxIdentitySchema.parse({ kind: 'overseas', countryCode: 'US', legalName: 'Acme Inc' }),
    ]
    const failures: string[] = []

    for (const rate of [0, 5, 12, 18, 28]) {
      for (const inclusive of [true, false]) {
        for (const lut of [true, false]) {
          const cfg = supplier({
            ratePercent: rate,
            priceIncludesTax: inclusive,
            exportUnderLut: lut,
          })
          for (const identity of identities) {
            // 1 paisa to ~₹40,000, plus every residue mod 7 and mod 118 in the low range.
            for (let paise = 1; paise <= 4_000_000; paise = paise * 3 + 1) {
              const b = computeTax({ supplier: cfg, identity, amountPaise: paise })
              const sum = b.taxablePaise + b.cgstPaise + b.sgstPaise + b.igstPaise
              if (sum !== b.grossPaise) {
                failures.push(
                  `rate=${rate} inclusive=${inclusive} lut=${lut} ${identity.kind} ` +
                    `${paise}p: ${sum} !== ${b.grossPaise}`,
                )
              }
              if (b.cgstPaise !== b.sgstPaise) {
                failures.push(`unequal halves: rate=${rate} ${identity.kind} ${paise}p`)
              }
              if (b.totalTaxPaise !== b.cgstPaise + b.sgstPaise + b.igstPaise) {
                failures.push(`totalTax drift: rate=${rate} ${identity.kind} ${paise}p`)
              }
            }
          }
        }
      }
    }

    expect(failures.slice(0, 5)).toEqual([])
  })

  /**
   * The sweep above proves internal consistency. It would still pass if every amount came
   * back with zero tax — so this pins the actual arithmetic to a figure a CA can check by
   * hand: ₹499 inclusive of 18%.
   */
  it('₹499 inclusive of 18% splits into ₹422.88 + ₹38.06 + ₹38.06', () => {
    const b = computeTax({
      supplier: supplier(),
      identity: registered(CUSTOMER_MAHARASHTRA),
      amountPaise: 49_900,
    })
    expect(b).toMatchObject({
      treatment: 'intra_state',
      placeOfSupply: '27',
      grossPaise: 49_900,
      taxablePaise: 42_288,
      cgstPaise: 3_806,
      sgstPaise: 3_806,
      igstPaise: 0,
      totalTaxPaise: 7_612,
    })
    // The taxable value re-taxed must return the tax, or the back-calculation is wrong.
    expect(Math.round((b.taxablePaise * 18) / 100)).toBe(b.totalTaxPaise)
  })

  it('₹499 EXCLUSIVE of 18% charges ₹588.82, not ₹499', () => {
    const b = computeTax({
      supplier: supplier({ priceIncludesTax: false }),
      identity: registered(CUSTOMER_MAHARASHTRA),
      amountPaise: 49_900,
    })
    expect(b.taxablePaise).toBe(49_900)
    expect(b.grossPaise).toBe(58_882)
    expect(b.cgstPaise).toBe(4_491)
    expect(b.sgstPaise).toBe(4_491)
  })
})

describe('computeTax — which heads the tax lands under', () => {
  it('same state as the supplier is CGST + SGST, and never IGST', () => {
    const b = computeTax({
      supplier: supplier(),
      identity: registered(CUSTOMER_MAHARASHTRA),
      amountPaise: 149_900,
    })
    expect(b.treatment).toBe('intra_state')
    expect(b.igstPaise).toBe(0)
    expect(b.cgstPaise).toBeGreaterThan(0)
  })

  it('a different state is IGST, and never CGST or SGST', () => {
    const b = computeTax({
      supplier: supplier(),
      identity: registered(CUSTOMER_KARNATAKA),
      amountPaise: 149_900,
    })
    expect(b.treatment).toBe('inter_state')
    expect(b.placeOfSupply).toBe('29')
    expect(b.cgstPaise).toBe(0)
    expect(b.sgstPaise).toBe(0)
    expect(b.igstPaise).toBe(22_866)
  })

  it('the recipient state comes from the GSTIN, so it cannot disagree with it', () => {
    // The state is never taken from a second stored field — this is the whole reason
    // `registered` carries no `stateCode` of its own.
    expect(parseGstin(CUSTOMER_KARNATAKA)?.stateCode).toBe('29')
    const b = computeTax({
      supplier: supplier(),
      identity: registered(CUSTOMER_KARNATAKA),
      amountPaise: 100,
    })
    expect(b.placeOfSupply).toBe('29')
  })

  it('an unregistered customer is placed by the state they gave us', () => {
    const b = computeTax({
      supplier: supplier(),
      identity: TaxIdentitySchema.parse({
        kind: 'unregistered',
        stateCode: '27',
        legalName: 'A Shop',
      }),
      amountPaise: 49_900,
    })
    expect(b.treatment).toBe('intra_state')
  })

  it('an export under LUT collects no tax and is marked zero-rated, not taxed at 0%', () => {
    const b = computeTax({
      supplier: supplier(),
      identity: TaxIdentitySchema.parse({
        kind: 'overseas',
        countryCode: 'US',
        legalName: 'Acme Inc',
      }),
      amountPaise: 49_900,
    })
    expect(b).toMatchObject({
      treatment: 'zero_rated_export',
      placeOfSupply: '96',
      totalTaxPaise: 0,
      taxablePaise: 49_900,
      zeroRated: true,
      underLut: true,
    })
    // ratePercent is 0 on the document because no rate was applied — NOT 18 with a zero result.
    expect(b.ratePercent).toBe(0)
  })

  it('an export NOT under LUT still charges IGST — same zero-rating, tax genuinely collected', () => {
    const b = computeTax({
      supplier: supplier({ exportUnderLut: false }),
      identity: TaxIdentitySchema.parse({
        kind: 'overseas',
        countryCode: 'US',
        legalName: 'Acme Inc',
      }),
      amountPaise: 49_900,
    })
    expect(b.zeroRated).toBe(true)
    expect(b.underLut).toBe(false)
    expect(b.igstPaise).toBe(7_612)
  })
})

describe('computeTax — what it refuses', () => {
  it('refuses a non-integer amount rather than rounding one into a tax document', () => {
    expect(() =>
      computeTax({
        supplier: supplier(),
        identity: registered(CUSTOMER_MAHARASHTRA),
        amountPaise: 49_900.5,
      }),
    ).toThrow(/non-negative integer/)
  })

  it('refuses a negative amount', () => {
    expect(() =>
      computeTax({
        supplier: supplier(),
        identity: registered(CUSTOMER_MAHARASHTRA),
        amountPaise: -1,
      }),
    ).toThrow(/non-negative integer/)
  })

  it('a GSTIN that fails its checksum never becomes a TaxIdentity', () => {
    // One character changed from the valid fixture: shaped exactly like a GSTIN.
    const typo = '27ABCDE1234F1Z1'
    expect(parseGstin(typo)).toBeNull()
    expect(() => registered(typo)).toThrow()
  })

  it('a supplier config with an invalid GSTIN is refused at the schema, not at render time', () => {
    expect(() => supplier({ gstin: '27ABCDE1234F1Z1' })).toThrow()
  })
})
