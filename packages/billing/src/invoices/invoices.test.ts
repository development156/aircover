import { describe, expect, it } from 'vitest'
import {
  GstSupplierConfigSchema,
  MAX_SERIAL_LENGTH,
  MAX_SERIAL_PREFIX,
  TaxIdentitySchema,
  invoiceSerial,
  type GstSupplierConfig,
} from '@sahoda/shared'
import { financialYear, financialYearStart } from './financialYear'
import { buildCreditNote, buildTaxInvoice } from './buildInvoice'
import { GST_ENV_KEYS, loadGstSupplierConfig } from './gstEnv'

const SUPPLIER_GSTIN = '27ABCDE1234F1Z0'
const CUSTOMER_GSTIN_KA = '29ABCDE1234F1ZW'

const supplier = (over: Partial<GstSupplierConfig> = {}): GstSupplierConfig =>
  GstSupplierConfigSchema.parse({
    legalName: 'Sahoda Labs Private Limited',
    gstin: SUPPLIER_GSTIN,
    stateCode: '27',
    address: 'Registered office',
    sacCode: '998434',
    ratePercent: 18,
    priceIncludesTax: true,
    exportUnderLut: true,
    serialPrefix: 'SL',
    creditNotePrefix: 'SLC',
    ...over,
  })

describe('financialYear', () => {
  it('runs April to March, not January to December', () => {
    expect(financialYear(new Date('2026-04-01T00:00:00Z'))).toBe('26-27')
    expect(financialYear(new Date('2026-08-19T12:00:00Z'))).toBe('26-27')
    expect(financialYear(new Date('2027-03-31T23:59:59Z'))).toBe('26-27')
    // One second later is a NEW series, starting again at 1.
    expect(financialYear(new Date('2027-04-01T00:00:00Z'))).toBe('27-28')
    expect(financialYear(new Date('2026-01-15T00:00:00Z'))).toBe('25-26')
  })

  it('reads the clock in UTC, so two servers cannot disagree about the series', () => {
    // A local-time reading would put this instant in a different financial year depending
    // on the machine's zone, and one server would allocate from a series the other closed.
    const instant = new Date('2026-03-31T20:00:00Z')
    expect(financialYear(instant)).toBe('25-26')
    expect(financialYearStart(instant).toISOString()).toBe('2025-04-01T00:00:00.000Z')
  })

  it('refuses an invalid date rather than numbering into NaN-NaN', () => {
    expect(() => financialYear(new Date('nonsense'))).toThrow(/invalid date/)
  })
})

describe('the serial number fits the statutory cap', () => {
  it('is 16 characters at the longest legal prefix, and the cap is derived not guessed', () => {
    expect(MAX_SERIAL_PREFIX).toBe(3)
    const longest = invoiceSerial('X'.repeat(MAX_SERIAL_PREFIX), '26-27', 999_999)
    expect(longest).toBe('XXX/26-27/999999')
    expect(longest.length).toBe(MAX_SERIAL_LENGTH)
  })

  it('pads the counter so the numbers sort as text as well as they sort as numbers', () => {
    expect(invoiceSerial('SL', '26-27', 1)).toBe('SL/26-27/000001')
    expect(invoiceSerial('SLC', '26-27', 42)).toBe('SLC/26-27/000042')
  })

  it('refuses a config whose prefix could not produce a legal number', () => {
    expect(() => supplier({ serialPrefix: 'SAHO' })).toThrow()
  })
})

