import { z } from 'zod'

/**
 * Showing a customer their own currency, without ever claiming it is the charge.
 *
 * ## The one rule this module exists to hold
 *
 * Every plan is billed in RUPEES. There is one gateway, it settles in INR, and
 * nothing here changes that. So a figure in dollars or dirhams is an
 * APPROXIMATION OF A RUPEE CHARGE, never the amount that reaches a card — the
 * issuer applies its own rate on the day, plus whatever foreign-transaction fee
 * it charges, and neither number is visible to us.
 *
 * That is why `describeApproxPrice` returns the rupee figure and the converted
 * one TOGETHER, and why there is no function here that returns a converted
 * amount on its own. A caller cannot accidentally render the dollar figure as
 * the price, because it never receives one it could mistake for the price.
 *
 * This replaces `priceUsd`, a second hand-set price that sat 17 to 19 percent
 * above what the rupee price actually converted to and drifted on its own terms.
 *
 * ## Why a short list rather than every currency a rate API returns
 *
 * A rate feed will happily hand back 150-plus currencies. Formatting is only
 * half the problem; the other half is that nobody here can sanity-check whether
 * a price reads as plausible in a market they have never sold in. An unlisted
 * country sees the rupee price, which is TRUE, rather than a converted figure
 * nobody has ever looked at. Adding a currency is one line and a rate — do it
 * when there is a customer, not in advance.
 */

/**
 * Currencies a price may be approximated in.
 *
 * INR is deliberately NOT here. It is the base everything converts FROM, and
 * "approximately ₹1,999" for a ₹1,999 charge is a rounding error pretending to
 * be a conversion.
 */
export const DISPLAY_CURRENCIES = ['USD', 'GBP', 'EUR', 'AED', 'SGD', 'AUD', 'CAD'] as const

export const DisplayCurrencySchema = z.enum(DISPLAY_CURRENCIES)
export type DisplayCurrency = z.infer<typeof DisplayCurrencySchema>

/**
 * ISO 3166-1 alpha-2 country to the currency its customers read prices in.
 *
 * Not exhaustive and not trying to be — see the header. The euro entries are the
 * euro-area members most likely to appear first; a euro-area country missing
 * here falls back to rupees, which is honest, rather than to a neighbour's
 * currency, which would be a guess wearing a flag.
 *
 * IN IS ABSENT ON PURPOSE. An Indian customer is charged in rupees and shown
 * rupees, with nothing appended. Adding `IN: 'INR'` here would be the one case
 * where the approximation and the charge are the same number, which invites a
 * reader to conclude the two are always the same.
 */
const COUNTRY_CURRENCY: Readonly<Record<string, DisplayCurrency>> = Object.freeze({
  US: 'USD',
  GB: 'GBP',
  AE: 'AED',
  SG: 'SGD',
  AU: 'AUD',
  CA: 'CAD',
  IE: 'EUR',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  PT: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  FI: 'EUR',
})

/**
 * The currency to approximate in for a country, or null for "show rupees only".
 *
 * Null is a real answer and the correct one in three different situations: the
 * customer is in India, we do not know where they are, or they are somewhere
 * this product has not set a currency for. All three should render the same
 * thing — the rupee price, unadorned — because in all three the honest claim is
 * identical.
 */
export function displayCurrencyForCountry(
  countryCode: string | null | undefined,
): DisplayCurrency | null {
  if (!countryCode) return null
  return COUNTRY_CURRENCY[countryCode.trim().toUpperCase()] ?? null
}

/**
 * Rates quoted as "how many units of this currency one RUPEE buys".
 *
 * Stored base-INR rather than base-USD so a conversion is a multiplication with
 * no pivot: a pivot through USD would round twice and would make the USD row a
 * special case of itself.
 *
 * `fetchedAt` is not decoration. A rate with no timestamp cannot be shown as
 * "as of" anything, and an undated figure is the shape the previous hardcoded
 * 88 took while it drifted 8.5 percent.
 */
export const FxRatesSchema = z.object({
  base: z.literal('INR'),
  fetchedAt: z.iso.datetime(),
  /**
   * PARTIAL on purpose. `z.record` with an enum key is exhaustive in Zod 4 — it
   * would demand every currency on every parse, so a feed that dropped one would
   * invalidate the whole set and take the other six approximations down with it.
   * A missing currency must cost only its own figure.
   */
  rates: z.partialRecord(DisplayCurrencySchema, z.number().positive()),
})
export type FxRates = z.infer<typeof FxRatesSchema>

/** A rupee price alongside its approximation, or alongside nothing. */
export interface ApproxPrice {
  /** The charge. Always rupees, always exact, always present. */
  inr: string
  /**
   * The approximation, already formatted with its symbol, or null when there is
   * none to make. Null is the default answer, not an error state: no country, no
   * rate, an unreachable feed and an Indian customer all land here.
   */
  approx: string | null
  /** ISO timestamp of the rate used, for an "as of" line. Null whenever approx is. */
  rateFetchedAt: string | null
}

/** Indian digit grouping — 1,999 and 12,000 read wrong in en-US at four digits and up. */
function formatInr(rupees: number): string {
  return `₹${rupees.toLocaleString('en-IN')}`
}

/**
 * A rupee price and, when one can be made honestly, its local approximation.
 *
 * Rounded to a whole unit. A converted price is already an estimate, and
 * "$23.94" claims a precision the number does not have — it implies the cents
 * are meaningful when the true charge is a rupee amount the customer's bank will
 * convert at a different rate anyway.
 */
export function describeApproxPrice(
  rupees: number,
  currency: DisplayCurrency | null,
  fx: FxRates | null,
): ApproxPrice {
  const inr = formatInr(rupees)
  if (currency === null || fx === null) return { inr, approx: null, rateFetchedAt: null }

  const rate = fx.rates[currency]
  // A rate that is missing, zero or negative yields no approximation rather than
  // a zero price. `0 <= 0` on a subscription is the exact shape of a figure with
  // nothing behind it.
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    return { inr, approx: null, rateFetchedAt: null }
  }

  const converted = Math.round(rupees * rate)
  // A price that rounds to zero is not a price. Better to say nothing than to
  // advertise a subscription as free in someone's local currency.
  if (converted <= 0) return { inr, approx: null, rateFetchedAt: null }

  const approx = new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(converted)

  return { inr, approx, rateFetchedAt: fx.fetchedAt }
}
