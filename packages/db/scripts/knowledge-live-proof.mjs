/**
 * The live proofs for the Knowledge Library, run against the real project.
 *
 * ── WHY THIS IS A SCRIPT AND NOT A VITEST SUITE ──────────────────────────────
 * `tests/helpers/forbidden-target.js` aborts any suite whose target names this
 * project's ref, and that guard exists because on 2026-07-27 a live run hit
 * production while the operator believed it was blanked. It is not weakened here
 * and no suite is pointed at production. This is a separate, explicitly-invoked
 * script that creates its OWN throwaway workspaces, proves the boundary against
 * them, and removes exactly what it created.
 *
 * ── WHY IT EXISTS ALONGSIDE THE PGLITE SUITE ─────────────────────────────────
 * `tests/knowledge_library.pglite.test.ts` proves the POLICIES IN THE FILES hold,
 * against a real Postgres, on every gate run, with no credentials. It cannot
 * prove three things, and each of them is what this script is for:
 *
 *   · that PRODUCTION's policies match those files;
 *   · that POSTGREST — the layer the browser actually talks to — enforces them,
 *     including on the view and on a full-text search;
 *   · that STORAGE refuses the other tenant's folder, which is a different
 *     policy on a different table in a different schema.
 *
 * ── EVERY REFUSAL IS REPORTED SEPARATELY ─────────────────────────────────────
 * Not "B could read nothing" — one line per surface, each printing the SERVER'S
 * OWN ANSWER (a row count, an error code, an error message). A guard proven on
 * element [0] of a collection it claims to cover in full is the recurring shape
 * of failure in this repo, so all five functions, both tables, the view, the
 * search and the bucket are each named.
 *
 * ── WHAT IT WRITES AND WHAT IT REMOVES ───────────────────────────────────────
 * Two workspaces named `zz-knowledge-proof-<run>`, their members, one Brand Brain
 * each, some documents and passages, and one storage object. Every delete at the
 * end is qualified by those workspace ids. No DROP, no TRUNCATE, no unqualified
 * statement.
 *
 * Usage:
 *   SAHODA_KNOWLEDGE_LIVE_PROOF=yes-write-to-the-real-project \
 *     node packages/db/scripts/knowledge-live-proof.mjs
 */
import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

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
 */
