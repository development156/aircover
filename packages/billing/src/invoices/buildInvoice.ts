import {
  type BillingProvider,
  type GstSupplierConfig,
  type PlanId,
  type TaxBreakdown,
  type TaxIdentity,
  parseGstin,
} from '@sahoda/shared'
import { computeTax } from '../tax/computeTax'
import { financialYear } from './financialYear'

/**
 * Assembling a tax document: a pure function of (supplier config, customer, amount, clock).
 *
 * ── WHY THE SUPPLIER IS SNAPSHOTTED ONTO EVERY DOCUMENT ──────────────────────
 * `supplierLegalName`, `supplierGstin` and `supplierStateCode` are copied onto the row
 * rather than joined from configuration. A tax invoice states who issued it AT THE TIME it
 * was issued. Rendering a two-year-old invoice from today's config would silently restate
 * history the moment the registration, the trading name or the registered state changes —
 * and the restated version is the one the customer would download for an assessment.
 *
 * The same reasoning applies to the recipient: a customer who later adds a GSTIN must not
 * retroactively turn last year's B2C invoices into B2B ones.
 *
 * ── WHAT THIS DOES NOT DO ────────────────────────────────────────────────────
 * It does not allocate the serial. That happens inside `app.issue_invoice`, under a row
 * lock, in the same transaction as the insert, because "consecutive" is a property of the
 * database's ordering and not something a caller can promise.
 */

export type InvoiceDocumentType = 'tax_invoice' | 'credit_note'
export type CreditNoteReason = 'refund' | 'chargeback'

/** Everything `app.issue_invoice` needs, with the serial deliberately absent. */
export interface InvoiceDraft {
  documentType: InvoiceDocumentType
  financialYear: string
  serialPrefix: string
  sacCode: string

  supplierLegalName: string
  supplierGstin: string
  supplierStateCode: string

  recipientLegalName: string
  recipientGstin: string | null
  recipientStateCode: string | null
  recipientCountryCode: string | null

  tax: TaxBreakdown

  period: string | null
  planId: PlanId | null

  referencesInvoiceId: string | null
  reason: CreditNoteReason | null
  shortfallCredits: number

  provider: BillingProvider | null
  providerOrderId: string | null
  providerPaymentId: string | null
  ledgerEntryId: string | null
}

export interface BuildTaxInvoiceInput {
  supplier: GstSupplierConfig
  identity: TaxIdentity
  /** The catalogue price in paise. Inclusive or exclusive per `supplier.priceIncludesTax`. */
  amountPaise: number
  now: Date
  period?: string
  planId?: PlanId
  provider?: BillingProvider
  providerOrderId?: string
  /** The provider's payment id. Also the idempotency key: one payment, one document. */
  providerPaymentId?: string
  /** The GRANT this payment produced. Links the statutory record to the credit ledger. */
  ledgerEntryId?: string
}

export function buildTaxInvoice(input: BuildTaxInvoiceInput): InvoiceDraft {
  const { supplier, identity } = input
  return {
    documentType: 'tax_invoice',
    financialYear: financialYear(input.now),
    serialPrefix: supplier.serialPrefix,
    sacCode: supplier.sacCode,
    ...supplierSnapshot(supplier),
    ...recipientSnapshot(identity),
    tax: computeTax({ supplier, identity, amountPaise: input.amountPaise }),
    period: input.period ?? null,
    planId: input.planId ?? null,
    referencesInvoiceId: null,
    reason: null,
    shortfallCredits: 0,
    provider: input.provider ?? null,
    providerOrderId: input.providerOrderId ?? null,
    providerPaymentId: input.providerPaymentId ?? null,
    ledgerEntryId: input.ledgerEntryId ?? null,
  }
}

export interface BuildCreditNoteInput extends BuildTaxInvoiceInput {
  /** The invoice this compensates. A credit note that names nothing is not a credit note. */
  referencesInvoiceId: string
  reason: CreditNoteReason
  /**
   * Credits that could NOT be taken back because they had already been spent.
   *
   * This is the receivable, and it belongs on the document rather than in the ledger: the
   * balance may not go below zero, and what is outstanding after a chargeback is money,
   * not credits. See `applyReversal`.
   */
  shortfallCredits?: number
}

/**
 * A credit note — the compensating DOCUMENT, exactly as the ledger's compensating ENTRY.
 *
 * Neither the invoice nor the ledger entry it corrects is touched. Under GST an invoice
 * cannot be amended at all, which is the same discipline `credit_ledger` enforces with a
 * trigger, arrived at independently. The two records stay consistent because neither of
 * them can be edited.
 */
export function buildCreditNote(input: BuildCreditNoteInput): InvoiceDraft {
  return {
    ...buildTaxInvoice(input),
    documentType: 'credit_note',
    serialPrefix: input.supplier.creditNotePrefix,
    referencesInvoiceId: input.referencesInvoiceId,
    reason: input.reason,
    shortfallCredits: input.shortfallCredits ?? 0,
  }
}

function supplierSnapshot(
  supplier: GstSupplierConfig,
): Pick<InvoiceDraft, 'supplierLegalName' | 'supplierGstin' | 'supplierStateCode'> {
  return {
    supplierLegalName: supplier.legalName,
    supplierGstin: supplier.gstin,
    supplierStateCode: supplier.stateCode,
  }
}

function recipientSnapshot(
  identity: TaxIdentity,
): Pick<
  InvoiceDraft,
  'recipientLegalName' | 'recipientGstin' | 'recipientStateCode' | 'recipientCountryCode'
> {
  if (identity.kind === 'registered') {
    const parsed = parseGstin(identity.gstin)
    if (!parsed) throw new Error('registered identity carries an invalid GSTIN')
    return {
      recipientLegalName: identity.legalName,
      recipientGstin: parsed.gstin,
      // From the GSTIN, never a second stored field. The number the return is filed under
      // is the one the document has to agree with.
      recipientStateCode: parsed.stateCode,
      recipientCountryCode: 'IN',
    }
  }
  if (identity.kind === 'unregistered') {
    return {
      recipientLegalName: identity.legalName,
      recipientGstin: null,
      recipientStateCode: identity.stateCode,
      recipientCountryCode: 'IN',
    }
  }
  return {
    recipientLegalName: identity.legalName,
    recipientGstin: null,
    recipientStateCode: null,
    recipientCountryCode: identity.countryCode.toUpperCase(),
  }
}
