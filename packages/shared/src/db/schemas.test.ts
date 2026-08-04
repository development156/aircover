import { describe, it, expect } from 'vitest'
import { PostInsertSchema, LedgerEntrySchema } from './index'
import { PostStatusSchema, BillingProviderSchema } from '../enums'

const UUID = '00000000-0000-0000-0000-000000000000'

describe('db row schemas', () => {
  it('PostInsert applies status/origin/channels defaults', () => {
    const r = PostInsertSchema.parse({ workspace_id: UUID, created_by: 'user_1' })
    expect(r.status).toBe('draft')
    expect(r.origin).toBe('manual')
    expect(r.channels).toEqual([])
  })

  it('post status vocabulary rejects unknown values', () => {
    expect(PostStatusSchema.safeParse('published').success).toBe(true)
    expect(PostStatusSchema.safeParse('nonsense').success).toBe(false)
  })

  it('billing provider vocabulary includes cashfree + fixture, rejects unknowns', () => {
    for (const p of ['stripe', 'razorpay', 'cashfree', 'fixture']) {
      expect(BillingProviderSchema.safeParse(p).success).toBe(true)
    }
    expect(BillingProviderSchema.safeParse('paypal').success).toBe(false)
  })

  it('LedgerEntry accepts numeric cogs as string (PostgREST) or number', () => {
    const base = {
      id: UUID,
      workspace_id: UUID,
      seq: 1,
      entry_type: 'DEBIT',
      amount: 3,
      balance_after: 97,
      action_type: 'post_variants',
      object_ref: 'post:x',
      model_tier: 'economy',
      cogs_usd_est: '0.004200',
      idempotency_key: 'post_variants:x:1:debit',
      settles_entry_id: null,
      hold_expires_at: null,
      actor: null,
      meta: null,
      created_at: '2026-07-18T00:00:00Z',
    }
    expect(LedgerEntrySchema.safeParse(base).success).toBe(true)
    expect(LedgerEntrySchema.safeParse({ ...base, cogs_usd_est: 0.0042 }).success).toBe(true)
  })
})
