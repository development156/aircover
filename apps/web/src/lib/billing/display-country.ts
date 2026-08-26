import 'server-only'

import { headers } from 'next/headers'

/**
 * Which country to price a screen for, and which signal is allowed to say so.
 *
 * ## Declared beats detected, always
 *
 * This product already knows a customer's country properly: `billing_profiles`
 * carries the `country_code` they entered themselves, and the tax engine uses it
 * to decide `overseas` treatment on a real invoice. That value has consequences
 * under tax law, which makes it the strongest claim available.
 *
 * A geo-IP header is a guess about where a request came from — not where the
 * business is. An Indian customer in a Dubai airport is still an Indian
 * customer, and pricing them in dirhams while their invoice reads rupees would
 * make the product contradict its own paperwork.
 *
 * So detection only fills the gap BEFORE a customer has told us anything, which
 * is most of the pricing surface: a signed-out visitor, or someone who has not
 * reached billing details yet.
 *
 * ## The header, and why it is never wrong-but-plausible
 *
 * `x-vercel-ip-country` is set by Vercel's edge for every request and cannot be
 * set by the client — an inbound header of the same name is overwritten. Off
 * Vercel it is simply absent, which resolves to null, which renders rupees. So
 * running locally shows the same thing an unknown country does, rather than a
 * developer's own location leaking into a screenshot.
 *
 * `XX` is Vercel's own "unknown", and `T1` is its Tor marker. Both are
 * explicitly not countries and are mapped to null rather than allowed to miss
 * the currency table by accident.
 */

/** Values the header uses for "we could not tell", which are not countries. */
const NON_COUNTRIES = new Set(['XX', 'T1'])

function normalise(raw: string | null | undefined): string | null {
  if (!raw) return null
  const code = raw.trim().toUpperCase()
  if (code.length !== 2 || NON_COUNTRIES.has(code)) return null
  return code
}

/**
 * The country this request appears to come from, or null when it cannot be told.
 *
 * Only ever a fallback. Pass the declared billing country to
 * `resolveDisplayCountry` and this is consulted only if that is absent.
 */
export async function detectedCountry(): Promise<string | null> {
  try {
    const headerList = await headers()
    return normalise(headerList.get('x-vercel-ip-country'))
  } catch {
    // `headers()` throws outside a request scope. Null renders rupees, which is
    // the right answer for a context that has no visitor in it at all.
    return null
  }
}

/**
 * The country a price should be shown for: what the customer declared, else what
 * the edge detected, else nothing.
 *
 * SYNCHRONOUS ON PURPOSE, and it takes the detected country as an argument
 * rather than fetching it.
 *
 * The obvious signature is `async resolve(declared)` that awaits the header
 * itself. It was written that way first, and `read-waterfall.test.ts` failed it:
 * awaiting a declared country and then awaiting a detected one turns two
 * independent lookups into a chain, and the wallet page went from 6 sequential
 * reads to 8. Taking both as values forces the caller to gather them in its own
 * `Promise.all`, where they belong.
 *
 * Returning null is a first-class answer and means "show the rupee price alone".
 */
export function pickDisplayCountry(
  declaredCountryCode: string | null | undefined,
  detectedCountryCode: string | null | undefined,
): string | null {
  return normalise(declaredCountryCode) ?? normalise(detectedCountryCode)
}
