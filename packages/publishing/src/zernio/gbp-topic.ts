import { parseIsoDate, refuseGbpTopic, type VariantOptions } from './variant-options'
import type { PlatformData, PlatformDataResult } from './platform-data'

/**
 * The Google topic — a what's-new post, an event or an offer — folded onto
 * whatever the button left behind.
 *
 * ── EVERY RULE APPLIED HERE IS OURS ─────────────────────────────────────────
 * Zernio validates none of this: `topicType: 'BANANA'` passes their dry run, and
 * so does an `EVENT` with no event object at all (MEASURED, docs/32 §4.3). Google
 * itself returns a 400 for a missing `startDate` — a refusal that arrives after
 * the credit is spent. `refuseGbpTopic` catches it first.
 *
 * The date shape is Google's and NOT ISO 8601: `{year, month, day}` as numbers,
 * quoted in their schema description (docs/31 §2.4). Sending a string here is
 * the kind of mistake that returns 200 and produces an event with no date.
 */
export function withGbpTopic(
  base: PlatformData,
  options: VariantOptions | undefined,
): PlatformDataResult {
  const refusal = refuseGbpTopic(options ?? {})
  if (refusal !== null) return { ok: false, refusal }

  const topic = options?.gbpTopic
  if (topic === undefined) {
    return { ok: true, data: Object.keys(base).length === 0 ? undefined : base }
  }

  if (topic === 'EVENT') {
    // ── RE-CHECKED, NOT ASSERTED ─────────────────────────────────────────────
    // `refuseGbpTopic` above guarantees both of these are present and valid, so
    // `!` would be correct today. It would also mean that the day someone
    // loosens that refusal — reasonably, for a reason unrelated to this file —
    // the publish path throws a TypeError instead of refusing, on the one path
    // where a crash is indistinguishable from an outage. The cost of asking
    // again is two comparisons; the cost of being wrong is a customer's post
    // failing as `ADAPTER_ERROR` with a transient classification and retrying
    // forever.
    const event = options?.gbpEvent
    const startDate = event === undefined ? null : parseIsoDate(event.startDate)
    if (event === undefined || startDate === null) {
      return {
        ok: false,
        refusal: {
          code: 'GBP_EVENT_NEEDS_DATE',
          message: 'An event needs a start date. Google refuses the post without one.',
        },
      }
    }
    const endRaw = event.endDate?.trim()
    const endDate = endRaw === undefined || endRaw === '' ? null : parseIsoDate(endRaw)
    return {
      ok: true,
      data: {
        ...base,
        topicType: 'EVENT',
        event: {
          title: event.title.trim(),
          schedule: { startDate, ...(endDate === null ? {} : { endDate }) },
        },
      },
    }
  }

  const offer = options?.gbpOffer ?? {}
  const trimmed = (value: string | undefined) => {
    const out = value?.trim() ?? ''
    return out === '' ? undefined : out
  }
  const couponCode = trimmed(offer.couponCode)
  const redeemOnlineUrl = trimmed(offer.redeemUrl)
  const termsConditions = trimmed(offer.terms)
  return {
    ok: true,
    data: {
      ...base,
      topicType: 'OFFER',
      offer: {
        ...(couponCode === undefined ? {} : { couponCode }),
        ...(redeemOnlineUrl === undefined ? {} : { redeemOnlineUrl }),
        ...(termsConditions === undefined ? {} : { termsConditions }),
      },
    },
  }
}
