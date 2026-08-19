/**
 * The live proofs for the media library, run against the real project.
 *
 * ── WHY THIS IS A SCRIPT AND NOT A VITEST SUITE ──────────────────────────────
 * `tests/helpers/forbidden-target.js` aborts any suite whose target names this
 * project's ref, and that guard exists because on 2026-07-27 a live run hit
 * production while the operator believed it was blanked. It is not weakened here
 * and no suite is pointed at production. This is a separate, explicitly-invoked
 * script that creates its OWN throwaway workspaces, proves the boundary against
 * them, and removes exactly what it created.
 *
 * ── WHAT IT PROVES, AND HOW ──────────────────────────────────────────────────
 * Every read and write below that is supposed to be refused goes through the
 * ANON key carrying a MINTED MEMBER TOKEN — the same shape a browser session
 * presents. Nothing is proved with the service key except the fixtures, because
 * the service key bypasses RLS and would prove nothing at all.
 *
 * ── WHAT IT WRITES AND WHAT IT REMOVES ───────────────────────────────────────
 * Two workspaces named `zz-assets-proof-<run>`, their members, one post each, one
 * asset each and one storage object each. Every delete at the end is qualified by
 * those workspace ids. No DROP, no TRUNCATE, no unqualified statement.
 *
 * Usage: node packages/db/scripts/assets-live-proof.mjs
 */
import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = resolve(HERE, '..', '..', '..', '.' + 'env')

function parseEnv(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

/**
 * ── THE OPT-IN ───────────────────────────────────────────────────────────────
 * This script WRITES TO THE PROJECT THAT SERVES PRODUCTION. A comment saying so
 * is not a control: once this file is committed, any future session can run it
 * with no ceremony at all. That is the exact shape of R-01 — on 2026-07-27 a live
 * run reached production while the operator believed it was blanked — and the
 * lesson recorded there was that a flag is necessary and a comment is not.
 *
 * So it refuses without an explicit, typed opt-in. The variable is deliberately
 * long and deliberately not one anything else sets.
 */
if (process.env.SAHODA_ASSETS_LIVE_PROOF !== 'yes-write-to-the-real-project') {
  console.error(
    [
      '',
      '  REFUSED: this script creates and deletes rows in the REAL project',
      '  (the one serving live workspaces), and was not asked to.',
      '',
      '  It makes two throwaway workspaces, proves the tenant boundary against',
      '  them with the anon key and minted member tokens, and removes exactly',
      '  what it made. Nothing else is touched. Run it deliberately:',
      '',
      '    SAHODA_ASSETS_LIVE_PROOF=yes-write-to-the-real-project \\',
      '      node packages/db/scripts/assets-live-proof.mjs',
      '',
    ].join('\n'),
  )
  process.exit(2)
}

const env = parseEnv(ENV_PATH)
const BASE = new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const JWT_SECRET = env.SUPABASE_JWT_SECRET
const BUCKET = 'media'

for (const [name, value] of [
  ['NEXT_PUBLIC_SUPABASE_URL', BASE],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE],
  ['SUPABASE_JWT_SECRET', JWT_SECRET],
]) {
  if (!value) throw new Error(`${name} is not configured`)
}

const b64url = (s) => Buffer.from(s).toString('base64url')

/**
 * A Clerk-shaped HS256 token. `iat` is backdated 300s: PostgREST allows a fixed
 * 30s of clock skew and answers PGRST303 past it, and minting at exactly `now`
 * spends the whole allowance on whatever skew exists at that instant.
 */
