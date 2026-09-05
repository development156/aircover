import { describe, expect, it } from 'vitest'

import { initialValuesFromGeneration } from './viewer-initial-values'
import type { StudioGeneration } from '@sahoda/shared'

const GENERATION: StudioGeneration = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  status: 'ready',
  mode: 'match',
  prompt_given: 'A plate of fresh samosas on a wooden counter',
  prompt_sent: 'A plate of fresh samosas on a wooden counter, on brand',
  provider: 'openrouter',
  model_id: 'model-a',
  image_tier: 'finish',
  seed: null,
  format_id: 'square',
  channel: null,
  width: 1024,
  height: 1024,
  requested_count: 4,
  reference_asset_ids: ['33333333-3333-4333-8333-333333333333'],
  brand_signals: null,
  cost_credits: 6,
  ledger_entry_id: null,
  provider_cost_micro_usd: null,
  error_code: null,
  error_detail: null,
  started_at: null,
  finished_at: '2026-09-04T00:01:00Z',
  created_by: null,
  created_at: '2026-09-04T00:00:00Z',
  updated_at: '2026-09-04T00:01:00Z',
}

describe('initialValuesFromGeneration', () => {
  it('carries the words that made it, the mode and the references, never the brand-conditioned sentence', () => {
    const values = initialValuesFromGeneration(GENERATION, { columnsApplied: false })
    expect(values.wanted).toBe(GENERATION.prompt_given)
    expect(values.wanted).not.toBe(GENERATION.prompt_sent)
    expect(values.mode).toBe('match')
    expect(values.referenceAssetIds).toEqual(GENERATION.reference_asset_ids)
  })

  it('carries the format and model when the row recorded them', () => {
    const values = initialValuesFromGeneration(GENERATION, { columnsApplied: false })
    expect(values.formatId).toBe('square')
    expect(values.modelId).toBe('model-a')
  })

  it('never seeds a count: remixing one picture defaults to one try, not the original batch size', () => {
    const values = initialValuesFromGeneration(GENERATION, { columnsApplied: false })
    expect(values.count).toBeUndefined()
  })

  it('omits format/model when the row never recorded them, so the bar falls back to its own default', () => {
    const values = initialValuesFromGeneration(
      { ...GENERATION, format_id: null, model_id: null },
      { columnsApplied: false },
    )
    expect(values.formatId).toBeUndefined()
    expect(values.modelId).toBeUndefined()
  })

  it('carries stamp settings only when the lineage actually recorded them', () => {
    const withStamp = initialValuesFromGeneration(GENERATION, {
      columnsApplied: true,
      remixedFrom: null,
      stamp: { enabled: true, anchor: 'top-right', sizeStep: 'large' },
    })
    expect(withStamp.stamp).toEqual({ enabled: true, anchor: 'top-right', sizeStep: 'large' })

    const withoutStamp = initialValuesFromGeneration(GENERATION, {
      columnsApplied: true,
      remixedFrom: null,
      stamp: null,
    })
    expect(withoutStamp.stamp).toBeUndefined()

    const columnsUnapplied = initialValuesFromGeneration(GENERATION, { columnsApplied: false })
    expect(columnsUnapplied.stamp).toBeUndefined()
  })
})
