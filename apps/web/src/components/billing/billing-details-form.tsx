'use client'

import { useState, useTransition } from 'react'
import { SELECTABLE_GST_STATES, type BillingProfile } from '@sahoda/shared'

import { saveBillingDetails } from '@/app/actions/billing'
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

  return (
    <section
      data-guide="plan.billing-details"
      className="surface-ring rounded-card bg-surface px-4 py-4"
    >
      <h2 className="type-h2">Billing details</h2>
      <p className="type-body mt-1 text-muted">
        These go on every invoice Sahoda issues from now on. Invoices already issued do not change.
        A tax invoice cannot be edited, and a correction is a separate credit note.
      </p>

      <fieldset disabled={pending} className="mt-4 space-y-4">
        <legend className="sr-only">Billing details</legend>

        <div className="space-y-1.5">
          <Label htmlFor="tax-kind">Where your business is registered</Label>
          <Select
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
          <Label htmlFor="legal-name">Legal name</Label>
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
            <Label htmlFor="gstin">GSTIN</Label>
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
            <Label htmlFor="state-code">State</Label>
            <Select
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
            <Label htmlFor="country-code">Country</Label>
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

        <div className="space-y-1.5">
          <Label htmlFor="billing-address">Address</Label>
          <Input
            id="billing-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Optional"
            autoComplete="street-address"
          />
        </div>
      </fieldset>

      <Button type="button" onClick={save} loading={pending} variant="secondary" className="mt-4">
        Save billing details
      </Button>

      <p aria-live="polite" className="type-sm mt-2 min-h-[18px] text-muted">
        {pending ? 'Saving…' : ''}
      </p>

      {outcome ? (
        <div
          role="status"
          className={`type-body rounded-input px-3 py-2.5 ${
            outcome.ok ? 'bg-ok-bg text-ok' : 'bg-danger-bg text-danger'
          }`}
        >
          {outcome.message}
        </div>
      ) : null}
    </section>
  )
}
