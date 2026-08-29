'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'

import { startCheckout } from '@/app/actions/wallet'
import { CheckoutResult } from '@/components/wallet/checkout-result'
import { Modal } from '@/components/ui/modal'
import type { PlanOfferRow } from '@/lib/billing/plan-offer-rows'
import type { CheckoutState } from '@/lib/wallet/checkout-state'

import { PlanOfferCards } from './plan-offer-cards'

/**
 * THE PLANS, PUT IN FRONT OF A WORKSPACE THAT IS NOT ON ONE.
 *
 * Whether it should open at all is decided on the SERVER by
 * `lib/billing/plan-offer.ts`, from the same subscription read `/settings/plan`
 * uses. This component is only mounted when that decision says `offer`, so it
 * never has to guess, and there is no plan state duplicated on the client that
 * could disagree with the account.
 *
 * ── ONCE PER SIGN-IN, AND THE KEY IS WHY ─────────────────────────────────────
 * The brief asks for two things that pull apart: it must not come back during
 * the same session after somebody closes it, and it MUST come back if they sign
 * out and sign in again without buying anything.
 *
 * A plain "dismissed" flag satisfies the first and breaks the second — it would
 * silence the offer on that browser forever. A session COOKIE breaks it too:
 * signing out does not clear one, so the next sign-in in the same browser stays
 * silent.
 *
 * So the stored value is the CLERK SESSION ID. Dismissing records "not again for
 * session X"; signing out and back in mints session Y, which does not match, and
 * the offer returns. One key, overwritten rather than accumulated, so it cannot
 * grow.
 *
 * ── AND IT ARRIVES AS A PROP, BECAUSE `useAuth()` COSTS 230 kB ───────────────
 * This read the id itself with `useAuth()` from `@clerk/nextjs`, which is tidier
 * and was measured to be very expensive: /home is a route with no other Clerk
 * CLIENT component on it, so that one hook pulled Clerk's browser SDK into the
 * dashboard's bundle. `scripts/perf/js-budget.mjs` failed the build at
 * **900.8 kB against a 670.8 kB budget, +230.0 kB** — on the most visited screen
 * in the product.
 *
 * `auth()` on the SERVER costs the browser nothing: the page already renders on
 * the server and the id travels as a string in the payload. The reason it was
 * moved to the client in the first place was that `auth()` broke four of /home's
 * own tests, and that was a test-harness problem with a test-harness fix (mock
 * the module), not a reason to ship a quarter of a megabyte. `localStorage` rather than `sessionStorage` deliberately: a second tab
 * in the same sign-in is the same session and must stay quiet, and the session
 * id already does the expiring that `sessionStorage` would have done crudely.
 *
 * ── WHEN STORAGE ITSELF FAILS ────────────────────────────────────────────────
 * Reading `localStorage` throws outright in some privacy modes. A throw on READ
 * is treated as "not dismissed", so the offer still opens: the failure mode of
 * showing it is a closable dialog, and the failure mode of hiding it is a
 * customer who is never told there are plans. A throw on WRITE means the
 * dismissal is not remembered and the offer returns on the next visit to the
 * dashboard, which is annoying and honest, and there is nothing else this
 * component could do about it.
 */
const DISMISSED_KEY = 'sahoda.plan-offer-dismissed'

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}

function writeDismissed(sessionKey: string): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, sessionKey)
  } catch {
    // Nothing to do and nothing to report: see the header.
  }
}

export interface PlanOfferModalProps {
  /**
   * The current Clerk session id, resolved on the server by the page. Required,
   * and the page renders nothing at all when it has none: a dismissal filed
   * under a key that is not a sign-in cannot come back at the next one, which is
   * the whole behaviour asked for.
   */
  sessionKey: string
  /**
   * The cards' content, built on the server. Not read from `PLAN_CATALOG` here:
   * a value import from `@sahoda/shared` in this client tree cost /home 89.2 kB
   * and failed the build. See `lib/billing/plan-offer-rows.ts`.
   */
  plans: readonly PlanOfferRow[]
}

