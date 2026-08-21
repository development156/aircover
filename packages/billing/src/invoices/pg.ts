import type { Pool } from 'pg'
import { InvoiceSchema, type Invoice } from '@sahoda/shared'
import type { InvoiceDraft } from './buildInvoice'

/**
 * The invoice store: one write path, several reads.
 *
 * `issue` is a thin call onto `app.issue_invoice`. Everything that makes the document
 * correct — the gapless serial, the arithmetic CHECK, the append-only trigger, the
 * one-payment-one-document idempotency — lives in the database, deliberately. A serial
 * allocated in TypeScript is a serial two concurrent webhooks can both allocate.
 */
export interface InvoiceStore {
  issue(input: IssueInvoiceInput): Promise<{ invoice: Invoice; replayed: boolean }>
  /** Documents for a workspace, newest first. Read under the tenant's own RLS by the app. */
  listForWorkspace(workspaceId: string, limit: number): Promise<Invoice[]>
  /** One document, scoped to its workspace so an id from elsewhere cannot be fetched. */
  byId(workspaceId: string, invoiceId: string): Promise<Invoice | null>
  /** The tax invoice a payment produced, so a reversal can name what it compensates. */
  byProviderPayment(providerPaymentId: string): Promise<Invoice | null>
}

export interface IssueInvoiceInput extends InvoiceDraft {
  workspaceId: string
}

/** Columns, in the order `app.issue_invoice` declares its parameters. */
const ISSUE_SQL = `select app.issue_invoice(
  $1::uuid, $2, $3, $4, $5,
  $6, $7, $8,
  $9, $10, $11, $12,
  $13, $14, $15::int,
  $16::bigint, $17::bigint, $18::bigint, $19::bigint, $20::bigint,
  $21::boolean, $22::boolean,
  $23, $24, $25::uuid, $26, $27::int,
  $28, $29, $30, $31::uuid, $32::jsonb
) as res`

const SELECT_COLUMNS = `
  id, workspace_id, document_type, serial, financial_year, serial_seq,
  issued_at, period, plan_id, sac_code,
  supplier_legal_name, supplier_gstin, supplier_state_code,
  recipient_legal_name, recipient_gstin, recipient_state_code, recipient_country_code,
  place_of_supply, treatment, rate_percent, currency,
  gross_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise,
  zero_rated, under_lut,
  references_invoice_id, reason, shortfall_credits,
  provider, provider_order_id, provider_payment_id, ledger_entry_id, meta, created_at
`

export function createPgInvoiceStore(pool: Pool): InvoiceStore {
  /**
   * Parse every row through the schema rather than casting.
   *
   * `bigint` columns come back from `pg` as STRINGS, not numbers — the driver refuses to
   * silently lose precision, and it is right to. `NumericSchema` accepts both, and
   * `invoicePaise` in @sahoda/shared is the only sanctioned way to get an integer out. A
   * cast here would produce `"49900"` where the UI expects `49900` and render a money
   * figure that formats as a string.
   */
  const parse = (row: unknown): Invoice => InvoiceSchema.parse(row)

  return {
    async issue(input: IssueInvoiceInput): Promise<{ invoice: Invoice; replayed: boolean }> {
      const t = input.tax
      const r = await pool.query<{ res: { invoice: unknown; replayed: boolean } }>(ISSUE_SQL, [
        input.workspaceId,
        input.documentType,
        input.financialYear,
        input.serialPrefix,
        input.sacCode,
        input.supplierLegalName,
        input.supplierGstin,
        input.supplierStateCode,
        input.recipientLegalName,
        input.recipientGstin,
        input.recipientStateCode,
        input.recipientCountryCode,
        t.placeOfSupply,
        t.treatment,
        t.ratePercent,
        t.grossPaise,
        t.taxablePaise,
        t.cgstPaise,
        t.sgstPaise,
        t.igstPaise,
        t.zeroRated,
        t.underLut,
        input.period,
        input.planId,
        input.referencesInvoiceId,
        input.reason,
        input.shortfallCredits,
        input.provider,
        input.providerOrderId,
        input.providerPaymentId,
        input.ledgerEntryId,
        null,
      ])
      const res = r.rows[0]!.res
      return { invoice: parse(res.invoice), replayed: res.replayed }
    },

    async listForWorkspace(workspaceId: string, limit: number): Promise<Invoice[]> {
      const r = await pool.query(
        `select ${SELECT_COLUMNS} from invoices
         where workspace_id = $1 order by issued_at desc, serial_seq desc limit $2`,
        [workspaceId, limit],
      )
      return r.rows.map(parse)
    },

    async byId(workspaceId: string, invoiceId: string): Promise<Invoice | null> {
      // Scoped by workspace as well as by id: an id is guessable in a way a pair is not,
      // and this port runs with service credentials that RLS does not constrain.
      const r = await pool.query(
        `select ${SELECT_COLUMNS} from invoices where workspace_id = $1 and id = $2`,
        [workspaceId, invoiceId],
      )
      return r.rows[0] ? parse(r.rows[0]) : null
    },

    async byProviderPayment(providerPaymentId: string): Promise<Invoice | null> {
      const r = await pool.query(
        `select ${SELECT_COLUMNS} from invoices
         where provider_payment_id = $1 and document_type = 'tax_invoice'`,
        [providerPaymentId],
      )
      return r.rows[0] ? parse(r.rows[0]) : null
    },
  }
}
