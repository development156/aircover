import { invoicePaise, type Invoice } from '@sahoda/shared'

import { DataTable } from '@/components/ui/data-table'
import {
  documentLabel,
  onDate,
  placeOfSupplyLabel,
  rupees,
  taxHeads,
} from '@/lib/billing/plan-copy'

/**
 * Invoices and credit notes.
 *
 * ── A TABLE, BECAUSE THE READER COMPARES DOWN A COLUMN ───────────────────────
 * docs/26 §10.2: if values are compared ACROSS records it is a `DataTable`; if they are read
 * one at a time it is a list. Somebody looking at their invoices is scanning amounts and
 * dates down a column — that is the whole activity. Rendering these as cards would repeat
 * the `/posts` mistake of eight equal-weight stacked boxes with nothing to scan.
 *
 * ── AND WHY A CREDIT NOTE IS NOT STYLED AS A FAILURE ─────────────────────────
 * A credit note is a real, correctly-issued statutory document — the compensating half of a
 * refund or a chargeback. It gets a plain label saying which it is, not a warning treatment.
 * The customer is not in trouble; the paperwork is simply complete.
 */
export function InvoiceTable({ invoices }: { invoices: readonly Invoice[] }) {
  const rows = invoices.map((invoice) => {
    const gross = invoicePaise(invoice.gross_paise)
    const isNote = invoice.document_type === 'credit_note'

    return {
      issued: <span className="num">{onDate(invoice.issued_at)}</span>,
      document: (
        <span className="flex flex-col">
          <span>{documentLabel(invoice)}</span>
          <span className="type-sm text-muted">
            {taxHeads(invoice)} · {placeOfSupplyLabel(invoice.place_of_supply)}
          </span>
        </span>
      ),
      serial: <span className="num font-mono text-[12px]">{invoice.serial}</span>,
      amount: (
        <span className="num">
          {/*
            A credit note reverses a supply, so its amount reads as money going back. The
            minus is a WORD-level fact about the document, not a colour: there is no red here
            and a credit note is not an error.
          */}
          {isNote ? `−${rupees(gross)}` : rupees(gross)}
        </span>
      ),
    }
  })

  return (
    <DataTable
      caption="Tax invoices and credit notes for this workspace"
      columns={[
        { key: 'issued', header: 'Issued' },
        { key: 'document', header: 'Document' },
        { key: 'serial', header: 'Number' },
        { key: 'amount', header: 'Amount', numeric: true },
      ]}
      rows={rows}
      empty="No invoice yet. One is issued the first time a payment completes."
    />
  )
}

/**
 * Invoicing is not configured.
 *
 * A deployment state, not a failure, and the difference matters to the customer: their
 * payment worked and their credits arrived — the DOCUMENT is what is missing. Saying
 * "something went wrong" here would send someone to support over a registration the founder
 * has simply not finished.
 */
export function InvoicingUnavailable() {
  return (
    <p className="type-body text-muted">
      Sahoda is not issuing tax invoices yet. Payments and credits work normally; the paperwork
      follows once the GST registration is in place, and every completed payment from today is
      invoiced when it is.
    </p>
  )
}
