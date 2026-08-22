import 'server-only'

import { env } from '@/lib/env'
import { credits } from '@/lib/credit-words'

/**
 * Resend, over its REST API (doc 13 §6).
 *
 * No `resend` package: this is one POST, and the lockfile is not somewhere to
 * add weight casually in this repo.
 *
 * THE CALLER MUST TREAT A FAILURE AS FATAL. `sendApprovalCode` is the only way
 * the second admin ever learns the code, so a credit request created after a
 * failed send is a request nobody can approve — and, worse, one that looks
 * pending in the console as if it were waiting on a person rather than on a
 * missing API key.
 */

const ENDPOINT = 'https://api.resend.com/emails'
const FROM = 'Sahoda Labs <ops@sahodalabs.com>'

export type SendOutcome = { ok: true } | { ok: false; reason: 'not_configured' | 'failed' }

async function send(to: string, subject: string, text: string): Promise<SendOutcome> {
  const key = env.RESEND_API_KEY
  if (!key) return { ok: false, reason: 'not_configured' }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
      cache: 'no-store',
    })
    // The body is deliberately not read on failure: it echoes the payload, and
    // for this one message the payload contains the code.
    return response.ok ? { ok: true } : { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/**
 * The approval code, to the chosen approver and nobody else.
 *
 * Plain and warm per doc 13 §4's copy rule, and it says what the code does and
 * how long it lasts, because an unexplained six-digit number in an inbox reads
 * like phishing.
 */
export async function sendApprovalCode(input: {
  to: string
  code: string
  amount: number
  workspace: string
  requestedBy: string
  reason: string
}): Promise<SendOutcome> {
  const text = [
    `${input.requestedBy} is asking to add ${credits(input.amount)} to ${input.workspace}.`,
    '',
    `Their reason: ${input.reason}`,
    '',
    `Your approval code is ${input.code}`,
    '',
    'It works for ten minutes and three attempts, and only for you.',
    'If this was not expected, do not enter it — deny the request in /admin/credits instead.',
  ].join('\n')

  return send(input.to, `Approve ${credits(input.amount)} for ${input.workspace}?`, text)
}

/**
 * An operational alert, to whoever is seeded as an admin.
 *
 * ── WHO IT GOES TO, AND WHY IT IS NOT A CONFIGURABLE LIST ───────────────────
 * `ADMIN_BOOTSTRAP_EMAILS` — the same env var that seeds `ops_admins`. Reusing
 * it means there is exactly one answer to "who runs this system", so an alert
 * can never be routed somewhere nobody reads while the console shows a
 * different set of people. A second list would be a second thing to keep in
 * sync, and the failure mode of getting it wrong is silence.
 *
 * ── UNCONFIGURED IS REPORTED, NEVER TREATED AS SENT ─────────────────────────
 * No key or no recipients returns `not_configured`. The caller must not count
 * that as delivered: an alerting path that reports success while sending
 * nothing is worse than having no alerting at all, because it is believed.
 *
 * Addresses are sent as separate messages rather than one multi-recipient
 * message, so one bad address cannot suppress everyone else's copy.
 */
export async function sendOpsEmail(input: { subject: string; text: string }): Promise<SendOutcome> {
  const recipients = (env.ADMIN_BOOTSTRAP_EMAILS ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter((address) => address !== '')

  if (recipients.length === 0) return { ok: false, reason: 'not_configured' }

  const outcomes = await Promise.all(
    recipients.map((address) => send(address, input.subject, input.text)),
  )
  // One delivery is enough to call it reported. Requiring all of them would let
  // a single stale address turn every alert into a failure.
  const delivered = outcomes.find((outcome) => outcome.ok)
  if (delivered) return delivered
  return outcomes[0] ?? { ok: false, reason: 'not_configured' }
}
