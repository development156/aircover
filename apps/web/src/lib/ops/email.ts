import 'server-only'

import { env } from '@/lib/env'

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
    `${input.requestedBy} is asking to add ${input.amount} credits to ${input.workspace}.`,
    '',
    `Their reason: ${input.reason}`,
    '',
    `Your approval code is ${input.code}`,
    '',
    'It works for ten minutes and three attempts, and only for you.',
    'If this was not expected, do not enter it — deny the request in /admin/credits instead.',
  ].join('\n')

  return send(input.to, `Approve ${input.amount} credits for ${input.workspace}?`, text)
}
