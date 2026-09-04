import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * NOTHING HANDS OUT A STANDING ACKNOWLEDGEMENT OF A GUARDED DATABASE.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * `SAHODA_E2E_ACK_TARGET` was designed so that a person has to TYPE the project
 * ref they are about to write to. `e2e-target.ts` rejects `=1` in as many words:
 * "satisfiable by anyone who read the error and wanted it to go away".
 *
 * `scripts/cloud-setup.sh` then defaulted it to the production ref and wrote it
 * into all three `.env` files, on every sandbox, every time. A default is
 * satisfiable by nobody typing anything at all, which is strictly worse than the
 * `=1` the design refused — and the line sat four lines below a comment
 * explaining that the guard exists because this suite "wrote to the production
 * database on every gate run for months and minted 12,196 Clerk users".
 *
 * The guard was defeated by the script that provisions the environment it
 * guards. No test covered the provisioning script at all, which is why it
 * survived: `e2e-target.test.ts` grades the DECISION and cannot see the ENV.
 *
 * ── WHAT THIS CANNOT SEE ─────────────────────────────────────────────────────
 * It reads one file as text. A default written by some other script, exported by
 * a shell profile, or set in a Vercel or GitHub environment is invisible here.
 * It only closes the door that was actually found open.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const SETUP = readFileSync(resolve(ROOT, 'scripts/cloud-setup.sh'), 'utf8')

/** Lines that are not comments. The prose ABOUT the variable is expected. */
function codeLines(source) {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
}

describe('the e2e acknowledgement is never provisioned for anybody', () => {
  it('cloud-setup.sh does not default it', () => {
    // `: "${SAHODA_E2E_ACK_TARGET:=<anything>}"` is the shape that came back.
    const defaulted = codeLines(SETUP).filter((line) => /SAHODA_E2E_ACK_TARGET\s*:?=/.test(line))
    expect(
      defaulted,
      'cloud-setup.sh assigns SAHODA_E2E_ACK_TARGET a value. An acknowledgement ' +
        'that arrives without anybody typing it is not an acknowledgement.\n' +
        defaulted.join('\n'),
    ).toEqual([])
  })

  it('cloud-setup.sh does not write it into any .env file', () => {
    const written = codeLines(SETUP).filter(
      (line) => line.includes('SAHODA_E2E_ACK_TARGET') && /printf|echo|>>/.test(line),
    )
    expect(
      written,
      'cloud-setup.sh writes SAHODA_E2E_ACK_TARGET into an env file. Every ' +
        'sandbox would then carry a pre-typed consent it never asked anyone for.\n' +
        written.join('\n'),
    ).toEqual([])
  })

  it('the production ref is not handed out under any variable name', () => {
    // SUPABASE_PROJECT_REF legitimately names production — that is which project
    // the app IS, not permission to write to it from a browser suite. So this
    // checks the ack specifically rather than banning the ref, which would be a
    // guard that has to be disabled to do ordinary work.
    const ackLines = codeLines(SETUP).filter((line) => line.includes('SAHODA_E2E_ACK_TARGET'))
    expect(ackLines).toEqual([])
  })
})
