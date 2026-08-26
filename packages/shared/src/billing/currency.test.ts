import { describe, it, expect } from 'vitest'
import {
  DISPLAY_CURRENCIES,
  FxRatesSchema,
  describePlanPrice,
  displayCurrencyForCountry,
} from './currency'
import { PLAN_CATALOG } from './plans'

const RATES = FxRatesSchema.parse({
  base: 'INR',
  fetchedAt: '2026-08-24T16:00:00.000Z',
  rates: { USD: 0.0107, GBP: 0.0084, EUR: 0.0098, AED: 0.0393, SGD: 0.0145 },
})

describe('displayCurrencyForCountry', () => {
  it('maps a country to the currency its customers read', () => {
    expect(displayCurrencyForCountry('US')).toBe('USD')
    expect(displayCurrencyForCountry('GB')).toBe('GBP')
    expect(displayCurrencyForCountry('DE')).toBe('EUR')
    expect(displayCurrencyForCountry('AE')).toBe('AED')
  })

  it('accepts the casing and padding a header or a form actually sends', () => {
    expect(displayCurrencyForCountry('us')).toBe('USD')
    expect(displayCurrencyForCountry(' Gb ')).toBe('GBP')
  })

  /**
   * India is absent from the map ON PURPOSE. An Indian customer is charged in
   * rupees and shown rupees with nothing appended — "approximately ₹1,999" for a
   * ₹1,999 charge would present the charge as an estimate of itself.
   */
  it('gives India no approximation, because rupees are the charge', () => {
    expect(displayCurrencyForCountry('IN')).toBeNull()
  })

  it('treats an unknown, empty or absent country as "show rupees"', () => {
    expect(displayCurrencyForCountry('ZZ')).toBeNull()
    expect(displayCurrencyForCountry('')).toBeNull()
    expect(displayCurrencyForCountry(null)).toBeNull()
    expect(displayCurrencyForCountry(undefined)).toBeNull()
  })
})

describe('describePlanPrice', () => {
  /**
   * The guarantee the whole module exists for. A row shows ONE figure and for a
   * customer outside India that figure is a conversion, so `chargeInr` is the
   * only thing on the panel that matches a bank statement. Every branch below
   * re-checks it: a degraded conversion must never degrade the charge.
   */
  it('always states the rupee charge, whatever the row ends up showing', () => {
    expect(describePlanPrice(1999, 'USD', RATES).chargeInr).toBe('₹1,999')
    expect(describePlanPrice(1999, null, null).chargeInr).toBe('₹1,999')
    expect(describePlanPrice(12000, null, null).chargeInr).toBe('₹12,000')
  })

  it('shows the local currency alone, rounded to a whole unit', () => {
    // 1999 × 0.0107 = 21.39, and cents would claim a precision a converted
    // estimate does not have. No rupee figure rides along in `display`.
    expect(describePlanPrice(1999, 'USD', RATES).display).toBe('$21')
    expect(describePlanPrice(7999, 'USD', RATES).display).toBe('$86')
    expect(describePlanPrice(1999, 'GBP', RATES).display).toBe('£17')
  })

  /**
   * `isApproximate` is what the panel keys its disclosure off. If it were ever
   * false while `display` held a conversion, the sentence naming the real charge
   * would not render and the customer would see a foreign figure presented as
   * the amount taken.
   */
  it('flags a converted figure as approximate, and the charge as not', () => {
    expect(describePlanPrice(1999, 'USD', RATES).isApproximate).toBe(true)
    expect(describePlanPrice(1999, null, null).isApproximate).toBe(false)
  })

  it('carries the rate date, so a caller can say "as of" rather than "now"', () => {
    expect(describePlanPrice(1999, 'USD', RATES).rateFetchedAt).toBe('2026-08-24T16:00:00.000Z')
    expect(describePlanPrice(1999, null, null).rateFetchedAt).toBeNull()
  })

  it('shows the rupee charge when there is no currency or no rates', () => {
    expect(describePlanPrice(1999, null, RATES).display).toBe('₹1,999')
    expect(describePlanPrice(1999, 'USD', null).display).toBe('₹1,999')
    expect(describePlanPrice(1999, 'USD', null).isApproximate).toBe(false)
  })

  /**
   * A currency the feed dropped must fall back to the RUPEE price, never to a
   * zero one. `undefined * 1999` is NaN and `0 * 1999` is 0; either would render
   * as "$0 per month", advertising a paid subscription as free.
   */
  it('falls back to rupees for a currency the rate feed did not return', () => {
    expect(describePlanPrice(1999, 'AUD', RATES).display).toBe('₹1,999')
    expect(describePlanPrice(1999, 'CAD', RATES).display).toBe('₹1,999')
    expect(describePlanPrice(1999, 'AUD', RATES).isApproximate).toBe(false)
  })

  it('refuses a rate that is zero, negative or not finite', () => {
    for (const bad of [0, -0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      const fx = { ...RATES, rates: { ...RATES.rates, USD: bad } } as never
      expect(describePlanPrice(1999, 'USD', fx).display).toBe('₹1,999')
      expect(describePlanPrice(1999, 'USD', fx).isApproximate).toBe(false)
    }
  })

  /**
   * A real currency and a real rate can still round to zero on a small enough
   * amount. Showing the rupee charge is the honest outcome; "$0" is not.
   */
  it('shows rupees rather than zero when a price rounds away', () => {
    const result = describePlanPrice(1, 'USD', RATES)
    expect(result.display).toBe('₹1')
    expect(result.isApproximate).toBe(false)
  })

  /**
   * The property that makes the single-figure row safe to ship: a converted
   * display ALWAYS travels with the rupee amount and the flag that tells the
   * caller to print it. Without both, the panel has a price nobody can reconcile.
   */
  it('never converts without also carrying the charge and the flag', () => {
    for (const currency of DISPLAY_CURRENCIES) {
      for (const plan of Object.values(PLAN_CATALOG)) {
        const result = describePlanPrice(plan.priceInr, currency, RATES)
        if (!result.isApproximate) continue
        expect(result.chargeInr).toMatch(/^₹/)
        expect(result.rateFetchedAt).not.toBeNull()
        expect(result.display).not.toBe(result.chargeInr)
      }
    }
  })
})

describe('FxRatesSchema', () => {
  it('refuses a non-positive rate, so a bad cache cannot reach the formatter', () => {
    expect(FxRatesSchema.safeParse({ ...RATES, rates: { USD: 0 } }).success).toBe(false)
    expect(FxRatesSchema.safeParse({ ...RATES, rates: { USD: -1 } }).success).toBe(false)
  })

  it('refuses a base that is not INR, because conversion assumes rupees in', () => {
    expect(FxRatesSchema.safeParse({ ...RATES, base: 'USD' }).success).toBe(false)
  })

  it('refuses rates with no timestamp, which is what makes an "as of" possible', () => {
    const { fetchedAt: _dropped, ...undated } = RATES
    expect(FxRatesSchema.safeParse(undated).success).toBe(false)
  })
})