if (process.env.SAHODA_KNOWLEDGE_LIVE_PROOF !== 'yes-write-to-the-real-project') {
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
      '    SAHODA_KNOWLEDGE_LIVE_PROOF=yes-write-to-the-real-project \\',
      '      node packages/db/scripts/knowledge-live-proof.mjs',
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
/** The anon key alone — exactly what an unauthenticated browser presents. */
const signedOut = () => createClient(BASE, ANON, { auth: { persistSession: false } })

/**
 * ── THE NEGATIVE CONTROL ─────────────────────────────────────────────────────
 * Every refusal below would also be reported by a boundary that refuses
 * EVERYTHING — a missing grant, a typo in a table name, an expired token. A run
 * of thirty-two green "B cannot" lines is consistent with B being unable to
 * reach the database at all, and that is not the claim being made.
 *
 * `--negative-control` makes B a genuine member of A's workspace before the
 * checks run. Every "B is refused" line must then go RED. If they stay green,
 * the proof is measuring its own plumbing rather than the policies, and the
 * ordinary run means nothing.
 *
 * It is a separate invocation on purpose: the two cannot be run at once, because
 * the whole point is that they disagree.
 */
const NEGATIVE_CONTROL = process.argv.includes('--negative-control')

// ── reporting ───────────────────────────────────────────────────────────────
let passed = 0
let failed = 0
const results = []

/**
 * Checks that hold ONLY BECAUSE B IS NOT A MEMBER of A's workspace. These are
 * the ones the negative control must turn red, and they are marked at the call
 * site rather than inferred from the label.
 *
 * ── WHY MARKED AND NOT MATCHED ──────────────────────────────────────────────
 * The first version of this decided by regex on the label, and got two whole
 * groups wrong — both of which are RIGHT to stay green under the control:
 *
 *   · the signed-out checks. An anon request is refused whether or not B is a
 *     member; B's membership has nothing to do with it.
 *   · "B inserting a passage into A's document". `knowledge_chunks` has no
 *     INSERT policy for ANYONE, so a member is refused too — which is the point
 *     of the table being read-only.
 *
 * Counting those as cross-tenant made the control demand failures from checks
 * that were behaving correctly. Deriving a category from a display string is the
 * mistake; naming it is the fix.
 */
const crossTenant = { total: 0, red: 0 }

function check(label, condition, detail = '', opts = {}) {
  if (opts.crossTenant) crossTenant.total += 1
  if (condition) {
    passed += 1
    results.push(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    if (opts.crossTenant) crossTenant.red += 1
    results.push(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}
/** Shorthand for the marking above, so a call site reads as what it asserts. */
const CROSS_TENANT = { crossTenant: true }
const section = (title) =>
  results.push(`\n── ${title} ${'─'.repeat(Math.max(0, 62 - title.length))}`)

/**
 * What the server said, in one line, for printing beside every verdict.
 *
 * An RPC returns an OBJECT and a table read returns an ARRAY, so a bare
 * `data.length` printed "rows: 0" next to a successful function call — a figure
 * about a shape the answer does not have, sitting beside the word PASS.
 */
const say = (r) => {
  if (r.error) return `${r.error.code ?? 'err'}: ${String(r.error.message).slice(0, 90)}`
  if (Array.isArray(r.data)) return `rows: ${r.data.length}`
  return r.data === null || r.data === undefined
    ? 'ok (no body)'
    : JSON.stringify(r.data).slice(0, 90)
}

const run = randomUUID().slice(0, 8)
const svc = service()

const A = { sub: `user_zzkproofA_${run}`, name: `zz-knowledge-proof-A-${run}` }
const B = { sub: `user_zzkproofB_${run}`, name: `zz-knowledge-proof-B-${run}` }

/** The six sections `resolve_brand_memory` pins, so a brain row is a legal one. */
const BRAIN = {
  voice: {
    descriptor: 'warm',
    formality_label: 'casual',
    signature_phrases: ['a', 'b', 'c'],
    banned_phrases: [],
  },
  brand_persona: { archetype: 'sage', one_liner: 'we know dosas', core_values: ['x', 'y', 'z'] },
  customer_persona: {
    one_liner: 'regulars',
    primary_pain_point: 'queues',
    primary_fear: 'cold food',
    desired_identity: 'a local',
  },
  hook: { core_promise: 'hot in five', primary_emotion: 'calm', sample_hooks: ['h1', 'h2', 'h3'] },
  taboo: { red_lines: [] },
  alignment: { signal_lock: 'strong', note: '' },
}

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
    const listing = await svc.storage.from(BUCKET).list(`${who.workspaceId}/knowledge`)
    if (listing.data && listing.data.length > 0) {
      await svc.storage
        .from(BUCKET)
        .remove(listing.data.map((o) => `${who.workspaceId}/knowledge/${o.name}`))
    }
    // Documents cascade to chunks; the workspace cascades to everything else.
    await svc.from('knowledge_documents').delete().eq('workspace_id', who.workspaceId)
    await svc.from('workspaces').delete().eq('id', who.workspaceId)
  }
}

try {
  await makeWorkspace(A)
  await makeWorkspace(B)

  if (NEGATIVE_CONTROL) {
    // B joins A's workspace for real. Every refusal below should now fail.
    const join = await svc
      .from('workspace_members')
      // 'editor', not 'member' — `workspace_members_role_check` allows exactly
      // owner | editor | approver | viewer, and the first draft of this control
      // used a role that does not exist. It CRASHED, produced one failure, and
      // the verdict below counted that crash as the control working. See the
      // note on `refusalChecks`.
      .insert({ workspace_id: A.workspaceId, user_id: B.sub, role: 'editor' })
    if (join.error) throw new Error(`negative control: ${join.error.message}`)
    results.push(
      '\n  NEGATIVE CONTROL: B has been made a MEMBER of A’s workspace.' +
        '\n  Every "B is refused" line below MUST now fail. If any passes, this' +
        '\n  proof is measuring its own plumbing rather than the policies.\n',
    )
  }

  const aClient = member(A.sub)
  const bClient = member(B.sub)
  const outClient = signedOut()

  // ── A builds a library, through the same calls the screen makes ────────────
  section('A builds a library through the RPCs, as the screen does')

  const created = await aClient.rpc('create_knowledge_document', {
    p_workspace_id: A.workspaceId,
    p_title: 'Dosa menu',
    p_source_kind: 'pdf',
    p_source_ref: 'menu.pdf',
    p_storage_path: `${A.workspaceId}/knowledge/menu.pdf`,
    p_mime: 'application/pdf',
    p_bytes: 1024,
  })
  check('A creates a document with the anon key + her own token', !created.error, say(created))
  const docId = created.data?.id
  if (!docId) throw new Error(`no document id: ${created.error?.message}`)

  const indexed = await aClient.rpc('index_knowledge_document', {
    p_document_id: docId,
    p_chunks: ['Masala dosa is 90 rupees.', 'We open at 7am on Sunday.'],
    p_content_sha256: 'sha-live-proof',
    p_addressed_instructions: 0,
    p_instruction_samples: [],
  })
  check(
    'A indexes it, and the server reports what it stored',
    !indexed.error && indexed.data?.chunk_count === 2,
    indexed.error ? say(indexed) : JSON.stringify(indexed.data),
  )

  // ── A can read her own, on every surface ───────────────────────────────────
  section('A reads her own library on all three surfaces')

  const aDocs = await aClient.from('knowledge_documents').select('id,title,status,chunk_count')
  check(
    'A sees her document',
    aDocs.data?.length === 1,
    aDocs.error ? say(aDocs) : JSON.stringify(aDocs.data),
  )

  const aChunks = await aClient.from('knowledge_chunks').select('ordinal,text').order('ordinal')
  check('A sees her passages', aChunks.data?.length === 2, say(aChunks))

  const aView = await aClient.from('knowledge_current_chunks').select('text,document_title')
  check('A sees them through the view', aView.data?.length === 2, say(aView))

  const aSearch = await aClient
    .from('knowledge_current_chunks')
    .select('text')
    .textSearch('tsv', 'rupees')
  check(
    'PostgREST full-text search returns the right passage',
    aSearch.data?.length === 1 && aSearch.data[0].text.includes('90 rupees'),
    aSearch.error ? say(aSearch) : JSON.stringify(aSearch.data),
  )

  // ── B: every surface, refused separately ──────────────────────────────────
  section('B is a real signed-in user of ANOTHER workspace — every surface')

  const bDocs = await bClient.from('knowledge_documents').select('id,title')
  check(
    'B reading knowledge_documents gets nothing of A’s',
    bDocs.data?.length === 0,
    say(bDocs),
    CROSS_TENANT,
  )

  const bChunks = await bClient.from('knowledge_chunks').select('text')
  check(
    'B reading knowledge_chunks gets nothing of A’s',
    bChunks.data?.length === 0,
    say(bChunks),
    CROSS_TENANT,
  )

  const bView = await bClient.from('knowledge_current_chunks').select('text')
  check(
    'B reading the VIEW gets nothing of A’s',
    bView.data?.length === 0,
    say(bView),
    CROSS_TENANT,
  )

  const bSearch = await bClient
    .from('knowledge_current_chunks')
    .select('text')
    .textSearch('tsv', 'rupees')
  check(
    'B searching for A’s own word finds nothing',
    bSearch.data?.length === 0,
    say(bSearch),
    CROSS_TENANT,
  )

  const bById = await bClient.from('knowledge_documents').select('id').eq('id', docId)
  check(
    'B naming A’s document id directly still gets nothing',
    bById.data?.length === 0,
    say(bById),
    CROSS_TENANT,
  )

  // ── B: all five functions, one line each ──────────────────────────────────
  section('B calls all five functions on A’s document — each named')

  const bCalls = {
    create: await bClient.rpc('create_knowledge_document', {
      p_workspace_id: A.workspaceId,
      p_title: 'theirs',
      p_source_kind: 'text',
      p_source_ref: 'typed',
    }),
    start: await bClient.rpc('start_knowledge_indexing', { p_document_id: docId }),
    index: await bClient.rpc('index_knowledge_document', {
      p_document_id: docId,
      p_chunks: ['smuggled'],
    }),
    fail: await bClient.rpc('fail_knowledge_document', {
      p_document_id: docId,
      p_code: 'no_text',
      p_detail: 'x',
    }),
    remove: await bClient.rpc('delete_knowledge_document', {
      p_document_id: docId,
      p_acknowledge: true,
    }),
  }
  for (const [name, r] of Object.entries(bCalls)) {
    check(
      `B’s ${name} is refused`,
      r.error !== null && String(r.error.message).includes('NOT_A_MEMBER'),
      r.error ? String(r.error.message).slice(0, 70) : 'NO ERROR — the call went through',
      CROSS_TENANT,
    )
  }

  // ── B: direct writes ──────────────────────────────────────────────────────
  section('B writes directly to the tables — and so does A, who also may not')

  const bInsert = await bClient
    .from('knowledge_chunks')
    .insert({
      workspace_id: A.workspaceId,
      document_id: docId,
      index_version: 1,
      ordinal: 99,
      text: 'invented',
    })
  check('B inserting a passage into A’s document is refused', bInsert.error !== null, say(bInsert))

  const aUpdate = await aClient
    .from('knowledge_chunks')
    .update({ text: 'now 900 rupees' })
    .eq('document_id', docId)
    .select('id')
  check(
    'A editing her OWN passage changes nothing (read-only + append-only)',
    aUpdate.error !== null || aUpdate.data?.length === 0,
    say(aUpdate),
  )
  const stillSays = await aClient.from('knowledge_chunks').select('text').eq('ordinal', 0)
  check(
    'and the passage still says what the document said',
    stillSays.data?.[0]?.text === 'Masala dosa is 90 rupees.',
    JSON.stringify(stillSays.data),
  )

  const aDelete = await aClient.from('knowledge_documents').delete().eq('id', docId).select('id')
  check(
    'A deleting her own document by table is refused — it must go through the gate',
    aDelete.error !== null || aDelete.data?.length === 0,
    say(aDelete),
  )

  // ── signed out ────────────────────────────────────────────────────────────
  section('A signed-OUT request, carrying only the anon key')

  const outDocs = await outClient.from('knowledge_documents').select('id')
  check(
    'reading documents gets nothing',
    outDocs.data?.length === 0 || outDocs.error !== null,
    say(outDocs),
  )

  const outView = await outClient.from('knowledge_current_chunks').select('text')
  check(
    'reading the view gets nothing',
    outView.data?.length === 0 || outView.error !== null,
    say(outView),
  )

  const outRpc = await outClient.rpc('create_knowledge_document', {
    p_workspace_id: A.workspaceId,
    p_title: 'x',
    p_source_kind: 'text',
    p_source_ref: 'typed',
  })
  check(
    'and the function is not even executable — the grant, not just the check',
    outRpc.error !== null,
    outRpc.error ? String(outRpc.error.message).slice(0, 90) : 'NO ERROR — it ran',
  )

  // ── storage ───────────────────────────────────────────────────────────────
  section('Storage: the same bucket policy that already covers assets')

  const pdfBytes = Buffer.from('%PDF-1.4\n% a throwaway proof file\n')
  const aPath = `${A.workspaceId}/knowledge/${randomUUID()}.pdf`

  const aUp = await aClient.storage
    .from(BUCKET)
    .upload(aPath, pdfBytes, { contentType: 'application/pdf', upsert: false })
  check('A uploads into her own workspace folder', !aUp.error, aUp.error?.message ?? aPath)

  const bDown = await bClient.storage.from(BUCKET).download(aPath)
  check(
    'B cannot download A’s file, naming its exact path',
    bDown.error !== null,
    bDown.error ? String(bDown.error.message).slice(0, 70) : 'DOWNLOADED — the object came back',
    CROSS_TENANT,
  )

  const bList = await bClient.storage.from(BUCKET).list(`${A.workspaceId}/knowledge`)
  check(
    'B listing A’s folder sees nothing',
    (bList.data?.length ?? 0) === 0,
    bList.error ? String(bList.error.message).slice(0, 70) : `entries: ${bList.data?.length}`,
    CROSS_TENANT,
  )

  const bUp = await bClient.storage
    .from(BUCKET)
    .upload(`${A.workspaceId}/knowledge/${randomUUID()}.pdf`, pdfBytes, {
      contentType: 'application/pdf',
    })
  check(
    'B cannot write INTO A’s folder either',
    bUp.error !== null,
    bUp.error ? String(bUp.error.message).slice(0, 70) : 'UPLOADED — the object was written',
    CROSS_TENANT,
  )

  // ── the delete gate, live ─────────────────────────────────────────────────
  section('The delete gate, against a Brand Brain that cites the document')

  const brain = await svc.from('brand_memory').insert({
    workspace_id: A.workspaceId,
    version: 1,
    status: 'active',
    payload: {
      ...BRAIN,
      field_meta: {
        'hook.core_promise': { kind: 'inferred', confirmed: false, source: `document:${docId}` },
      },
    },
    source: 'resolved',
  })
  check('a brain citing the document is in place', !brain.error, brain.error?.message ?? 'ok')

  const refused = await aClient.rpc('delete_knowledge_document', { p_document_id: docId })
  check(
    'A’s delete is REFUSED until she is told what it affects',
    refused.error !== null && String(refused.error.message).includes('NEEDS_ACKNOWLEDGEMENT'),
    refused.error ? String(refused.error.message).slice(0, 70) : 'DELETED without asking',
  )
  const survived = await aClient.from('knowledge_documents').select('id').eq('id', docId)
  check('and the document is still there', survived.data?.length === 1, say(survived))

  const allowed = await aClient.rpc('delete_knowledge_document', {
    p_document_id: docId,
    p_acknowledge: true,
  })
  check(
    'with the acknowledgement it goes, and reports what it affected',
    !allowed.error && allowed.data?.brand_fields === 1,
    allowed.error ? say(allowed) : JSON.stringify(allowed.data),
  )
  const chunksGone = await aClient.from('knowledge_chunks').select('id').eq('document_id', docId)
  check('the passages went with it, by cascade', chunksGone.data?.length === 0, say(chunksGone))
} catch (error) {
  failed += 1
  results.push(`\n  ERROR  ${error.message}`)
} finally {
  await cleanup()
}

console.log(results.join('\n'))
console.log(`\n════ ${passed} passed, ${failed} failed ════`)

if (NEGATIVE_CONTROL) {
  /**
   * ── WHY THIS IS NOT `failed > 0` ───────────────────────────────────────────
   * It was, for one run. The control set B's role to a value the CHECK
   * constraint forbids, threw before a single assertion executed, produced
   * exactly one failure — the crash — and this verdict printed NEGATIVE CONTROL
   * OK. A control that reports success when nothing ran is the same defect it
   * exists to catch, one level up.
   *
   * So it demands two things a crash cannot supply: that the refusal checks
   * actually EXECUTED, and that a majority of them went red.
   */
  const { total: ran, red } = crossTenant
  // EVERY marked check, not most of them. Each one is a separate surface, and a
  // surface that stayed shut when the boundary was removed was never being held
  // shut by the boundary.
  const ok = ran >= 10 && red === ran
  console.log(
    ok
      ? `\n  NEGATIVE CONTROL OK — all ${ran} cross-tenant refusals turned red once B\n  was a member, so the ordinary run measures the policies, not the plumbing.`
      : `\n  NEGATIVE CONTROL FAILED — ${red} of ${ran} cross-tenant checks went red.\n  A check that stayed green was never being held shut by the tenant boundary\n  (or the run crashed before it could measure anything). Do not trust the\n  ordinary run until this says OK.`,
  )
  process.exit(ok ? 0 : 1)
}

process.exit(failed === 0 ? 0 : 1)
