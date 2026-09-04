'use client'

import { useState, useTransition } from 'react'
import { SELECTABLE_GST_STATES, type BillingProfile } from '@sahoda/shared'

import { saveBillingDetails } from '@/app/actions/billing'
import { SettingCard } from '@/components/settings/setting-row'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { PlanActionState } from '@/lib/billing/plan-state'

/**
 * Who the invoice is made out to.
 *
 * ── THREE IDENTITIES, NOT ONE FORM WITH OPTIONAL FIELDS ──────────────────────
 * A registered Indian business, an unregistered Indian customer, and a customer outside
 * India are three different TAX OUTCOMES — CGST+SGST, IGST, or a zero-rated export. So the
 * form asks one question first and then shows only the fields that answer belongs to. A
 * single form with a nullable GSTIN lets "registered with no GSTIN" be filled in, and that
 * is precisely the state that produces a wrong invoice.
 *
 * ── AND THE GSTIN IS CHECKED IN THREE PLACES, ON PURPOSE ─────────────────────
 * Here (so the message lands next to the field), in the server action, and in Postgres
 * (`app.gstin_is_valid`). The last one is the only one that is a guard: the RPC is reachable
 * by any signed-in user with arbitrary arguments. The first two are courtesy.
 */
type TaxKind = 'registered' | 'unregistered' | 'overseas'

const KIND_LABELS: Record<TaxKind, string> = {
  registered: 'A business in India with a GSTIN',
  unregistered: 'A business or person in India without a GSTIN',
  overseas: 'Outside India',
}

export function BillingDetailsForm({ profile }: { profile: BillingProfile | null }) {
  const [taxKind, setTaxKind] = useState<TaxKind>((profile?.tax_kind as TaxKind) ?? 'unregistered')
  const [legalName, setLegalName] = useState(profile?.legal_name ?? '')
  const [gstin, setGstin] = useState(profile?.gstin ?? '')
  const [stateCode, setStateCode] = useState(profile?.state_code ?? '')
  const [countryCode, setCountryCode] = useState(profile?.country_code ?? '')
  const [address, setAddress] = useState(profile?.address ?? '')
  const [outcome, setOutcome] = useState<PlanActionState | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setOutcome(null)
    startTransition(async () => {
      setOutcome(
        await saveBillingDetails({
          taxKind,
          legalName,
          gstin,
          stateCode,
          countryCode,
          address,
        }),
      )
    })
  }

  /**
   * ── ONE CARD GRAMMAR PER SCREEN, REDISCOVERED ────────────────────────────────
   * This built its OWN card — `surface-ring rounded-card bg-surface` with an
   * inline `type-h2` — while the Credits card beside it used `SettingCard` with
   * a `type-h3` head and the Invoices table brought a third container of its
   * own. Three treatments and two heading levels for three sibling sections on
   * one page, which is what made it read as a collection of forms rather than a
   * screen.
   *
   * `setting-row.tsx` already carries this exact finding: "Two treatments on one
   * screen read as two products", written when `YourDataPanel` did the same
   * thing on `/settings`. The fix there was to adopt `SettingCard`, and it is
   * the fix here. Nothing about the form's behaviour, fields or actions moves.
   */
  return (
    <SettingCard
      title="Billing details"
      hint="The name and tax details on every invoice Sahoda issues from now on. Invoices already issued do not change. A tax invoice cannot be edited, and a correction is a separate credit note."
      data-guide="plan.billing-details"
    >
      <fieldset disabled={pending} className="space-y-4 py-4">
        <legend className="sr-only">Billing details</legend>

        <div className="space-y-1.5">
          <Label className="block" htmlFor="tax-kind">
            Where your business is registered
          </Label>
          {/* ── WHY THE LABELS ARE `block` HERE ────────────────────────────
              `Label` renders inline, `Input` is `w-full` (block) and `Select`
              wraps in an `inline-flex`. So a row STACKED after an Input and sat
              on ONE LINE after a Select, and this form has both — which is why
              "Where your business is registered" and "State" hugged their
              controls while "Legal name" and "Address" did not. The layout was
              deciding itself from whichever control happened to follow. */}
          <Select
            wrapperClassName="max-w-none"
            id="tax-kind"
            value={taxKind}
            onChange={(e) => setTaxKind(e.target.value as TaxKind)}
          >
            {(Object.keys(KIND_LABELS) as TaxKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="block" htmlFor="legal-name">
            Legal name
          </Label>
          <Input
            id="legal-name"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="The name the invoice should be made out to"
            autoComplete="organization"
          />
        </div>

        {taxKind === 'registered' ? (
          <div className="space-y-1.5">
            <Label className="block" htmlFor="gstin">
              GSTIN
            </Label>
            <Input
              id="gstin"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="15 characters"
              maxLength={15}
              className="num font-mono"
              aria-describedby="gstin-hint"
            />
            <p id="gstin-hint" className="type-sm text-muted">
              {/*
                Say what the number DOES, not that it is validated. The state is read from the
                GSTIN itself rather than asked for separately — two records of one fact can
                disagree, and the number the return is filed under is the one that wins.
              */}
              Sahoda reads your state from the GSTIN, so the invoice charges the right tax and you
              can claim it back.
            </p>
          </div>
        ) : null}

        {taxKind === 'unregistered' ? (
          <div className="space-y-1.5">
            <Label className="block" htmlFor="state-code">
              State
            </Label>
            <Select
              wrapperClassName="max-w-none"
              id="state-code"
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
            >
              <option value="">Choose a state</option>
              {SELECTABLE_GST_STATES.map((state) => (
                <option key={state.code} value={state.code}>
                  {state.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {taxKind === 'overseas' ? (
          <div className="space-y-1.5">
            <Label className="block" htmlFor="country-code">
              Country
            </Label>
            <Input
              id="country-code"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
              placeholder="Two-letter country code, e.g. US"
              maxLength={2}
              className="num font-mono"
              autoComplete="country"
            />
          </div>
        ) : null}

        {/* ── THE ONE FIELD THAT DOES NOT REACH AN INVOICE ────────────────
            `billing_profiles.address` has a column and no destination:
            `InvoiceDraft` and the `invoices` table carry no recipient address,
            so there is nothing to print it into. That is not pending wiring,
            it is a missing column, and the card hint above used to promise all
            six fields reach an invoice. "Optional" made it worse by reading as
            "optional ON your invoice". Its own sentence, saying what is true. */}
        <div className="space-y-1.5">
          <Label className="block" htmlFor="billing-address">
            Address
          </Label>
          <Input
            id="billing-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            autoComplete="street-address"
          />
          <p className="type-sm text-muted">
            Kept on your account. It is not printed on invoices yet.
          </p>
        </div>
      </fieldset>

      {/* THE ACTION SITS ON ITS OWN RULE, so the card ends somewhere instead of
          trailing off into whitespace. `min-h` on the status line is kept: it
          reserves the row so the button does not jump when saving starts. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-soft py-4">
        <Button type="button" onClick={save} loading={pending} variant="secondary">
          Save billing details
        </Button>
        <p aria-live="polite" className="min-h-[18px] type-meta text-muted">
          {pending ? 'Saving…' : ''}
        </p>
      </div>

      {outcome ? (
        <div
          role="status"
          className={`mb-4 type-body rounded-input px-3 py-2.5 ${
            outcome.ok ? 'bg-ok-bg text-ok' : 'bg-danger-bg text-danger'
          }`}
        >
          {outcome.message}
        </div>
      ) : null}
    </SettingCard>
  )
}
