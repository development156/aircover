import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasRlsEnv } from './helpers/env'
import { serviceClient, userClient, anonClient } from './helpers/db'

// Cross-tenant isolation must hold from an anon-key client (SQL-editor checks are
// banned as evidence). Skipped unless the anon/service keys + JWT secret are set.
describe.skipIf(!hasRlsEnv)('RLS tenant isolation', () => {
  // lazy: creating the client at collection time would throw before skipIf applies
  let svcMemo: SupabaseClient | undefined
  const svc = () => (svcMemo ??= serviceClient())
  const run = Date.now()
  const userA = `user_rls_a_${run}`
  const userB = `user_rls_b_${run}`
  // A valid token belonging to nobody: authenticated, but a member of no workspace.
  // Distinct from userB — it proves the policies key on MEMBERSHIP, not merely on
  // "some other tenant", which a wsB-scoped check alone cannot separate.
  const userC = `user_rls_none_${run}`
  let wsA = ''
  let wsB = ''
  let postA = ''
  // sites family + themes, tenant A unless suffixed B
  let siteA = ''
  let siteB = ''
  let pageA = ''
  let pageB = ''
  let sectionA = ''
  let leadA = ''
  let themeA = ''

  beforeAll(async () => {
    const a = await svc()
      .from('workspaces')
      .insert({ name: 'A', slug: `rls-a-${run}`, created_by: userA })
      .select('id')
      .single()
    const b = await svc()
      .from('workspaces')
      .insert({ name: 'B', slug: `rls-b-${run}`, created_by: userB })
      .select('id')
      .single()
    wsA = a.data!.id
    wsB = b.data!.id
    await svc()
      .from('workspace_members')
      .insert([
        { workspace_id: wsA, user_id: userA, role: 'owner' },
        { workspace_id: wsB, user_id: userB, role: 'owner' },
      ])
    const p = await svc()
      .from('posts')
      .insert({ workspace_id: wsA, created_by: userA, body: 'secret A' })
      .select('id')
      .single()
    postA = p.data!.id

    // sites.slug is GLOBALLY unique (the {slug}.sahoda.site subdomain), so it must be
    // run-scoped: a fixed literal stranded by an interrupted run would burn that
    // subdomain and break every later run.
    const sa = await svc()
      .from('sites')
      .insert({ workspace_id: wsA, name: 'Site A', slug: `rls-site-a-${run}`, created_by: userA })
      .select('id')
      .single()
    const sb = await svc()
      .from('sites')
      .insert({ workspace_id: wsB, name: 'Site B', slug: `rls-site-b-${run}`, created_by: userB })
      .select('id')
      .single()
    siteA = sa.data!.id
    siteB = sb.data!.id

    const pgA = await svc()
      .from('site_pages')
      .insert({ workspace_id: wsA, site_id: siteA, path: '/', title: 'Home A' })
      .select('id')
      .single()
    const pgB = await svc()
      .from('site_pages')
      .insert({ workspace_id: wsB, site_id: siteB, path: '/', title: 'Home B' })
      .select('id')
      .single()
    pageA = pgA.data!.id
    pageB = pgB.data!.id

    const secA = await svc()
      .from('site_sections')
      .insert({
        workspace_id: wsA,
        page_id: pageA,
        kind: 'hero',
        content: { headline: 'secret A' },
      })
      .select('id')
      .single()
    sectionA = secA.data!.id

    // leads are service-role inserts by contract (see the leads policies) — there is no
    // member INSERT policy, so the fixture MUST come from the service client.
    const ld = await svc()
      .from('leads')
      .insert({ workspace_id: wsA, site_id: siteA, email: 'lead-a@example.com', name: 'Lead A' })
      .select('id')
      .single()
    leadA = ld.data!.id

    const th = await svc()
      .from('workspace_themes')
      .insert({
        workspace_id: wsA,
        version: 1,
        tokens: { '--p': 'oklch(0.5 0.1 250)' },
        source: 'default',
        status: 'active',
      })
      .select('id')
      .single()
    themeA = th.data!.id
  })

  afterAll(async () => {
    if (wsA) await svc().from('workspaces').delete().eq('id', wsA)
    if (wsB) await svc().from('workspaces').delete().eq('id', wsB)
  })

  it('positive control: member A reads own-tenant posts', async () => {
    const { data } = await userClient(userA).from('posts').select('id').eq('id', postA)
    expect(data ?? []).toHaveLength(1)
  })

  it('member B cannot read tenant A rows', async () => {
    const { data } = await userClient(userB).from('posts').select('id').eq('id', postA)
    expect(data ?? []).toHaveLength(0)
  })

  it('member B cannot insert into tenant A', async () => {
    const { error } = await userClient(userB)
      .from('posts')
      .insert({ workspace_id: wsA, created_by: userB, body: 'x' })
    expect(error).toBeTruthy()
  })

  it('signed-out anon is denied on posts', async () => {
    const { data } = await anonClient().from('posts').select('id').eq('id', postA)
    expect(data ?? []).toHaveLength(0)
  })

  it('service-only token vault is unreadable by an authenticated member', async () => {
    const { data, error } = await userClient(userA).from('connection_secrets').select('*').limit(1)
    expect((data ?? []).length === 0 || Boolean(error)).toBe(true)
  })

  it('authenticated members cannot call the ledger function', async () => {
    const { error } = await userClient(userA).rpc('apply_ledger_entry', {
      p_workspace_id: wsA,
      p_entry_type: 'GRANT',
      p_amount: 1_000_000,
      p_idempotency_key: `hack-${run}`,
    })
    expect(error).toBeTruthy()
  })

  it('mixed-tenant parent attack: A cannot attach a variant to B’s post', async () => {
    const pb = await svc()
      .from('posts')
      .insert({ workspace_id: wsB, created_by: userB, body: 'B' })
      .select('id')
      .single()
    const { error } = await userClient(userA).from('post_variants').insert({
      workspace_id: wsA,
      post_id: pb.data!.id,
      channel: 'x',
      body: 'inject',
    })
    expect(error).toBeTruthy() // composite FK (post_id, workspace_id) has no (B-post, A) row
  })

  // ── sites family + themes ───────────────────────────────────────────────────
  //
  // Four classes per table: same-tenant positive control, cross-tenant, cross-user
  // (the no-membership token), signed-out.
  //
  // Two rules every negative case below follows, because both have a silent
  // failure mode that turns a denial test into a test of nothing:
  //
  //  1. A denied SELECT must come back as an EMPTY SUCCESS, never an error. RLS
  //     filters rows; it does not raise. An error here would mean something else
  //     broke (missing table, bad key) and the row count would be vacuously 0 —
  //     so error is asserted null, not merely ignored.
  //  2. A denied INSERT must be shaped so RLS is the ONLY thing that can reject
  //     it. sites.slug is globally unique, site_pages is unique (site_id, path),
  //     and workspace_themes has both unique (workspace_id, version) and a
  //     one-active partial index — collide with any of those and the insert fails
  //     for the wrong reason while the test still goes green. Every payload below
  //     is therefore given values that are free in the target tenant.
  const denied = { data: [] as unknown[], error: null }

  // Every "member B / stranger cannot ..." case below is only worth anything if that
  // token is genuinely authenticated. A token that failed to mint or verify degrades to
  // anon, sees zero rows, and turns the entire denial matrix green while testing nothing.
  // These two controls pin the tokens as live BEFORE the denials rely on them.
  describe('token liveness (guards against vacuous denials)', () => {
    it('member B is genuinely authenticated — reads its OWN tenant’s site', async () => {
      const { data, error } = await userClient(userB).from('sites').select('id').eq('id', siteB)
      expect({ data, error }).toEqual({ data: [{ id: siteB }], error: null })
    })

    it('member B’s INSERT path works in its OWN tenant', async () => {
      // Without this, "B cannot insert into A" could be green because the payload is
      // malformed rather than because tenancy blocked it. Same shape, same token, only
      // the workspace differs — so the cross-tenant rejections isolate tenancy alone.
      const { error } = await userClient(userB)
        .from('sites')
        .insert({ workspace_id: wsB, name: 'B own', slug: `rls-site-b-own-${run}` })
      expect(error).toBeNull()
    })

    it('the no-membership token is authenticated, not silently anon', async () => {
      // guide_tours is platform content: `select to authenticated using (active)`. So an
      // authenticated stranger sees the seeded tours while seeing no tenant row anywhere,
      // and anon sees nothing at all. The contrast is what proves userC ≠ anon.
      const stranger = await userClient(userC).from('guide_tours').select('id').eq('active', true)
      expect(stranger.error).toBeNull()
      expect((stranger.data ?? []).length).toBeGreaterThan(0)

      const anon = await anonClient().from('guide_tours').select('id').eq('active', true)
      expect(anon.data ?? []).toHaveLength(0)
    })
  })

  describe('sites', () => {
    it('positive control: member A reads own-tenant site', async () => {
      const { data, error } = await userClient(userA).from('sites').select('id').eq('id', siteA)
      expect({ data, error }).toEqual({ data: [{ id: siteA }], error: null })
    })

    it('member B cannot read tenant A sites', async () => {
      const { data, error } = await userClient(userB).from('sites').select('id').eq('id', siteA)
      expect({ data, error }).toEqual(denied)
    })

    it('a no-membership token reads no sites at all', async () => {
      const { data, error } = await userClient(userC).from('sites').select('id')
      expect({ data, error }).toEqual(denied)
    })

    it('member B cannot insert a site into tenant A', async () => {
      // slug is free globally, so only the t_insert WITH CHECK can reject this
      const { error } = await userClient(userB)
        .from('sites')
        .insert({ workspace_id: wsA, name: 'inject', slug: `rls-site-inject-${run}` })
      expect(error).toBeTruthy()
      const { count } = await svc()
        .from('sites')
        .select('id', { count: 'exact', head: true })
        .eq('slug', `rls-site-inject-${run}`)
      expect(count).toBe(0) // proves the row never landed, whatever the error was
    })

    it("member B cannot update tenant A's site", async () => {
      const { data, error } = await userClient(userB)
        .from('sites')
        .update({ name: 'pwned' })
        .eq('id', siteA)
        .select('id')
      // an update matching no visible row is a SUCCESSFUL no-op, so the row itself
      // has to be re-read to tell "denied" apart from "silently applied"
      expect({ data, error }).toEqual(denied)
      const after = await svc().from('sites').select('name').eq('id', siteA).single()
      expect(after.data!.name).toBe('Site A')
    })

    it("member B cannot delete tenant A's site", async () => {
      // Deliberately a THROWAWAY site, not siteA: site_pages/site_sections hang off
      // sites by a composite FK with ON DELETE CASCADE, so if this policy ever
      // regressed, deleting siteA would take pageA and sectionA with it and the
      // failures would surface as unrelated "positive control" breakages two describes
      // later. Confirmed by mutation — that is exactly what happened. Isolating the
      // target keeps a real regression pointing at the test that actually caught it.
      const doomed = await svc()
        .from('sites')
        .insert({ workspace_id: wsA, name: 'Doomed', slug: `rls-site-del-${run}` })
        .select('id')
        .single()
      const { error } = await userClient(userB).from('sites').delete().eq('id', doomed.data!.id)
      expect(error).toBeNull() // delete of an invisible row is a no-op, not a raise
      const after = await svc().from('sites').select('id').eq('id', doomed.data!.id)
      expect(after.data ?? []).toHaveLength(1)
    })

    it('signed-out anon is denied on sites', async () => {
      const { data, error } = await anonClient().from('sites').select('id').eq('id', siteA)
      expect({ data, error }).toEqual(denied)
    })
  })

  describe('site_pages', () => {
    it('positive control: member A reads own-tenant page', async () => {
      const { data, error } = await userClient(userA)
        .from('site_pages')
        .select('id')
        .eq('id', pageA)
      expect({ data, error }).toEqual({ data: [{ id: pageA }], error: null })
    })

    it('member B cannot read tenant A pages', async () => {
      const { data, error } = await userClient(userB)
        .from('site_pages')
        .select('id')
        .eq('id', pageA)
      expect({ data, error }).toEqual(denied)
    })

    it('a no-membership token reads no pages at all', async () => {
      const { data, error } = await userClient(userC).from('site_pages').select('id')
      expect({ data, error }).toEqual(denied)
    })

    it('positive control: member A CAN insert a page in own tenant', async () => {
      // Payload-validity control. Without it, the two rejections below could both be
      // green because the insert shape itself is wrong (bad column, missing NOT NULL)
      // rather than because tenancy stopped them.
      const { error } = await userClient(userA)
        .from('site_pages')
        .insert({ workspace_id: wsA, site_id: siteA, path: '/about' })
      expect(error).toBeNull()
    })

    it('member B cannot insert a page into tenant A', async () => {
      // '/pwned' is free on siteA, so unique (site_id, path) cannot be what rejects it
      const { error } = await userClient(userB)
        .from('site_pages')
        .insert({ workspace_id: wsA, site_id: siteA, path: '/pwned' })
      expect(error).toBeTruthy()
    })

    it("mixed-tenant parent attack: A cannot attach a page to B's site", async () => {
      const { error } = await userClient(userA)
        .from('site_pages')
        .insert({ workspace_id: wsA, site_id: siteB, path: '/steal' })
      expect(error).toBeTruthy() // composite FK (site_id, workspace_id) has no (B-site, A) row
    })

    it('signed-out anon is denied on site_pages', async () => {
      const { data, error } = await anonClient().from('site_pages').select('id').eq('id', pageA)
      expect({ data, error }).toEqual(denied)
    })
  })

  describe('site_sections', () => {
    it('positive control: member A reads own-tenant section', async () => {
      const { data, error } = await userClient(userA)
        .from('site_sections')
        .select('id')
        .eq('id', sectionA)
      expect({ data, error }).toEqual({ data: [{ id: sectionA }], error: null })
    })

    it('member B cannot read tenant A sections (section content is page copy)', async () => {
      const { data, error } = await userClient(userB)
        .from('site_sections')
        .select('id, content')
        .eq('id', sectionA)
      expect({ data, error }).toEqual(denied)
    })

    it('a no-membership token reads no sections at all', async () => {
      const { data, error } = await userClient(userC).from('site_sections').select('id')
      expect({ data, error }).toEqual(denied)
    })

    it('positive control: member A CAN insert a section in own tenant', async () => {
      // Same payload-validity guard as site_pages: `kind` is CHECK-constrained and
      // `content` is NOT NULL, so a malformed shape would reject on its own and make
      // both rejections below meaningless.
      const { error } = await userClient(userA)
        .from('site_sections')
        .insert({ workspace_id: wsA, page_id: pageA, kind: 'faq', content: { q: 'ok' } })
      expect(error).toBeNull()
    })

    it('member B cannot insert a section into tenant A', async () => {
      const { error } = await userClient(userB)
        .from('site_sections')
        .insert({ workspace_id: wsA, page_id: pageA, kind: 'hero', content: { headline: 'x' } })
      expect(error).toBeTruthy()
    })

    it("mixed-tenant parent attack: A cannot attach a section to B's page", async () => {
      const { error } = await userClient(userA)
        .from('site_sections')
        .insert({ workspace_id: wsA, page_id: pageB, kind: 'hero', content: { headline: 'x' } })
      expect(error).toBeTruthy() // composite FK (page_id, workspace_id) has no (B-page, A) row
    })

    it('signed-out anon is denied on site_sections', async () => {
      const { data, error } = await anonClient()
        .from('site_sections')
        .select('id')
        .eq('id', sectionA)
      expect({ data, error }).toEqual(denied)
    })
  })

  describe('leads', () => {
    it('positive control: member A reads own-tenant lead', async () => {
      const { data, error } = await userClient(userA).from('leads').select('id').eq('id', leadA)
      expect({ data, error }).toEqual({ data: [{ id: leadA }], error: null })
    })

    it('member B cannot read tenant A leads (PII: name/email/phone)', async () => {
      const { data, error } = await userClient(userB)
        .from('leads')
        .select('id, email, phone')
        .eq('id', leadA)
      expect({ data, error }).toEqual(denied)
    })

    it('a no-membership token reads no leads at all', async () => {
      const { data, error } = await userClient(userC).from('leads').select('id')
      expect({ data, error }).toEqual(denied)
    })

    it('member A can update own-tenant lead status (the one member write)', async () => {
      const { data, error } = await userClient(userA)
        .from('leads')
        .update({ status: 'contacted' })
        .eq('id', leadA)
        .select('status')
      expect({ data, error }).toEqual({ data: [{ status: 'contacted' }], error: null })
    })

    it("member B cannot update tenant A's lead", async () => {
      const { data, error } = await userClient(userB)
        .from('leads')
        .update({ status: 'won' })
        .eq('id', leadA)
        .select('id')
      expect({ data, error }).toEqual(denied)
      const after = await svc().from('leads').select('status').eq('id', leadA).single()
      expect(after.data!.status).toBe('contacted') // still what member A set
    })

    it('members cannot insert a lead even in their OWN tenant (server-only by contract)', async () => {
      // leads has select+update policies only: the public form route validates and
      // Turnstile-checks, then inserts with the service role. A member INSERT that
      // started succeeding would mean someone added a policy and opened lead forgery.
      const { error } = await userClient(userA)
        .from('leads')
        .insert({ workspace_id: wsA, email: 'forged@example.com' })
      expect(error).toBeTruthy()
      const { count } = await svc()
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('email', 'forged@example.com')
      expect(count).toBe(0)
    })

    it('members cannot delete a lead even in their OWN tenant (no delete policy)', async () => {
      const { error } = await userClient(userA).from('leads').delete().eq('id', leadA)
      expect(error).toBeNull() // no policy ⇒ no visible row to delete ⇒ silent no-op
      const after = await svc().from('leads').select('id').eq('id', leadA)
      expect(after.data ?? []).toHaveLength(1)
    })

    it('signed-out anon is denied on leads', async () => {
      const { data, error } = await anonClient().from('leads').select('id').eq('id', leadA)
      expect({ data, error }).toEqual(denied)
    })
  })

  describe('workspace_themes', () => {
    it('positive control: member A reads own-tenant theme', async () => {
      const { data, error } = await userClient(userA)
        .from('workspace_themes')
        .select('id')
        .eq('id', themeA)
      expect({ data, error }).toEqual({ data: [{ id: themeA }], error: null })
    })

    it('member B cannot read tenant A themes', async () => {
      const { data, error } = await userClient(userB)
        .from('workspace_themes')
        .select('id')
        .eq('id', themeA)
      expect({ data, error }).toEqual(denied)
    })

    it('a no-membership token reads no themes at all', async () => {
      const { data, error } = await userClient(userC).from('workspace_themes').select('id')
      expect({ data, error }).toEqual(denied)
    })

    it('member B cannot insert a theme into tenant A', async () => {
      // version 99 + 'proposed' dodges BOTH unique (workspace_id, version) and the
      // one-active partial index, so RLS is the only thing left to reject this
      const { error } = await userClient(userB)
        .from('workspace_themes')
        .insert({
          workspace_id: wsA,
          version: 99,
          tokens: { '--p': 'oklch(0 0 0)' },
          source: 'manual',
          status: 'proposed',
        })
      expect(error).toBeTruthy()
      const { count } = await svc()
        .from('workspace_themes')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsA)
        .eq('version', 99)
      expect(count).toBe(0)
    })

    it("member B cannot update tenant A's active theme", async () => {
      const { data, error } = await userClient(userB)
        .from('workspace_themes')
        .update({ status: 'reverted' })
        .eq('id', themeA)
        .select('id')
      expect({ data, error }).toEqual(denied)
      const after = await svc().from('workspace_themes').select('status').eq('id', themeA).single()
      expect(after.data!.status).toBe('active')
    })

    it('signed-out anon is denied on workspace_themes', async () => {
      const { data, error } = await anonClient()
        .from('workspace_themes')
        .select('id')
        .eq('id', themeA)
      expect({ data, error }).toEqual(denied)
    })
  })
})
