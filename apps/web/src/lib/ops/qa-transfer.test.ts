import { describe, expect, it } from 'vitest'
import type { OpsQaArtifact, OpsQaRun } from '@sahoda/shared'

import {
  EXPORT_RUN_LIMIT,
  buildQaExport,
  exportFilename,
  parseQaImport,
  summariseImport,
} from './qa-transfer'

const NOW = new Date('2026-07-28T09:15:00Z')

const run = (over: Partial<OpsQaRun> & { id: string }): OpsQaRun =>
  ({
    task_code: 'SL-019',
    kind: 'manual',
    suite: 'manual',
    status: 'pass',
    summary_plain: 'checked it',
    details: 'notes',
    actor: 'divas@example.test',
    duration_ms: 1200,
    started_at: '2026-07-28T09:00:00Z',
    finished_at: '2026-07-28T09:01:00Z',
    created_at: '2026-07-28T09:00:00Z',
    updated_at: '2026-07-28T09:01:00Z',
    ...over,
  }) as OpsQaRun

const artifact = (over: Partial<OpsQaArtifact> & { id: string; run_id: string }): OpsQaArtifact =>
  ({
    storage_path: 'qa/r/a.png',
    caption: null,
    bytes: 100,
    mime: 'image/png',
    created_at: '2026-07-28T09:00:00Z',
    ...over,
  }) as OpsQaArtifact

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

describe('building an export', () => {
  it('writes the schema tag and the moment it was taken', () => {
    const file = buildQaExport([run({ id: ID_A })], [], NOW)

    expect(file.schema).toBe('sahoda_qa_v1')
    expect(file.exported_at).toBe('2026-07-28T09:15:00.000Z')
  })

  it('states its window IN the file, and admits when it is truncated', () => {
    // An export that silently carries "the most recent 500" reads later as
    // "everything", and the difference matters when restoring from it.
    const many = Array.from({ length: EXPORT_RUN_LIMIT + 10 }, (_, i) =>
      run({ id: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111` }),
    )
    const file = buildQaExport(many, [], NOW)

    expect(file.runs).toHaveLength(EXPORT_RUN_LIMIT)
    expect(file.window.truncated).toBe(true)
    expect(file.window.description).toContain(String(EXPORT_RUN_LIMIT))
  })

  it('does not claim truncation when everything fitted', () => {
    expect(buildQaExport([run({ id: ID_A })], [], NOW).window.truncated).toBe(false)
  })

  it('drops artifacts whose run is not in the file', () => {
    // Otherwise the file describes screenshots for runs the reader cannot see.
    const file = buildQaExport(
      [run({ id: ID_A })],
      [artifact({ id: ID_A, run_id: ID_A }), artifact({ id: ID_B, run_id: ID_B })],
      NOW,
    )

    expect(file.artifacts).toHaveLength(1)
    expect(file.artifacts[0]!.run_id).toBe(ID_A)
  })

  it('carries no database bookkeeping across', () => {
    // created_at/updated_at are this database's record of when IT wrote the
    // row. Carrying them would let an import claim a row existed before it did.
    const file = buildQaExport([run({ id: ID_A })], [], NOW)

    expect(file.runs[0]).not.toHaveProperty('created_at')
    expect(file.runs[0]).not.toHaveProperty('updated_at')
  })

  it('names the file by the day it was taken', () => {
    expect(exportFilename(NOW)).toBe('sahoda-qa-2026-07-28.json')
  })

  it('round-trips its own output', () => {
    // The contract that makes export and import one feature rather than two.
    const file = buildQaExport([run({ id: ID_A })], [artifact({ id: ID_A, run_id: ID_A })], NOW)

    const parsed = parseQaImport(JSON.stringify(file))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.payload).toEqual(file)
  })
})

describe('reading a file somebody else produced', () => {
  const good = () => JSON.stringify(buildQaExport([run({ id: ID_A })], [], NOW))

  it('accepts a genuine export', () => {
    expect(parseQaImport(good()).ok).toBe(true)
  })

  it.each([
    ['', 'That file is empty.'],
    ['   ', 'That file is empty.'],
    ['not json at all', 'That is not a JSON file.'],
    ['[]', 'That JSON is not a Sahoda QA export.'],
    ['"a string"', 'That JSON is not a Sahoda QA export.'],
    ['null', 'That JSON is not a Sahoda QA export.'],
  ])('refuses %j', (input, message) => {
    expect(parseQaImport(input)).toEqual({ ok: false, message })
  })

  it('names the schema a wrong-version file claims', () => {
    const result = parseQaImport(JSON.stringify({ schema: 'sahoda_qa_v2', runs: [] }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('sahoda_qa_v2')
      expect(result.message).toContain('sahoda_qa_v1')
    }
  })

  it('REJECTS an unknown key rather than stripping it', () => {
    // The .strict() property, as an assertion. A file from a future version
    // carrying a field this one silently drops would import as though nothing
    // were missing — and the QA record is the wrong place to be quietly lossy.
    const file = JSON.parse(good())
    file.signed_off_by = 'someone'

    expect(parseQaImport(JSON.stringify(file))).toMatchObject({ ok: false })
  })

  it('rejects an unknown key on a nested run too', () => {
    const file = JSON.parse(good())
    file.runs[0].verdict_override = 'pass'

    expect(parseQaImport(JSON.stringify(file))).toMatchObject({ ok: false })
  })

  it('rejects a run whose status is not one we recognise', () => {
    const file = JSON.parse(good())
    file.runs[0].status = 'probably fine'

    const result = parseQaImport(JSON.stringify(file))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('runs.0.status')
  })

  it('says plainly that nothing was imported when validation fails', () => {
    // Without this the reader assumes a partial load and goes looking for the
    // half that arrived.
    const file = JSON.parse(good())
    file.runs[0].id = 'not-a-uuid'

    const result = parseQaImport(JSON.stringify(file))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('Nothing was imported')
  })

  it('never echoes file contents back into the panel', () => {
    // A rejected import is still untrusted input, and its strings render
    // straight into the result panel.
    const file = JSON.parse(good())
    file.runs[0].summary_plain = '<img src=x onerror=alert(1)>'
    file.runs[0].status = 'nonsense'

    const result = parseQaImport(JSON.stringify(file))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).not.toContain('onerror')
  })
})

describe('what the result panel says', () => {
  const payload = buildQaExport([run({ id: ID_A }), run({ id: ID_B })], [], NOW)

  it('reports how many of how many landed', () => {
    const summary = summariseImport(payload, {
      imported: 1,
      conflicts: [{ id: ID_B, reason: 'already recorded' }],
    })

    expect(summary.headline).toContain('Imported 1 of 2')
    expect(summary.headline).toContain('1 already recorded')
    expect(summary.conflicts).toHaveLength(1)
  })

  it('does not call a no-op an import', () => {
    const summary = summariseImport(payload, {
      imported: 0,
      conflicts: [
        { id: ID_A, reason: 'already recorded' },
        { id: ID_B, reason: 'already recorded' },
      ],
    })

    expect(summary.headline).toContain('Nothing new')
  })

  it('says screenshots did not come with the file', () => {
    // This surprises everyone, so it is stated rather than discovered.
    const withArt = buildQaExport([run({ id: ID_A })], [artifact({ id: ID_A, run_id: ID_A })], NOW)
    const summary = summariseImport(withArt, { imported: 1, conflicts: [] })

    expect(summary.artifactNote).toContain('not restored')
  })

  it('stays quiet about artifacts when there were none', () => {
    expect(summariseImport(payload, { imported: 2, conflicts: [] }).artifactNote).toBeNull()
  })
})
