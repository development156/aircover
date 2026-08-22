import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { OTP_MAX_ATTEMPTS } from '@/lib/ops/otp'

/**
 * `OTP_MAX_ATTEMPTS` is not read by anything, and it must not be deleted.
 *
 * ── WHAT IT IS AND IS NOT ────────────────────────────────────────────────────
 * The attempt counter is enforced in the DATABASE. `ops_credit_request_verify`
 * counts attempts, refuses at three with `too_many_attempts`, and expires the
 * request on the third — inside a SECURITY DEFINER function, which is the only
 * place the limit could live, because the RPC is what a caller reaches.
 *
 * So this constant enforces nothing. It DOCUMENTS. Its own file says "the thing
 * that actually protects this is the attempt counter and the ten-minute window",
 * and a six-digit code is only a million possibilities, so that sentence is the
 * whole security argument for the second admin.
 *
 * ── WHY A DOCUMENTING CONSTANT IS WORSE THAN NO CONSTANT WITHOUT THIS TEST ───
 * Somebody edits it to 5, believes the OTP now allows five attempts, and nothing
 * whatsoever changes — the database still refuses at three. An unread number
 * that reads as a setting is exactly the shape this repo keeps producing: it
 * exists, it looks authoritative, and it does nothing.
 *
 * Deleting it would lose the sentence the security argument rests on. So it stays
 * and it is PINNED to the number the RPC actually uses, read out of the migration
 * rather than restated here.
 */
describe('the OTP attempt limit', () => {
  it('matches the number ops_credit_request_verify actually enforces', () => {
    const dir = resolve(import.meta.dirname, '../../../../../packages/db/supabase/migrations')
    // Migrations are applied in filename order and a later one may replace the
    // function, so the LAST definition wins — the same rule check-constraints.ts
    // follows for a CHECK that was dropped and re-added.
    let enforced: number | null = null
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith('.sql')) continue
      const sql = readFileSync(join(dir, file), 'utf8')
      if (!sql.includes('ops_credit_request_verify')) continue
      const m = /req\.attempts\s*>=\s*(\d+)/.exec(sql)
      if (m) enforced = Number(m[1])
    }

    // A parse that found nothing would make the comparison vacuously true, which
    // is the failure this whole file exists to refuse.
    expect(enforced, 'no `req.attempts >= N` found in any migration').not.toBeNull()
    expect(OTP_MAX_ATTEMPTS).toBe(enforced)
  })
})
