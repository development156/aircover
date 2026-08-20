'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { gbpCtaTypes, isValidGbpCta } from '@/lib/posts/variant-extras'
import type { VariantExtras } from '@/lib/posts/variant-extras'

/** The word a person uses, per Google's code. Never the code on its own. */
const CTA_LABEL: Readonly<Record<string, string>> = {
  BOOK: 'Book',
  ORDER: 'Order online',
  SHOP: 'Shop',
  LEARN_MORE: 'Learn more',
  SIGN_UP: 'Sign up',
  CALL: 'Call now',
}

const SELECT_CLASS =
  'h-input w-full rounded-sm bg-s1 px-2.5 text-[13px] text-ink transition-micro shadow-[inset_0_0_0_1px_var(--line)] focus:bg-surface focus:outline-none max-narrow:min-h-[44px]'

export interface GbpOptionsProps {
  extras: VariantExtras
  onExtrasChange: (patch: VariantExtras) => void
}

/**
 * Google's button, which is two fields and has only ever been one.
 *
 * ── WHAT WAS BROKEN, EXACTLY ─────────────────────────────────────────────────
 * The picker offered six call-to-action types, wrote the choice to
 * `post_variants.extras.gbpCta`, and the choice died there: `formatForPlatform`
 * never filled `ctaType`, and the Zernio adapter sent no `platformSpecificData`
 * at all. The writer picked "Order online", saw it saved, and Google showed no
 * button. Against NO DEAD ENDS that is worse than the control being absent — an
 * absent control makes no promise.
 *
 * ── AND WHY THE URL IS NOT OPTIONAL ──────────────────────────────────────────
 * Zernio's `GoogleBusinessPlatformData.callToAction` declares
 * `required: ['type', 'url']` (docs/31 §2.4, read out of their OpenAPI document).
 * A button with no destination is a payload that is rejected, not a feature that
 * partly works — so the field appears the moment a button is chosen, and the
 * publish refuses without it rather than quietly dropping the button.
 *
 * ── PROGRESSIVE DISCLOSURE ───────────────────────────────────────────────────
 * No button, no URL field. Most Google posts are an update with no button at
 * all, and a second empty box on every one of them is the thing this screen is
 * being rebuilt to stop.
 */
export function GbpOptions({ extras, onExtrasChange }: GbpOptionsProps) {
  const storedCta = extras.gbpCta
  const chosen = storedCta !== undefined && storedCta !== ''
  const ctaUnknown = chosen && !isValidGbpCta(storedCta)
  const url = extras.ctaUrl ?? ''
  const urlMissing = chosen && !ctaUnknown && url.trim() === ''

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="cta-gbp">Button</Label>
        <select
          id="cta-gbp"
          data-gbp-cta
          value={storedCta ?? ''}
          onChange={(event) => {
            const next = event.target.value === '' ? undefined : event.target.value
            // Clearing the button clears its destination too. A stray URL left
            // behind would be sent on the next button anyone picked.
            onExtrasChange(
              next === undefined ? { gbpCta: undefined, ctaUrl: undefined } : { gbpCta: next },
            )
          }}
          className={SELECT_CLASS}
        >
          <option value="">No button</option>
          {gbpCtaTypes().map((cta) => (
            <option key={cta} value={cta}>
              {CTA_LABEL[cta] ?? cta}
            </option>
          ))}
        </select>
        {ctaUnknown ? (
          <p className="text-[12.5px] text-warn">
            The saved button is not one Google offers — pick one from the list.
          </p>
        ) : null}
      </div>

      {chosen && !ctaUnknown ? (
        <div className="space-y-1.5">
          <Label htmlFor="cta-url-gbp">Where the button goes</Label>
          <Input
            id="cta-url-gbp"
            data-gbp-cta-url
            type="url"
            inputMode="url"
            value={url}
            error={urlMissing}
            placeholder="https://"
            onChange={(event) => onExtrasChange({ ctaUrl: event.target.value })}
          />
          {urlMissing ? (
            <p role="alert" className="text-[12.5px] text-danger">
              Google needs a web address for this button, or the post is refused.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
