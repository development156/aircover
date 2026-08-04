import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasRlsEnv } from './helpers/env'
import { serviceClient } from './helpers/db'

// The provider CHECK on subscriptions / billing_webhook_events was widened to add
// 'cashfree' and 'fixture' (migration 20260718193834_widen_billing_provider). This
// proves the live constraint accepts the new rails and still rejects an unknown one.
// Service-role client (bypasses RLS); skipped unless the service key + env are set.
describe.skipIf(!hasRlsEnv)('billing provider vocabulary (live CHECK)', () => {
  let svcMemo: SupabaseClient | undefined
  const svc = () => (svcMemo ??= serviceClient())
  const run = Date.now()
  const owner = `user_prov_${run}`
  let ws = ''
  const webhookIds: string[] = []

  beforeAll(async () => {
    const w = await svc()
      .from('workspaces')
      .insert({ name: 'prov', slug: `prov-${run}`, created_by: owner })
      .select('id')
      .single()
    ws = w.data!.id
  })

  afterAll(async () => {
    if (webhookIds.length) await svc().from('billing_webhook_events').delete().in('id', webhookIds)
    if (ws) await svc().from('workspaces').delete().eq('id', ws) // cascades the subscription
  })

  it('subscriptions accepts provider = cashfree', async () => {
    const { data, error } = await svc()
      .from('subscriptions')
      .insert({ workspace_id: ws, plan_id: 'free', status: 'active', provider: 'cashfree' })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  })

  it('subscriptions rejects an unknown provider', async () => {
    // status 'canceled' is outside the one-live partial unique index, so the ONLY
    // constraint that can fail here is the provider CHECK.
    const { error } = await svc()
      .from('subscriptions')
      .insert({ workspace_id: ws, plan_id: 'free', status: 'canceled', provider: 'paypal' })
    expect(error).toBeTruthy()
  })

  it('billing_webhook_events accepts provider = fixture', async () => {
    const { data, error } = await svc()
      .from('billing_webhook_events')
      .insert({ provider: 'fixture', event_id: `evt_fixture_${run}`, event_type: 'test.event' })
      .select('id')
      .single()
    if (data?.id) webhookIds.push(data.id) // register for cleanup before any assert can throw
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  })

  it('billing_webhook_events rejects an unknown provider', async () => {
    const { error } = await svc()
      .from('billing_webhook_events')
      .insert({ provider: 'paypal', event_id: `evt_bad_${run}` })
    expect(error).toBeTruthy()
  })
})
