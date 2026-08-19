import {
  GstSupplierConfigSchema,
  MAX_SERIAL_PREFIX,
  parseGstin,
  type GstSupplierConfig,
} from '@sahoda/shared'
import { assertServerOnly } from '../env'

/**
 * The supplier's own GST registration, from the environment.
 *
 * ── THIS LOADER HAS NO DEFAULTS, AND THAT IS THE POINT ───────────────────────
 * Every other config loader in this package can reasonably fall back. This one cannot.
 * A GSTIN, a legal name and a SAC code are statements about a real registered business
 * that appear on a document claiming to be a tax invoice — inventing any of them would be
 * producing a fabricated statutory record, which is the one thing this product may never
 * do. So there is no placeholder, no `?? '27AAAAA0000A1Z5'`, and no "example" value that
 * could survive into production because someone forgot to override it.
 *
 * ── ABSENT IS A STATE, NOT AN ERROR ──────────────────────────────────────────
 * `loadGstSupplierConfig` returns `null` when the registration is not configured, rather
 * than throwing. An unconfigured supplier is a deployment fact — the founder has not
 * finished registering, or is still confirming the treatment with a CA — and the app's
 * correct behaviour is to take the payment and say plainly that the invoice is not
 * available yet. Throwing would turn that into a 500 on the money screen.
 *
 * The three fields marked CONFIRM WITH A CA on `GstSupplierConfigSchema` are read from
 * here precisely so they can be changed without a deploy once that conversation happens.
 */

/** Env var names, in one place, so the failure report can name them. */
export const GST_ENV_KEYS = {
  legalName: 'SAHODA_GST_LEGAL_NAME',
  gstin: 'SAHODA_GST_GSTIN',
  stateCode: 'SAHODA_GST_STATE_CODE',
  address: 'SAHODA_GST_ADDRESS',
  sacCode: 'SAHODA_GST_SAC_CODE',
  ratePercent: 'SAHODA_GST_RATE_PERCENT',
  priceIncludesTax: 'SAHODA_GST_PRICE_INCLUDES_TAX',
  exportUnderLut: 'SAHODA_GST_EXPORT_UNDER_LUT',
  serialPrefix: 'SAHODA_GST_SERIAL_PREFIX',
  creditNotePrefix: 'SAHODA_GST_CREDIT_NOTE_PREFIX',
} as const

/** Why invoicing is unavailable. Names KEYS only — never a value, so nothing can leak. */
export interface GstConfigGap {
  configured: false
  /** Env vars that are missing or unusable. Safe to log; safe to show an admin. */
  missing: string[]
}

export type GstConfigResult = { configured: true; config: GstSupplierConfig } | GstConfigGap

/**
 * Parse a boolean env var STRICTLY.
 *
 * `Boolean('false')` is `true`, and `priceIncludesTax` getting that wrong changes every
 * figure on every invoice by 18% while looking entirely healthy. Only the four literal
 * spellings are accepted; anything else is a missing value, not a false one.
 */
function parseBool(raw: string | undefined): boolean | null {
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return null
}

export function loadGstSupplierConfig(source: NodeJS.ProcessEnv = process.env): GstConfigResult {
  assertServerOnly()

  const missing: string[] = []
  const read = (key: string): string => (source[key] ?? '').trim()

  const legalName = read(GST_ENV_KEYS.legalName)
  if (legalName.length === 0) missing.push(GST_ENV_KEYS.legalName)

  // Checked here rather than only at the schema so the gap report can be specific: a
  // GSTIN that fails its checksum is a DIFFERENT problem from one that was never set,
  // and only one of them is fixed by typing it again.
  const gstinRaw = read(GST_ENV_KEYS.gstin).toUpperCase()
  const gstin = parseGstin(gstinRaw)
  if (gstinRaw.length === 0) missing.push(GST_ENV_KEYS.gstin)
  else if (!gstin) missing.push(`${GST_ENV_KEYS.gstin} (set, but fails its GSTIN checksum)`)

  // The state code is DERIVED from the GSTIN when one parsed, and only read from its own
  // var otherwise. Two records of one fact that can disagree is how an invoice gets filed
  // against the wrong state, so the GSTIN — the number the return is filed under — wins.
  const stateCode = gstin?.stateCode ?? read(GST_ENV_KEYS.stateCode)
  if (stateCode.length === 0) missing.push(GST_ENV_KEYS.stateCode)

  const address = read(GST_ENV_KEYS.address)
  if (address.length === 0) missing.push(GST_ENV_KEYS.address)

  const sacCode = read(GST_ENV_KEYS.sacCode)
  if (sacCode.length < 4) missing.push(`${GST_ENV_KEYS.sacCode} (CONFIRM WITH A CA)`)

  const rateRaw = read(GST_ENV_KEYS.ratePercent)
  const ratePercent = Number(rateRaw)
  if (
    rateRaw.length === 0 ||
    !Number.isInteger(ratePercent) ||
    ratePercent < 0 ||
    ratePercent > 100
  ) {
    missing.push(`${GST_ENV_KEYS.ratePercent} (whole number 0-100, CONFIRM WITH A CA)`)
  }

  const priceIncludesTax = parseBool(source[GST_ENV_KEYS.priceIncludesTax])
  if (priceIncludesTax === null) {
    missing.push(`${GST_ENV_KEYS.priceIncludesTax} ('true' or 'false', CONFIRM WITH A CA)`)
  }

  const exportUnderLut = parseBool(source[GST_ENV_KEYS.exportUnderLut])
  if (exportUnderLut === null) {
    missing.push(`${GST_ENV_KEYS.exportUnderLut} ('true' or 'false', CONFIRM WITH A CA)`)
  }

  // Both prefixes are capped by MAX_SERIAL_PREFIX, which is DERIVED from the 16-character
  // statutory limit rather than written down. Checked here, at config load, because the
  // alternative is discovering it when a real payment fails to produce a document.
  const serialPrefix = read(GST_ENV_KEYS.serialPrefix)
  if (serialPrefix.length === 0 || serialPrefix.length > MAX_SERIAL_PREFIX) {
    missing.push(`${GST_ENV_KEYS.serialPrefix} (1-${MAX_SERIAL_PREFIX} characters)`)
  }

  const creditNotePrefix = read(GST_ENV_KEYS.creditNotePrefix)
  if (creditNotePrefix.length === 0 || creditNotePrefix.length > MAX_SERIAL_PREFIX) {
    missing.push(`${GST_ENV_KEYS.creditNotePrefix} (1-${MAX_SERIAL_PREFIX} characters)`)
  } else if (creditNotePrefix === serialPrefix) {
    // Two series sharing one prefix produce two documents with the same printed number.
    missing.push(`${GST_ENV_KEYS.creditNotePrefix} (must differ from ${GST_ENV_KEYS.serialPrefix})`)
  }

  if (missing.length > 0) return { configured: false, missing }

  // Parsed, not cast. Everything above narrows the failure REPORT; the schema is still the
  // thing that decides whether the object is valid.
  const parsed = GstSupplierConfigSchema.safeParse({
    legalName,
    gstin: gstin?.gstin,
    stateCode,
    address,
    sacCode,
    ratePercent,
    priceIncludesTax,
    exportUnderLut,
    serialPrefix,
    creditNotePrefix,
  })
  if (!parsed.success) {
    return { configured: false, missing: parsed.error.issues.map((i) => i.path.join('.')) }
  }

  return { configured: true, config: parsed.data }
}
