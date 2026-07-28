import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasRlsEnv } from './helpers/env'
import { serviceClient, userClient } from './helpers/db'

/**
 * `ops_qa_import` (doc 13 §11), read as an attacker rather than as the importer.
 *
 * The function takes a JSON array and inserts QA runs. Its previous body did
 * `coalesce(rec.actor, caller)` — so the payload chose the author. Any writer
 * could file `pass` rows for suites that never ran, attributed to a colleague.
 * The audit log recorded the true importer, but nobody reads the audit log to
 * decide whether the build is healthy; they read the QA console, which reads
 * ops_qa_runs. It is also the source for gate-health over time.
 *
 * Round-trip fidelity of `actor` and non-repudiation of the QA record are in
 * direct conflict. Non-repudiation wins: an imported run is attributed to
 * whoever imported it, and the claimed author is kept as a claim in `details`.
 * This constrains SL-020 and is deliberate.
 */
describe.skipIf(!hasRlsEnv)('ops_qa_import attributes honestly', () => {
  let svcMemo: SupabaseClient | undefined
  const svc = () => (svcMemo ??= serviceClient())

  const run = Date.now()
  const importerSub = `user_qa_importer_${run}`
  const victimSub = `user_qa_victim_${run}`
  const importerEmail = `importer-${run}@example.test`
  const victimEmail = `victim-${run}@example.test`

  const adminIds: string[] = []
  const runIds: string[] = []

  beforeAll(async () => {
    for (const [sub, email] of [
      [importerSub, importerEmail],
      [victimSub, victimEmail],
    ]) {
      const { data, error } = await svc()
        .from('ops_admins')
        .insert({ user_id: sub, email, name: email, role: 'admin', status: 'active' })
        .select('id')
        .single()
      if (error) throw new Error(`seat ${email}: ${error.message}`)
      adminIds.push((data as { id: string }).id)
    }
  })

  afterAll(async () => {
    if (runIds.length > 0) await svc().from('ops_qa_runs').delete().in('id', runIds)
    if (adminIds.length > 0) await svc().from('ops_admins').delete().in('id', adminIds)
  })

  it('files an imported run under the IMPORTER, not the name in the file', async () => {
    const id = randomUUID()
    runIds.push(id)

    const { error } = await userClient(importerSub).rpc('ops_qa_import', {
      p_runs: [
        {
          id,
          task_code: 'SL-041',
          kind: 'auto',
          suite: 'unit',
          status: 'pass',
          summary_plain: 'everything is fine, trust me',
          details: 'original notes',
          actor: victimEmail,
          duration_ms: 10,
        },
      ],
    })
    expect(error).toBeNull()

    const { data } = await svc()
      .from('ops_qa_runs')
      .select('actor,kind,status,details')
      .eq('id', id)
      .single()

    const row = data as { actor: string; kind: string; status: string; details: string }

    // The whole finding: this used to be victimEmail.
    expect(row.actor).toBe(importerEmail)

    // 'auto' means the hook produced it. A hand-imported row claiming that is a
    // lie about provenance, so import is always 'manual'.
    expect(row.kind).toBe('manual')

    // Nothing is lost — the claim survives as a claim, next to who really filed it.
    expect(row.details).toContain('original notes')
    expect(row.details).toContain(importerEmail)
    expect(row.details).toContain(victimEmail)
  })

  it('leaves details alone when the file agrees with who is importing', async () => {
    const id = randomUUID()
    runIds.push(id)

    await userClient(importerSub).rpc('ops_qa_import', {
      p_runs: [
        {
          id,
          task_code: 'SL-041',
          suite: 'unit',
          status: 'pass',
          details: 'clean notes',
          actor: importerEmail,
        },
      ],
    })

    const { data } = await svc().from('ops_qa_runs').select('details').eq('id', id).single()
    // No provenance footnote when there is nothing to disclose.
    expect((data as { details: string }).details).toBe('clean notes')
  })

  it('refuses a viewer outright', async () => {
    const viewerSub = `user_qa_viewer_${run}`
    const { data: seat } = await svc()
      .from('ops_admins')
      .insert({
        user_id: viewerSub,
        email: `qa-viewer-${run}@example.test`,
        name: 'viewer',
        role: 'viewer',
        status: 'active',
      })
      .select('id')
      .single()
    adminIds.push((seat as { id: string }).id)

    const { error } = await userClient(viewerSub).rpc('ops_qa_import', { p_runs: [] })
    expect(error).toBeTruthy()
  })
})
