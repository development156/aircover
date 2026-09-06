import Link from 'next/link'
import { dunningPolicy } from '@sahoda/billing'

import { BillingDetailsForm } from '@/components/billing/billing-details-form'
import { CurrentPlan, PlanNoWorkspace, PlanUnreadable } from '@/components/billing/current-plan'
import { DunningBanner } from '@/components/billing/dunning-banner'
import { InvoiceTable, InvoicingUnavailable } from '@/components/billing/invoice-table'
import { PlanPicker } from '@/components/billing/plan-picker'
import { SettingCard, SettingRow } from '@/components/settings/setting-row'
import { buttonVariants } from '@/components/ui/button'
import { readBillingProfile, readInvoices, readSubscription } from '@/lib/billing/read'
import { StoragePanel } from '@/components/settings/storage-panel'
import { readStorageUsage } from '@/lib/storage/usage'
import { getActiveWorkspace } from '@/lib/workspaces'
import { readBalance, type BalanceRead } from '@/lib/wallet/read'

export const metadata = { title: 'Plan & credits' }

/**
 * Plan & credits — ONE tab, where the reference has two.
 *
 * ── AND ONE NAME, WHERE THIS TAB HAD THREE ───────────────────────────────────
 * The rail said "Plan & credits", this page's own <h1> said "Plan & billing",
 * and the browser tab said "Plan & billing". docs/37 §17: an action keeps its
 * name through the whole flow, and so does a place. "Plan & credits" wins
 * because it is the one the reader clicked to get here.
 *
 * ── AND THE <h1> IS GONE, NOT RENAMED ────────────────────────────────────────
 * `settings/layout.tsx` already renders `<PageTitle>Settings</PageTitle>`, so
 * this page rendered a SECOND <h1> under it — two page titles in one view,
 * against docs/37 §16's "exactly one type-h1 per view". Which section you are
 * in is already said twice: by the rail's `aria-current="page"` item and by the
 * browser tab. A third statement of it, set as the largest text on the screen,
 * is the "says the same thing in more than one place" failure §16 names.
 *
 * The reference separates "Billing" from "Credits". This product's plan, its credits and its
 * invoices are one story: a payment buys a month's credits and produces a tax invoice, and
 * splitting them puts half of each answer on a different screen.
 *
 * ── HOW THIS SCREEN IS ORDERED ───────────────────────────────────────────────
 * Descending certainty, which is also descending urgency:
 *
 *   1. What needs you now      — the dunning banner, and only when there IS something
 *   2. What is true now        — the plan you are on            (.is-real)
 *   3. What is already decided — a scheduled change             (.is-committed)
 *   4. What you are considering— a proration preview            (.is-proposed)
 *   5. What already happened   — invoices
 *   6. What you can set        — billing details, credits
 *
 * `/analytics` is the cautionary tale: five empty states in five visual languages, with the
 * largest, loudest element on the page carrying the least information. Nothing here renders
 * unless it has something to say.
 */
