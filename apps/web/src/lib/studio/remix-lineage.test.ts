import { describe, expect, it } from 'vitest'

import { remixLineageFromRow } from './remix-lineage'

describe('remixLineageFromRow', () => {
  it('columns not applied means no lineage at all, whatever the row looks like', () => {
    expect(remixLineageFromRow({ remixed_from: 'x' }, false)).toEqual({ columnsApplied: false })
  })

  it('a row that will not parse degrades the same as not applied', () => {
    expect(remixLineageFromRow({ remixed_from: 'not-a-uuid' }, true)).toEqual({
      columnsApplied: false,
    })
  })

  it('applied, and nothing recorded: not a remix, no stamp settings', () => {
    expect(
      remixLineageFromRow(
        { remixed_from: null, stamp_enabled: null, stamp_anchor: null, stamp_size_step: null },
        true,
      ),
    ).toEqual({ columnsApplied: true, remixedFrom: null, stamp: null })
  })

  it('applied, and a full stamp record: carried through exactly', () => {
    const parent = '11111111-1111-4111-8111-111111111111'
    expect(
      remixLineageFromRow(
        {
          remixed_from: parent,
          stamp_enabled: true,
          stamp_anchor: 'bottom-left',
          stamp_size_step: 'small',
        },
        true,
      ),
    ).toEqual({
      columnsApplied: true,
      remixedFrom: parent,
      stamp: { enabled: true, anchor: 'bottom-left', sizeStep: 'small' },
    })
  })

  it('a partial stamp record (one of three fields missing) is read as not recorded, never guessed complete', () => {
    expect(
      remixLineageFromRow(
        { remixed_from: null, stamp_enabled: true, stamp_anchor: null, stamp_size_step: 'medium' },
        true,
      ),
    ).toEqual({ columnsApplied: true, remixedFrom: null, stamp: null })
  })
})