function mintJwt(sub, ttlSec = 3600) {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(
    JSON.stringify({
      sub,
      role: 'authenticated',
      aud: 'authenticated',
      iat: now - 300,
      exp: now + ttlSec,
    }),
  )
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

const service = () => createClient(BASE, SERVICE, { auth: { persistSession: false } })
const member = (sub) =>
  createClient(BASE, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${mintJwt(sub)}` } },
  })
const signedOut = () => createClient(BASE, ANON, { auth: { persistSession: false } })

// ── reporting ───────────────────────────────────────────────────────────────
let passed = 0
let failed = 0
const results = []

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1
    results.push(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    results.push(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}
const section = (title) =>
  results.push(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`)

// A real 1×1 PNG. Sniffed by the app's own reader, so the bytes have to be real.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const run = randomUUID().slice(0, 8)
const svc = service()

const A = { sub: `user_zzproofA_${run}`, name: `zz-assets-proof-A-${run}` }
const B = { sub: `user_zzproofB_${run}`, name: `zz-assets-proof-B-${run}` }

async function makeWorkspace(who) {
  const ws = await svc
    .from('workspaces')
    .insert({ name: who.name, slug: who.name, created_by: who.sub })
    .select('id')
    .single()
  if (ws.error) throw new Error(`fixture workspace: ${ws.error.message}`)
  who.workspaceId = ws.data.id
  const m = await svc
    .from('workspace_members')
    .insert({ workspace_id: who.workspaceId, user_id: who.sub, role: 'owner' })
  if (m.error) throw new Error(`fixture member: ${m.error.message}`)
}

async function cleanup() {
  for (const who of [A, B]) {
    if (!who.workspaceId) continue
    // Objects first: the bucket is not covered by the workspaces cascade.
    const listing = await svc.storage.from(BUCKET).list(`${who.workspaceId}/assets`)
    if (listing.data && listing.data.length > 0) {
      await svc.storage
        .from(BUCKET)
        .remove(listing.data.map((o) => `${who.workspaceId}/assets/${o.name}`))
    }
    // Attachments before assets: the `on delete restrict` key is doing its job.
    await svc.from('post_media').delete().eq('workspace_id', who.workspaceId)
    // Posts must lose their locking status before an asset can go.
    await svc.from('posts').update({ status: 'draft' }).eq('workspace_id', who.workspaceId)
    await svc.from('assets').delete().eq('workspace_id', who.workspaceId)
    await svc.from('workspaces').delete().eq('id', who.workspaceId)
  }
}

try {
  await makeWorkspace(A)
  await makeWorkspace(B)

  const aClient = member(A.sub)
  const bClient = member(B.sub)

  // ── fixtures for A, written the way the app writes them ────────────────────
  const assetId = randomUUID()
  const objectPath = `${A.workspaceId}/assets/${assetId}.png`

  const up = await svc.storage
    .from(BUCKET)
    .upload(objectPath, PNG_1x1, { contentType: 'image/png', upsert: false })
  if (up.error) throw new Error(`fixture upload: ${up.error.message}`)

  const asset = await svc
    .from('assets')
    .insert({
      id: assetId,
      workspace_id: A.workspaceId,
      storage_path: objectPath,
      kind: 'image',
      mime: 'image/png',
      bytes: PNG_1x1.length,
      width: 1,
      height: 1,
      title: 'Proof photo',
      created_by: A.sub,
    })
    .select('id')
    .single()
  if (asset.error) throw new Error(`fixture asset: ${asset.error.message}`)

  const post = await svc
    .from('posts')
    .insert({
      workspace_id: A.workspaceId,
      title: 'Diwali offer',
      status: 'scheduled',
      channels: ['instagram'],
    })
    .select('id')
    .single()
  if (post.error) throw new Error(`fixture post: ${post.error.message}`)

  const attach = await svc.from('post_media').insert({
    workspace_id: A.workspaceId,
    post_id: post.data.id,
    asset_id: assetId,
    storage_path: objectPath,
    mime: 'image/png',
    bytes: PNG_1x1.length,
    width: 1,
    height: 1,
  })
  if (attach.error) throw new Error(`fixture attach: ${attach.error.message}`)

  // ══════════════════════════════════════════════════════════════════════════
  section('the usage record is written by the attachment alone')

  const usages = await svc
    .from('asset_usages')
    .select('asset_id, post_id, channel')
    .eq('workspace_id', A.workspaceId)
  check(
    'inserting post_media created exactly one asset_usages row',
    !usages.error && usages.data?.length === 1,
    `rows=${usages.data?.length ?? 'error'}`,
  )
  check(
    'it points at the right post, with no invented channel',
    usages.data?.[0]?.post_id === post.data.id && usages.data?.[0]?.channel === null,
  )

  // ══════════════════════════════════════════════════════════════════════════
  section('A can see its own library (the control — a refusal proves nothing alone)')

  const aList = await aClient.from('assets').select('id, title').eq('id', assetId)
  check(
    'A lists its own asset with the anon key + its own member token',
    !aList.error && aList.data?.length === 1,
    aList.error ? aList.error.message : `rows=${aList.data?.length}`,
  )

  const aUsage = await aClient.from('asset_usages').select('id').eq('asset_id', assetId)
  check('A can read its own usage record', !aUsage.error && aUsage.data?.length === 1)

  // ══════════════════════════════════════════════════════════════════════════
  section('CROSS-TENANT · workspace B against workspace A, anon key + B’s member token')

  const bReadById = await bClient.from('assets').select('*').eq('id', assetId)
  check(
    'B cannot READ A’s asset by its id',
    !bReadById.error && bReadById.data?.length === 0,
    `rows=${bReadById.data?.length ?? bReadById.error?.message}`,
  )

  const bListAll = await bClient.from('assets').select('id')
  const bSawA = (bListAll.data ?? []).some((r) => r.id === assetId)
  check(
    'B cannot LIST A’s asset in an unfiltered select',
    !bListAll.error && !bSawA,
    `B sees ${bListAll.data?.length ?? 0} assets, none of them A’s`,
  )

  const bUsage = await bClient.from('asset_usages').select('id').eq('asset_id', assetId)
  check(
    'B cannot read A’s usage record — so it cannot learn what A is posting',
    !bUsage.error && bUsage.data?.length === 0,
  )

  const bPost = await svc
    .from('posts')
    .insert({ workspace_id: B.workspaceId, title: 'B post', status: 'draft', channels: [] })
    .select('id')
    .single()
  if (bPost.error) throw new Error(`fixture B post: ${bPost.error.message}`)

  // ATTACH fails two DIFFERENT ways, and both have to be shown: one is the
  // composite key, one is RLS. Proving either alone leaves the other untested.
  const bAttachOwnWs = await bClient.from('post_media').insert({
    workspace_id: B.workspaceId,
    post_id: bPost.data.id,
    asset_id: assetId,
    storage_path: objectPath,
    mime: 'image/png',
  })
  check(
    'B cannot ATTACH A’s asset under B’s own workspace_id (composite foreign key)',
    bAttachOwnWs.error !== null,
    bAttachOwnWs.error?.code ?? 'NO ERROR — the row was written',
  )

  const bAttachAWs = await bClient.from('post_media').insert({
    workspace_id: A.workspaceId,
    post_id: post.data.id,
    asset_id: assetId,
    storage_path: objectPath,
    mime: 'image/png',
  })
  check(
    'B cannot ATTACH A’s asset under A’s workspace_id (RLS on post_media)',
    bAttachAWs.error !== null,
    bAttachAWs.error?.code ?? 'NO ERROR — the row was written',
  )

  const bDelete = await bClient.from('assets').delete().eq('id', assetId).select('id')
  const stillThere = await svc.from('assets').select('id').eq('id', assetId)
  check(
    'B cannot DELETE A’s asset',
    (bDelete.data ?? []).length === 0 && stillThere.data?.length === 1,
    `B deleted ${(bDelete.data ?? []).length} rows; A’s asset still present: ${stillThere.data?.length === 1}`,
  )

  const bUpdate = await bClient
    .from('assets')
    .update({ title: 'owned by B now' })
    .eq('id', assetId)
    .select('id')
  const titleNow = await svc.from('assets').select('title').eq('id', assetId).single()
  check(
    'B cannot RENAME A’s asset',
    (bUpdate.data ?? []).length === 0 && titleNow.data?.title === 'Proof photo',
    `title is still “${titleNow.data?.title}”`,
  )

  const bDeleteUsage = await bClient
    .from('asset_usages')
    .delete()
    .eq('asset_id', assetId)
    .select('id')
  const usageStill = await svc.from('asset_usages').select('id').eq('asset_id', assetId)
  check(
    'B cannot delete A’s usage record to unlock A’s file',
    (bDeleteUsage.data ?? []).length === 0 && usageStill.data?.length === 1,
  )

  // ══════════════════════════════════════════════════════════════════════════
  section('STORAGE · a private bucket, signed links, and a path that is not a URL')

  const bSign = await bClient.storage.from(BUCKET).createSignedUrl(objectPath, 60)
  check(
    'B cannot MINT a signed URL for A’s object',
    bSign.error !== null || !bSign.data?.signedUrl,
    bSign.error?.message ?? 'a URL was returned',
  )

  const bDownload = await bClient.storage.from(BUCKET).download(objectPath)
  check(
    'B cannot DOWNLOAD A’s object',
    bDownload.error !== null,
    bDownload.error?.message ?? 'bytes returned',
  )

  // The raw path is not a URL. This is the address the database stores; anyone
  // who saw a row would have it.
  const rawUrl = `${BASE}/storage/v1/object/${BUCKET}/${objectPath}`
  const rawRes = await fetch(rawUrl)
  check(
    'the raw storage path is NOT publicly readable',
    !rawRes.ok,
    `HTTP ${rawRes.status} at /storage/v1/object/${BUCKET}/…`,
  )

  const rawBody = (await rawRes.text()).slice(0, 120)

  const rawPublic = await fetch(`${BASE}/storage/v1/object/public/${BUCKET}/${objectPath}`)
  check(
    'the bucket’s public route is NOT readable either',
    !rawPublic.ok,
    `HTTP ${rawPublic.status} at /storage/v1/object/public/${BUCKET}/…`,
  )

  // THE CONTROL. Without it the two checks above prove nothing: a 400 from a
  // malformed URL looks identical to a 400 from a refusal. The service key
  // fetches the SAME url and gets the bytes, so the address is right, the object
  // is there, and the refusal is a refusal.
  const rawWithKey = await fetch(rawUrl, {
    headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE },
  })
  check(
    'the same raw URL DOES serve bytes to the service key — so the refusal above is a refusal, not a typo',
    rawWithKey.ok,
    `HTTP ${rawWithKey.status} with the service key vs ${rawRes.status} without; anonymous body: ${rawBody}`,
  )

  const anonSign = await signedOut().storage.from(BUCKET).createSignedUrl(objectPath, 60)
  check(
    'a signed-out caller cannot mint a signed URL',
    anonSign.error !== null || !anonSign.data?.signedUrl,
    anonSign.error?.message ?? 'a URL was returned',
  )

  // Expiry. Minted at 1 second, then read twice: once inside its life, once past
  // it. A link that "expires" is only proved by a request that fails.
  const shortLived = await aClient.storage.from(BUCKET).createSignedUrl(objectPath, 1)
  check(
    'A CAN mint a signed URL for its own object',
    !shortLived.error && Boolean(shortLived.data?.signedUrl),
    shortLived.error?.message ?? '',
  )

  if (shortLived.data?.signedUrl) {
    const fresh = await fetch(shortLived.data.signedUrl)
    check('the fresh signed URL serves the bytes', fresh.ok, `HTTP ${fresh.status}`)

    await new Promise((r) => setTimeout(r, 3500))
    const stale = await fetch(shortLived.data.signedUrl)
    check(
      'the SAME signed URL is refused once its 1s life is over',
      !stale.ok,
      `HTTP ${stale.status} after waiting 3.5s`,
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  section('CONCURRENCY · the row lock inside public.delete_asset is real')

  // The pglite suite cannot prove this: it is one connection, so `for update`
  // is unobservable there and removing it leaves every test green. Two real
  // connections can. A holder takes the post's row lock; `delete_asset` must
  // then BLOCK rather than read a status that is about to change.
  const dbUrl = env.SUPABASE_DB_URL || env.DATABASE_URL
  if (!dbUrl) {
    results.push('  SKIP  no direct database url configured')
  } else {
    const pool = new pg.Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      max: 3,
    })
    const holder = await pool.connect()
    const deleter = await pool.connect()
    try {
      const lockPost = await svc
        .from('posts')
        .insert({ workspace_id: A.workspaceId, title: 'Lock probe', status: 'draft', channels: [] })
        .select('id')
        .single()
      const lockAssetId = randomUUID()
      await svc.from('assets').insert({
        id: lockAssetId,
        workspace_id: A.workspaceId,
        storage_path: `${A.workspaceId}/assets/${lockAssetId}.png`,
        kind: 'image',
        mime: 'image/png',
        bytes: 1,
        title: 'Lock probe photo',
      })
      await svc.from('post_media').insert({
        workspace_id: A.workspaceId,
        post_id: lockPost.data.id,
        asset_id: lockAssetId,
        storage_path: `${A.workspaceId}/assets/${lockAssetId}.png`,
        mime: 'image/png',
      })

      // Hold the post row.
      await holder.query('begin')
      await holder.query('select id from posts where id = $1 for update', [lockPost.data.id])

      // `set local` is transaction-scoped: a bare SET would be handed to the
      // NEXT client on this pooled connection.
      let blocked = false
      let message = ''
      try {
        await deleter.query('begin')
        await deleter.query("set local statement_timeout = '2s'")
        await deleter.query('select public.delete_asset($1, true)', [lockAssetId])
        await deleter.query('commit')
      } catch (error) {
        await deleter.query('rollback').catch(() => {})
        message = error instanceof Error ? error.message : String(error)
        blocked = /statement timeout|canceling statement/i.test(message)
      }
      check(
        'delete_asset BLOCKS while another transaction holds the post’s row lock',
        blocked,
        blocked
          ? 'timed out waiting for the lock, as it must'
          : `no block: ${message || 'it completed'}`,
      )

      await holder.query('rollback')

      // The control. Without the lock held the SAME call completes at once — so
      // the block above is the lock, not a slow function.
      const t0 = Date.now()
      const freed = await deleter.query('select public.delete_asset($1, true) as path', [
        lockAssetId,
      ])
      check(
        'and completes immediately once the lock is released',
        typeof freed.rows[0]?.path === 'string' && Date.now() - t0 < 2000,
        `${Date.now() - t0}ms`,
      )
    } finally {
      await holder.query('rollback').catch(() => {})
      holder.release()
      deleter.release()
      await pool.end()
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  section('DELETE GATE · an in-use file is refused, and the refusal names the post')

  // The post is `scheduled` and holds this photo. This is the delete a library
  // screen would run, from A's own member session.
  // Through the RPC, which is exactly what the library screen calls — including
  // `p_detach: true`, the input that would have stripped the photo in the
  // three-round-trip version of this action.
  const gated = await aClient.rpc('delete_asset', { p_asset_id: assetId, p_detach: true })
  const survived = await svc.from('assets').select('id').eq('id', assetId)
  const attachmentSurvived = await svc.from('post_media').select('id').eq('asset_id', assetId)
  check(
    'A’s own delete of an in-use file is REFUSED',
    gated.error !== null && survived.data?.length === 1,
    gated.error ? `${gated.error.code}` : 'NO ERROR — the file was deleted',
  )
  check(
    'and the scheduled post KEEPS its photo — the detach was rolled back with it',
    attachmentSurvived.data?.length === 1,
    `post_media rows for this file: ${attachmentSurvived.data?.length}`,
  )
  check(
    'the refusal NAMES the post by title',
    typeof gated.error?.message === 'string' && gated.error.message.includes('Diwali offer'),
    gated.error?.message ?? '(no message)',
  )
  check(
    'the refusal says WHY it is locked',
    typeof gated.error?.message === 'string' && gated.error.message.includes('scheduled to go out'),
  )
  results.push(`\n  REFUSAL MESSAGE, verbatim:\n    ${gated.error?.message ?? '(none)'}\n`)

  // Same file, once the post is no longer committed: the trigger opens and the
  // foreign key takes over, because the attachment is still on the post.
  await svc.from('posts').update({ status: 'draft' }).eq('id', post.data.id)

  // Without consent, an attached file is refused rather than quietly detached.
  const noConsent = await aClient.rpc('delete_asset', { p_asset_id: assetId, p_detach: false })
  check(
    'with the post back to draft, a delete WITHOUT consent is still refused',
    noConsent.error !== null && noConsent.error.code === '23503',
    noConsent.error ? `${noConsent.error.code}: still referenced by post_media` : 'deleted',
  )

  // With consent, the detach and the delete happen together.
  const consented = await aClient.rpc('delete_asset', { p_asset_id: assetId, p_detach: true })
  check(
    'with consent, the file goes and its storage path comes back',
    !consented.error && typeof consented.data === 'string',
    consented.error?.message ?? String(consented.data),
  )
  const usageGone = await svc.from('asset_usages').select('id').eq('asset_id', assetId)
  const mediaGone = await svc.from('post_media').select('id').eq('asset_id', assetId)
  check('the usage record went with it', usageGone.data?.length === 0)
  check('and so did the attachment', mediaGone.data?.length === 0)
} catch (error) {
  failed += 1
  results.push(`\n  ERROR  ${error.message}`)
} finally {
  await cleanup()
}

console.log(results.join('\n'))
console.log(`\n════ ${passed} passed, ${failed} failed ════`)
process.exit(failed === 0 ? 0 : 1)