export default async function SettingsPlanPage() {
  const [subscription, invoices, profile, balance, storage] = await Promise.all([
    readSubscription(),
    readInvoices(),
    readBillingProfile(),
    readBalance(),
    // Alongside the other reads, never after them: `read-waterfall.test.ts` counts
    // sequential server reads per route and refuses a new one.
    getActiveWorkspace().then((workspace) => readStorageUsage(workspace?.id ?? null)),
  ])

  if (subscription.status === 'no-workspace') {
    return (
      <div className="space-y-grid">
        <PlanNoWorkspace />
      </div>
    )
  }

  if (subscription.status === 'unreadable') {
    return (
      <div className="space-y-grid">
        <PlanUnreadable />
      </div>
    )
  }

  // Read the clock ONCE, on the server, and pass the result down. The components stay pure
  // and the dunning stage cannot drift between two renders of the same page.
  const policy = dunningPolicy(subscription.data, new Date())

  return (
    <div className="space-y-grid">
      <DunningBanner policy={policy} planId={subscription.data.planId} />

      <CurrentPlan subscription={subscription.data} policy={policy} />

      <PlanPicker subscription={subscription.data} />

      {/* Storage sits with the plan, not with workspace identity: an allowance is
          an entitlement, the same category as credits and seats. Above Invoices
          because this page runs "what is true now" before "what already
          happened". */}
      <StoragePanel usage={storage} />

      {/* ONE GRAMMAR. This was a bare `type-h2` above a table that brings its
          own bordered container, beside a Billing details card with a second
          `type-h2`, beside a Credits card with a `type-h3` head — three
          treatments and two heading levels for three sibling sections. All
          three are `SettingCard` now, so the page reads as one screen. */}
      <SettingCard title="Invoices" data-guide="plan.invoices">
        {invoices.status === 'ok' ? (
          // `border-0` because the card already draws the edge; a table with its
          // own ring inside a ringed card is the border-on-border docs/37 §6
          // refuses.
          <InvoiceTable invoices={invoices.data} className="my-4 border-0" />
        ) : invoices.status === 'unavailable' ? (
          // The invoice store is not deployed here. Payments and credits work; the paperwork
          // does not exist yet. A different claim from a failed read, and a different remedy.
          <InvoicingUnavailable />
        ) : (
          // Unreadable is not "no invoices". Telling a customer they have never been
          // invoiced, because a query failed, is a claim about their records that we have no
          // basis for.
          <p role="alert" className="py-4 type-body text-muted">
            Sahoda could not read your invoices just now. Reload to try again. Nothing has changed
            and no document has been lost.
          </p>
        )}
      </SettingCard>

      {/*
        No form while the invoice store is undeployed. A form whose Save cannot succeed is
        a control that does not work, and offering one is worse than offering nothing — the
        failure reads as a broken app rather than a feature that is not switched on.
      */}
      {profile.status === 'unavailable' ? null : (
        <BillingDetailsForm profile={profile.status === 'ok' ? profile.data : null} />
      )}

      <SettingCard title="Credits">
        {/* ── THE BALANCE LEADS, BECAUSE THAT IS WHAT THIS CARD IS FOR ────────
            docs/37 §16 rule 2: one number this section exists to report, so it
            is set at `type-hero-num` and everything else is context for it.
            This page renders no other hero number, so the "at most one per
            view" consequence still holds.

            The absence mark is kept for the two states that are NOT a zero: a
            workspace that does not exist yet, and a read that failed. Printing
            0 for either would state a balance nobody measured. */}
        <SettingRow
          label="Available"
          hint={AVAILABLE_HINT[balance.status]}
          control={
            <span className="type-hero-num num text-ink">
              {balance.status === 'ok' ? (
                balance.balance.available
              ) : (
                <>
                  <span aria-hidden>—</span>
                  <span className="sr-only">Not available</span>
                </>
              )}
            </span>
          }
        />
        {balance.status === 'ok' && balance.balance.held > 0 ? (
          <SettingRow
            label="Held"
            hint="Reserved by actions in progress. Returned in full if they do not complete."
            control={<span className="type-h3 num text-ink">{balance.balance.held}</span>}
          />
        ) : null}
        <SettingRow
          label="Activity and top-ups"
          hint="Every entry, what it was for, and what it cost."
          control={
            <Link href="/wallet" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Open wallet
            </Link>
          }
        />
      </SettingCard>
    </div>
  )
}

/**
 * `readBalance` answers in THREE parts and this tab used to render two.
 *
 * `no-workspace` fell into the same arm as `unreadable`, so a brand-new account was told "We
 * could not read your balance just now" — a failure that had not happened, attached to a
 * remedy (reload) that cannot produce a wallet. Each arm carries its own remedy, and only
 * one of them is a reload.
 */
const AVAILABLE_HINT: Record<BalanceRead['status'], string> = {
  ok: 'What you can spend right now.',
  'no-workspace': 'Credits belong to a workspace and you don’t have one yet.',
  unreadable: 'We could not read your balance just now. This is not a zero.',
}