describe('buildTaxInvoice', () => {
  const registered = TaxIdentitySchema.parse({
    kind: 'registered',
    gstin: CUSTOMER_GSTIN_KA,
    legalName: 'Customer Pvt Ltd',
  })

  it('snapshots the supplier onto the document rather than joining to config', () => {
    // An invoice states who issued it AT THE TIME. Reading today's config to render an old
    // one would restate history the moment the registration changes.
    const draft = buildTaxInvoice({
      supplier: supplier(),
      identity: registered,
      amountPaise: 49_900,
      now: new Date('2026-08-19T12:00:00Z'),
    })
    expect(draft.supplierGstin).toBe(SUPPLIER_GSTIN)
    expect(draft.supplierLegalName).toBe('Sahoda Labs Private Limited')
    expect(draft.supplierStateCode).toBe('27')
  })

  it('takes the recipient state from the GSTIN, and marks the supply inter-state', () => {
    const draft = buildTaxInvoice({
      supplier: supplier(),
      identity: registered,
      amountPaise: 49_900,
      now: new Date('2026-08-19T12:00:00Z'),
      period: '2026-08',
      planId: 'starter',
      provider: 'cashfree',
      providerOrderId: 'sah_1',
      providerPaymentId: 'pay_1',
      ledgerEntryId: '00000000-0000-4000-8000-000000000009',
    })
    expect(draft.recipientStateCode).toBe('29')
    expect(draft.recipientCountryCode).toBe('IN')
    expect(draft.tax.treatment).toBe('inter_state')
    expect(draft.tax.igstPaise).toBe(7_612)
    expect(draft).toMatchObject({
      documentType: 'tax_invoice',
      financialYear: '26-27',
      serialPrefix: 'SL',
      period: '2026-08',
      planId: 'starter',
      providerPaymentId: 'pay_1',
      ledgerEntryId: '00000000-0000-4000-8000-000000000009',
      referencesInvoiceId: null,
      reason: null,
      shortfallCredits: 0,
    })
  })

  it('records an overseas customer by country, with no Indian state at all', () => {
    const draft = buildTaxInvoice({
      supplier: supplier(),
      identity: TaxIdentitySchema.parse({
        kind: 'overseas',
        countryCode: 'us',
        legalName: 'Acme Inc',
      }),
      amountPaise: 49_900,
      now: new Date('2026-08-19T12:00:00Z'),
    })
    expect(draft.recipientStateCode).toBeNull()
    expect(draft.recipientGstin).toBeNull()
    expect(draft.recipientCountryCode).toBe('US')
    expect(draft.tax.placeOfSupply).toBe('96')
  })
})

describe('buildCreditNote', () => {
  it('names what it compensates, carries the shortfall, and uses its own series', () => {
    const note = buildCreditNote({
      supplier: supplier(),
      identity: TaxIdentitySchema.parse({
        kind: 'registered',
        gstin: SUPPLIER_GSTIN,
        legalName: 'Customer Pvt Ltd',
      }),
      amountPaise: 49_900,
      now: new Date('2026-08-19T12:00:00Z'),
      referencesInvoiceId: '00000000-0000-4000-8000-00000000000a',
      reason: 'chargeback',
      shortfallCredits: 1_300,
    })
    expect(note).toMatchObject({
      documentType: 'credit_note',
      serialPrefix: 'SLC',
      reason: 'chargeback',
      shortfallCredits: 1_300,
      referencesInvoiceId: '00000000-0000-4000-8000-00000000000a',
    })
    // Its own prefix, so the two series can never collide in one printed number.
    expect(note.serialPrefix).not.toBe(supplier().serialPrefix)
  })

  it('carries the same tax lines as the invoice it reverses', () => {
    // A credit note reverses a supply, so it describes the SAME supply. Recomputing the
    // treatment from scratch here would be a second chance to get it wrong.
    const shared = {
      supplier: supplier(),
      identity: TaxIdentitySchema.parse({
        kind: 'registered',
        gstin: CUSTOMER_GSTIN_KA,
        legalName: 'Customer Pvt Ltd',
      }),
      amountPaise: 149_900,
      now: new Date('2026-08-19T12:00:00Z'),
    }
    const invoice = buildTaxInvoice(shared)
    const note = buildCreditNote({
      ...shared,
      referencesInvoiceId: '00000000-0000-4000-8000-00000000000a',
      reason: 'refund',
    })
    expect(note.tax).toEqual(invoice.tax)
  })
})

