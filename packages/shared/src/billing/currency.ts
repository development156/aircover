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
 * A price ROW shows one figure, in the customer's own currency (founder's
 * ruling, 2026-08-25). So `describePlanPrice` returns that figure together with
 * `chargeInr` and an `isApproximate` flag: the caller is handed the real amount
 * and told when it differs, and the panel states it before the checkout button.
 * A converted figure with the charge nowhere on the screen would be a price the
 * customer cannot reconcile against their own statement.
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

/** What a plan costs, as the customer reads it and as the card is charged. */
export interface PlanPriceDisplay {
  /**
   * The ONE figure a price row shows. Local currency where there is a rate for
   * the customer's country, rupees everywhere else.
   */
  display: string
  /**
   * The charge, always in rupees, always exact, always present — whatever
   * `display` ended up being.
   *
   * Separate from `display` because it is a DIFFERENT FACT, not a formatting of
   * the same one. Whenever `isApproximate` is true these two disagree, and the
   * caller is required to put this one in front of the customer before they
   * commit: a local figure with no charge beside it anywhere is a price nobody
   * can check against their own statement.
   */
  chargeInr: string
  /**
   * True when `display` is a conversion rather than the charge. Drives the
   * sentence that says so; a caller that ignores it renders a foreign figure as
   * if it were the amount taken.
   */
  isApproximate: boolean
  /** ISO timestamp of the rate behind `display`, or null when it is the charge itself. */
  rateFetchedAt: string | null
}

/** Indian digit grouping — 1,999 and 12,000 read wrong in en-US at four digits and up. */
function formatInr(rupees: number): string {
  return `₹${rupees.toLocaleString('en-IN')}`
}

/**
 * A plan's price in the currency the customer reads, plus the rupee charge behind it.
 *
 * ## One number on the row, and why that needs care
 *
 * Founder's ruling, 2026-08-25: a price row shows a SINGLE figure, in the
 * customer's own currency. Not "₹1,999 (about £15)" — just "£15".
 *
 * That is a normal thing for an international product to do and it reads far
 * better. It also means the number on the row is, for anyone outside India, NOT
 * the number their bank takes: the charge settles in rupees, their issuer
 * converts at its own rate on the day and adds its own fee, so a £15 row lands
 * near £15 on a statement and never exactly on it.
 *
 * So `chargeInr` is returned ALONGSIDE, always, and the panel puts it on the
 * checkout line. The row is for comparing plans; the charge is stated before the
 * button. Dropping that line would leave a figure the customer cannot reconcile
 * with anything, which is the one class of number this product may not show.
 *
 * Rounded to a whole unit: a converted price is an estimate, and "£15.34"
 * claims a precision it does not have.
 */
export function describePlanPrice(
  rupees: number,
  currency: DisplayCurrency | null,
  fx: FxRates | null,
): PlanPriceDisplay {
  const inr = formatInr(rupees)
  const asCharge: PlanPriceDisplay = {
    display: inr,
    chargeInr: inr,
    isApproximate: false,
    rateFetchedAt: null,
  }
  if (currency === null || fx === null) return asCharge

  const rate = fx.rates[currency]
  // A rate that is missing, zero or negative shows the RUPEE price rather than a
  // zero one. Falling back to the charge is always safe; falling back to `0` in a
  // foreign currency advertises a paid subscription as free.
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return asCharge

  const converted = Math.round(rupees * rate)
  // A price that rounds to zero is not a price.
  if (converted <= 0) return asCharge

  const display = new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(converted)

  return { display, chargeInr: inr, isApproximate: true, rateFetchedAt: fx.fetchedAt }
}