export function PlanOfferModal({ sessionKey, plans }: PlanOfferModalProps) {
  const key = sessionKey
  const [open, setOpen] = useState(false)
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null)
  /** The plan the last attempt was for, so a retry retries THAT one and not a default. */
  const [lastPlanId, setLastPlanId] = useState<string | null>(null)
  const [result, setResult] = useState<CheckoutState | null>(null)
  const [, startTransition] = useTransition()

  /**
   * OPENS FROM AN EFFECT, NEVER FROM THE FIRST RENDER.
   *
   * `localStorage` does not exist on the server, so deciding `open` during
   * render would be a hydration mismatch: the server would say one thing and the
   * browser another, and React would throw away the tree. Starting closed and
   * opening after mount is also what gives the entrance its first frame to
   * animate from.
   */
  useEffect(() => {
    if (readDismissed() !== key) setOpen(true)
  }, [key])

  /**
   * Closing is the same act however it happens — the X, Escape, or a click on
   * the backdrop — because `Modal` funnels all three through `onClose`. Each one
   * records the dismissal, so a person who presses Escape is not asked again two
   * screens later.
   */
  const close = useCallback(() => {
    writeDismissed(key)
    setOpen(false)
  }, [key])

  function choose(planId: string) {
    setResult(null)
    setLastPlanId(planId)
    setBusyPlanId(planId)
    startTransition(async () => {
      /**
       * ── THE CATCH IS NOT DECORATION ────────────────────────────────────────
       * `startCheckout` returns a `CheckoutState` for every outcome it knows
       * about, so this only fires when the CALL itself fails — a redeploy
       * mid-flight, a dropped connection. Without it `setBusyPlanId(null)` never
       * runs, and the grid sits at 45% opacity with one button spinning for
       * ever, saying nothing. `top-up-panel.tsx` has the same shape and the same
       * exposure; this is the version that does not.
       */
      let state: CheckoutState
      try {
        state = await startCheckout(planId)
      } catch {
        state = {
          ok: false,
          message: 'Sahoda could not reach the checkout.',
        }
      }
      setBusyPlanId(null)
      setResult(state)
    })
  }

  /**
   * ── UNMOUNTED WHEN SHUT, AND THAT IS NOT A TIDINESS CHOICE ─────────────────
   *
   * A closed `<dialog>` is still in the document. It computes `display: none`,
   * so nothing is painted and nothing is announced — and every guard that counts
   * DOM NODES rather than pixels still sees all of it.
   *
   * FOUND by an adversarial review of this change, against
   * `page-dash-hierarchy.spec.ts`, which asserts /home carries at most one
   * `type-hero-num` and at most one statement of absence. This dialog holds
   * three prices at `type-hero-num` and a sentence containing the word
   * "nothing", and `locator.count()` has no visibility filter. Both assertions
   * would have gone red on the dashboard even for somebody who had closed the
   * dialog, or who never saw it because they are on a paid plan and it renders
   * shut.
   *
   * Rendering nothing when it is shut makes the dashboard's DOM identical to
   * what it was before this change, which is the property those guards are
   * entitled to. The dialog only exists while it is open.
   */
  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={close}
      title="Choose the right plan for you"
      /* ── WHAT THIS SENTENCE MAY AND MAY NOT CLAIM ──────────────────────────
         It states the plan they are on and what a paid plan does. It does NOT
         say "subscribe", "renew" or "every month you will receive", because
         nothing in production writes a `subscriptions` row or takes a second
         payment: one payment buys one period, keyed on (plan, period,
         workspace). `top-up-panel.tsx` refused the word "Subscription" in its
         own heading for exactly this reason, and a dialog that reinstated the
         promise one screen over would make that refusal decorative. */
      description="This workspace is on Free. A paid plan grants more credits for the month you pay for, and lifts how many channels, sites and seats it can use."
      /* The primitive's own width is 560px, which is a form. Three plan cards
         need room to sit side by side, and `cn` is tailwind-merge, so this
         replaces the width rather than fighting it. Still capped against the
         viewport, so a phone gets the same 16px gutters. */
      className="w-[min(1040px,calc(100vw-32px))] enter"
    >
      <div className="space-y-4">
        {/* ── NO MONTHLY / ANNUAL TOGGLE, AND THAT IS A MEASUREMENT ───────────
            The brief asks for one "if already supported". It is not supported:
            `PLAN_CATALOG` carries a single `priceInr` per plan and there is no
            annual price, no annual grant and no annual period anywhere in this
            repository. A toggle would need a second price and a "Save XX%"
            figure, and both would have to be invented — which is the one thing
            this product may never do with a number about somebody's money.

            So the period is STATED instead of offered. When an annual price
            exists in the catalog, this line is where the toggle goes.

            ── AND IT SAYS "PER MONTH", NOT "BILLED MONTHLY" ────────────────
            The first draft read "Billed monthly, in rupees", and an adversarial
            review was right to call it the renewal claim `top-up-panel.tsx`
            already refused: "billed monthly" describes a recurring charge, and
            nothing here takes a second payment. "Per month" is the plan's RATE,
            which is what the catalog actually carries, and it agrees with the
            dialog's own description one line up rather than contradicting it. */}
        <p className="type-sm text-muted">
          Prices are per month, in rupees. Nothing is charged until a payment completes.
        </p>

        <PlanOfferCards plans={plans} busyPlanId={busyPlanId} onChoose={choose} />

        {/* The result of pressing a plan, in the SAME component the wallet uses.
            It is the one place that knows how to tell a live session from a
            sandbox order from a failure, and a second opinion about that here is
            how one of the two starts calling a fixture a purchase.

            It is imported from its OWN module, not from the wallet panel it used
            to live in. That import cost 236.5 kB on /home and failed the build
            on `js-budget`: one component out of that file drags the whole panel
            with it. See `checkout-result.tsx`.

            ── AND NOTHING NAVIGATES ON ITS OWN ─────────────────────────────
            A live session used to be followed with `window.location.assign`,
            which is wrong twice. `actions/wallet.ts` records that the live URL
            points at `/billing/checkout/{orderId}`, a bridge page that does not
            hand `payment_session_id` to `cashfree-js` yet — so the dashboard
            would be replaced by a page that cannot take a payment, with no way
            back. And it made this component's live branch unreachable, which
            means the shared result renderer would have been imported for two
            outcomes out of three. The wallet's answer is a link the person
            presses, and it is the right one here for the same reason. */}
        {result !== null && lastPlanId !== null ? (
          <CheckoutResult result={result} onRetry={() => choose(lastPlanId)} />
        ) : null}

        {/* ── WHERE THEY ARE NOW, AND THE WAY OUT THAT IS NOT A PURCHASE ──────
            Closing this dialog leaves the dashboard working, so the sentence
            says so.

            ── THE LINK IS NOT `text-accent`, AND THAT IS MEASURED ────────────
            `--acc` on `--surface` is 2.936:1 in light, under the 4.5:1 floor for
            text and under 3:1 as well. `top-up-panel.tsx` records the same pair
            and keeps its accent on a GLYPH for it. A link is text, so it carries
            its distinction in the underline and the weight, on ink that passes. */}
        <p className="type-sm border-t border-line-soft pt-4 text-muted">
          Close this to keep working on Free. The plans are always on{' '}
          <a href="/settings/plan" className="font-[550] text-ink underline underline-offset-2">
            Plan and credits
          </a>
          .
        </p>
      </div>
    </Modal>
  )
}