describe('loadGstSupplierConfig', () => {
  const complete = {
    [GST_ENV_KEYS.legalName]: 'Sahoda Labs Private Limited',
    [GST_ENV_KEYS.gstin]: SUPPLIER_GSTIN,
    [GST_ENV_KEYS.stateCode]: '27',
    [GST_ENV_KEYS.address]: 'Registered office',
    [GST_ENV_KEYS.sacCode]: '998434',
    [GST_ENV_KEYS.ratePercent]: '18',
    [GST_ENV_KEYS.priceIncludesTax]: 'true',
    [GST_ENV_KEYS.exportUnderLut]: 'true',
    [GST_ENV_KEYS.serialPrefix]: 'SL',
    [GST_ENV_KEYS.creditNotePrefix]: 'SLC',
  }

  it('loads a complete registration', () => {
    const result = loadGstSupplierConfig(complete)
    expect(result.configured).toBe(true)
    if (!result.configured) return
    expect(result.config.gstin).toBe(SUPPLIER_GSTIN)
    expect(result.config.priceIncludesTax).toBe(true)
  })

  it('reports ABSENT rather than throwing, and names only keys', () => {
    // An unconfigured supplier is a deployment fact, not an exception: the app must be able
    // to say "no invoice yet" on the money screen instead of returning a 500.
    const result = loadGstSupplierConfig({})
    expect(result.configured).toBe(false)
    if (result.configured) return
    expect(result.missing).toContain(GST_ENV_KEYS.legalName)
    expect(result.missing).toContain(GST_ENV_KEYS.gstin)
    // No value from the environment may appear in a report that gets logged.
    expect(result.missing.join(' ')).not.toContain(SUPPLIER_GSTIN)
  })

  it('has no default for any statutory field — an invoice may never be fabricated', () => {
    // Removing each key one at a time. If any of them silently fell back to a plausible
    // value, the config would still load and a fabricated tax invoice would be issuable.
    //
    // `SAHODA_GST_STATE_CODE` is the ONE exemption, and it is not a default: the state is
    // DERIVED from the first two characters of the GSTIN, which is the number the return is
    // filed under. Nothing is invented — the same fact is simply read from its authoritative
    // record. The test below pins that the derivation WINS when the two disagree, which is
    // the behaviour that makes the exemption safe.
    const DERIVED_FROM_GSTIN: readonly string[] = [GST_ENV_KEYS.stateCode]

    for (const key of Object.values(GST_ENV_KEYS)) {
      if (DERIVED_FROM_GSTIN.includes(key)) continue
      const missing = { ...complete }
      delete (missing as Record<string, string>)[key]
      const result = loadGstSupplierConfig(missing)
      expect(result.configured, `${key} was defaulted`).toBe(false)
    }
  })

  it('falls back to the state var only when there is no GSTIN to derive from', () => {
    // With the GSTIN gone the config is unusable anyway, so this asserts the ORDER rather
    // than a usable outcome: the derivation is tried first, the var is the fallback, and
    // neither one is ever invented.
    const noState = loadGstSupplierConfig({ ...complete, [GST_ENV_KEYS.stateCode]: '' })
    expect(noState.configured).toBe(true)

    const noGstinNoState = loadGstSupplierConfig({
      ...complete,
      [GST_ENV_KEYS.gstin]: '',
      [GST_ENV_KEYS.stateCode]: '',
    })
    expect(noGstinNoState.configured).toBe(false)
    if (noGstinNoState.configured) return
    expect(noGstinNoState.missing).toContain(GST_ENV_KEYS.stateCode)
  })

  it('distinguishes a GSTIN that is absent from one that fails its checksum', () => {
    // Two different problems, and only one of them is fixed by typing it again.
    const typo = loadGstSupplierConfig({ ...complete, [GST_ENV_KEYS.gstin]: '27ABCDE1234F1Z1' })
    expect(typo.configured).toBe(false)
    if (typo.configured) return
    expect(typo.missing.join(' ')).toMatch(/fails its GSTIN checksum/)
  })

  it("does not read 'false' as true", () => {
    // `Boolean('false')` is true, and this field changes every figure on every invoice by
    // the full tax rate while looking entirely healthy.
    const result = loadGstSupplierConfig({
      ...complete,
      [GST_ENV_KEYS.priceIncludesTax]: 'false',
    })
    expect(result.configured).toBe(true)
    if (!result.configured) return
    expect(result.config.priceIncludesTax).toBe(false)
  })

  it('treats an unparseable boolean as missing rather than as false', () => {
    const result = loadGstSupplierConfig({ ...complete, [GST_ENV_KEYS.exportUnderLut]: 'yes' })
    expect(result.configured).toBe(false)
  })

  it('takes the supplier state from the GSTIN when the two disagree', () => {
    // Two records of one fact. The GSTIN is the number the return is filed under, so it wins.
    const result = loadGstSupplierConfig({ ...complete, [GST_ENV_KEYS.stateCode]: '29' })
    expect(result.configured).toBe(true)
    if (!result.configured) return
    expect(result.config.stateCode).toBe('27')
  })

  it('refuses two series sharing one prefix', () => {
    const result = loadGstSupplierConfig({ ...complete, [GST_ENV_KEYS.creditNotePrefix]: 'SL' })
    expect(result.configured).toBe(false)
    if (result.configured) return
    expect(result.missing.join(' ')).toMatch(/must differ/)
  })
})
