import { describe, it, expect } from 'vitest'
import {
  DISPLAY_CURRENCIES,
  FxRatesSchema,
  describeApproxPrice,
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

describe('describeApproxPrice', () => {
  /**
   * The guarantee the whole module exists for: the rupee figure is ALWAYS
   * present and always exact, whatever happens to the conversion. Every branch
   * below re-checks it, because a degraded approximation must never degrade the
   * price itself.
   */
  it('always states the rupee charge, in Indian digit grouping', () => {
    expect(describeApproxPrice(1999, 'USD', RATES).inr).toBe('₹1,999')
    expect(describeApproxPrice(1999, null, null).inr).toBe('₹1,999')
    expect(describeApproxPrice(12000, null, null).inr).toBe('₹12,000')
  })

  it('approximates in the local currency, rounded to a whole unit', () => {
    // 1999 × 0.0107 = 21.39, and cents would claim a precision a converted
    // estimate does not have.
    expect(describeApproxPrice(1999, 'USD', RATES).approx).toBe('$21')
    expect(describeApproxPrice(7999, 'USD', RATES).approx).toBe('$86')
  })

  it('carries the rate date, so a caller can say "as of" rather than "now"', () => {
    expect(describeApproxPrice(1999, 'USD', RATES).rateFetchedAt).toBe('2026-08-24T16:00:00.000Z')
  })

  it('makes no approximation when there is no currency or no rates', () => {
    expect(describeApproxPrice(1999, null, RATES).approx).toBeNull()
    expect(describeApproxPrice(1999, 'USD', null).approx).toBeNull()
    // And the date goes with it — an "as of" line for a figure nobody can see.
    expect(describeApproxPrice(1999, 'USD', null).rateFetchedAt).toBeNull()
  })

  /**
   * A currency the feed dropped must yield NO figure rather than a zero one.
   * `undefined * 1999` is NaN and `0 * 1999` is 0; both would render, and "$0
   * per month" advertises a paid subscription as free.
   */
  it('yields nothing for a currency the rate feed did not return', () => {
    expect(describeApproxPrice(1999, 'AUD', RATES).approx).toBeNull()
    expect(describeApproxPrice(1999, 'CAD', RATES).approx).toBeNull()
  })

  it('refuses a rate that is zero, negative or not finite', () => {
    for (const bad of [0, -0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      const fx = { ...RATES, rates: { ...RATES.rates, USD: bad } } as never
      expect(describeApproxPrice(1999, 'USD', fx).approx).toBeNull()
    }
  })

  /**
   * A real currency and a real rate can still round to zero on a small enough
   * amount. Saying nothing is the honest outcome; "$0" is not.
   */
  it('says nothing rather than zero when a price rounds away', () => {
    const result = describeApproxPrice(1, 'USD', RATES)
    expect(result.approx).toBeNull()
    expect(result.inr).toBe('₹1')
  })

  it('never returns a converted figure without the rupee figure beside it', () => {
    for (const currency of DISPLAY_CURRENCIES) {
      for (const plan of Object.values(PLAN_CATALOG)) {
        const result = describeApproxPrice(plan.priceInr, currency, RATES)
        if (result.approx !== null) expect(result.inr).toMatch(/^₹/)
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
