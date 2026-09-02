'use client'

import { refuseGbpTopic } from '@sahoda/publishing/format'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { VariantExtras } from '@/lib/posts/variant-extras'
import { optionsFromExtras } from '@/lib/posts/variant-options'

/**
 * What KIND of Google post this is — an update, an event, or an offer.
 *
 * ── THE TWO POST TYPES AN INDIAN SMB ACTUALLY WANTS FROM GOOGLE ────────────
 * A shop's Google presence is mostly "we are open" and "come to this thing on
 * Saturday" and "10% off this week". Only the first was reachable; the other two
 * live behind `platformSpecificData.googlebusiness.topicType`, which this product
 * has never sent (docs/31 §3).
 *
 * ── AND EVERY RULE ENFORCED HERE IS OURS, BECAUSE NOBODY ELSE HAS ONE ──────
 * MEASURED 2026-08-20: Zernio's dry-run validator checks Google's
 * `platformSpecificData` NOT AT ALL. `topicType: 'BANANA'` passes. An `EVENT`
 * with no event object passes. Google itself returns a 400 for a missing start
 * date — a refusal that arrives after the credit is spent and the writer has gone
 * home. So `refuseGbpTopic` runs here AND before the adapter, and it is the same
 * function in both places.
 *
 * Progressive disclosure: an update is the default and shows nothing extra. The
 * date boxes exist only for an event, the coupon boxes only for an offer.
 */

const SELECT_CLASS =
  'h-input w-full rounded-sm bg-s1 px-2.5 text-[13px] text-ink transition-micro surface-ring-firm focus:bg-surface focus:outline-none max-narrow:min-h-[44px]'

export interface GbpTopicOptionsProps {
  extras: VariantExtras
  onExtrasChange: (patch: VariantExtras) => void
}

export function GbpTopicOptions({ extras, onExtrasChange }: GbpTopicOptionsProps) {
  const topic = extras.gbpTopic
  const event = extras.gbpEvent
  const offer = extras.gbpOffer

  // The publish path's own verdict, run on the publish path's own shape. Held
  // back until the writer has begun, so an untouched event is not scolded.
  const started =
    topic === 'EVENT'
      ? (event?.title ?? '') !== '' || (event?.startDate ?? '') !== ''
      : topic === 'OFFER'
  const refusal = started ? refuseGbpTopic(optionsFromExtras(extras) ?? {}) : null

  return (
    <div className="narrow:col-span-2 space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor="gbp-topic">Kind of Google post</Label>
        <select
          id="gbp-topic"
          data-gbp-topic
          className={SELECT_CLASS}
          value={topic ?? ''}
          onChange={(e) => {
            const next = e.target.value === '' ? undefined : (e.target.value as 'EVENT' | 'OFFER')
            // Switching away clears the other kind's fields. Leaving them behind
            // would send an offer's coupon on a post that is now an event.
            onExtrasChange({
              gbpTopic: next,
              gbpEvent: next === 'EVENT' ? (event ?? { title: '', startDate: '' }) : undefined,
              gbpOffer: next === 'OFFER' ? (offer ?? {}) : undefined,
            })
          }}
        >
          <option value="">What&rsquo;s new</option>
          <option value="EVENT">An event</option>
          <option value="OFFER">An offer</option>
        </select>
      </div>

      {topic === 'EVENT' ? (
        <div className="space-y-2 rounded-sm bg-s1 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="gbp-event-title">What it is called</Label>
            <Input
              id="gbp-event-title"
              data-gbp-event-title
              value={event?.title ?? ''}
              placeholder="Diwali sale"
              onChange={(e) =>
                onExtrasChange({
                  gbpEvent: { startDate: '', ...(event ?? {}), title: e.target.value },
                })
              }
            />
          </div>
          <div className="grid gap-2 narrow:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gbp-event-start">Starts</Label>
              <Input
                id="gbp-event-start"
                data-gbp-event-start
                type="date"
                value={event?.startDate ?? ''}
                onChange={(e) =>
                  onExtrasChange({
                    gbpEvent: { title: '', ...(event ?? {}), startDate: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gbp-event-end">Ends (optional)</Label>
              <Input
                id="gbp-event-end"
                data-gbp-event-end
                type="date"
                value={event?.endDate ?? ''}
                onChange={(e) =>
                  onExtrasChange({
                    gbpEvent: {
                      title: '',
                      startDate: '',
                      ...(event ?? {}),
                      endDate: e.target.value,
                    },
                  })
                }
              />
            </div>
          </div>
        </div>
      ) : null}

      {topic === 'OFFER' ? (
        <div className="space-y-2 rounded-sm bg-s1 p-3">
          <p className="text-[12.5px] text-muted">
            Fill in at least one of these. An offer with none of them publishes as an ordinary
            update.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="gbp-offer-coupon">Coupon code</Label>
            <Input
              id="gbp-offer-coupon"
              data-gbp-offer-coupon
              value={offer?.couponCode ?? ''}
              placeholder="DIWALI10"
              onChange={(e) =>
                onExtrasChange({ gbpOffer: { ...(offer ?? {}), couponCode: e.target.value } })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gbp-offer-url">Where to redeem it</Label>
            <Input
              id="gbp-offer-url"
              data-gbp-offer-url
              type="url"
              inputMode="url"
              value={offer?.redeemUrl ?? ''}
              placeholder="https://"
              onChange={(e) =>
                onExtrasChange({ gbpOffer: { ...(offer ?? {}), redeemUrl: e.target.value } })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gbp-offer-terms">Terms</Label>
            <Input
              id="gbp-offer-terms"
              data-gbp-offer-terms
              value={offer?.terms ?? ''}
              placeholder="One per customer."
              onChange={(e) =>
                onExtrasChange({ gbpOffer: { ...(offer ?? {}), terms: e.target.value } })
              }
            />
          </div>
        </div>
      ) : null}

      {refusal !== null ? (
        <p role="alert" className="text-[12.5px] text-danger">
          {refusal.message}
        </p>
      ) : null}
    </div>
  )
}
