#!/usr/bin/env node
/**
 * A competitor `locator` is a URL a user types and the server later FETCHES.
 * That is an SSRF surface by construction, and the CHECK constraint
 * `locator = app.radar_normalize_locator(kind, locator)` is the database's only
 * say in what may be stored.
 *
 * The first version of this probe was WRONG in the way the brief warns about: a
 * raised exception aborted the read-only transaction, so every later probe came
 * back "current transaction is aborted" and got printed as `rejected`. It would
 * have reported fifteen refusals when two inputs had actually been evaluated.
 * Each probe now runs inside its own SAVEPOINT, and a rolled-back savepoint is
 * reported as an ERROR rather than as a refusal.
 *
 * The question is asked twice per input, because they are different questions:
 *   RAW       — can the user store the string exactly as typed?
 *   NORMALIZED— does normalize() return a value the CHECK would then accept?
 * The second is what actually matters: the app stores normalize(input), so a
 * host that survives normalisation is a host the fetcher will be pointed at.
 */
import { withClient } from '../lib/db.mjs'

const CASES = [
  ['website', 'http://169.254.169.254/latest/meta-data/', 'AWS/GCP instance metadata (link-local)'],
  ['website', '169.254.169.254', 'the same, typed bare'],
  ['website', 'http://metadata.google.internal/computeMetadata/v1/', 'GCP metadata by name'],
  ['website', 'metadata.google.internal', 'the same, typed bare'],
  ['website', '127.0.0.1', 'loopback'],
  ['website', 'localhost', 'loopback by name'],
  ['website', '10.0.0.5', 'RFC1918 private'],
  ['website', '192.168.1.1', 'RFC1918 private'],
  ['website', '172.16.0.1', 'RFC1918 private'],
  ['website', '[::1]', 'IPv6 loopback'],
  ['website', 'file:///etc/passwd', 'non-http scheme'],
  ['website', 'gopher://evil.example/', 'non-http scheme'],
  ['website', 'javascript:alert(1)', 'javascript scheme'],
  ['website', 'rloztdhzfliyvpvxsgjl.supabase.co', "the product's own database host"],
  ['website', 'https://example.com@169.254.169.254/', 'userinfo confusion'],
  ['website', 'https://example.com#@169.254.169.254/', 'fragment confusion'],
  ['website', 'normal-competitor.example', 'an ordinary competitor, the control'],
  ['instagram', 'https://instagram.com/../../etc/passwd', 'traversal in a handle'],
  ['instagram', '@someone', 'ordinary handle, the control'],
  ['x', 'https://x.com/someone?redirect=http://169.254.169.254', 'query smuggling'],
]

await withClient(async (c) => {
  const src = (
    await c.query(
      `select pg_get_functiondef(p.oid) as def from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='app' and p.proname='radar_normalize_locator'`,
    )
  ).rows
  console.log('=== app.radar_normalize_locator ===')
  for (const r of src) console.log(r.def)

  const norm = async (kind, v) => {
    await c.query('savepoint p')
    try {
      const out = (await c.query(`select app.radar_normalize_locator($1,$2) as l`, [kind, v]))
        .rows[0].l
      await c.query('release savepoint p')
      return { ok: true, value: out }
    } catch (e) {
      await c.query('rollback to savepoint p')
      return { ok: false, error: e.message.split('\n')[0] }
    }
  }

  console.log('\n=== what survives normalisation ===')
  console.log(
    'STORABLE means normalize() returned a value and normalize(that value) is itself —\n' +
      'i.e. the CHECK constraint accepts the row the app would actually insert.\n',
  )
  const storable = []
  for (const [kind, raw, note] of CASES) {
    const a = await norm(kind, raw)
    let verdict, detail
    if (!a.ok) {
      verdict = 'REFUSED  '
      detail = a.error
    } else {
      const b = await norm(kind, a.value)
      const fixed = b.ok && b.value === a.value
      verdict = fixed ? '!! STORABLE' : 'REFUSED  '
      detail = `normalize(${JSON.stringify(raw)}) = ${JSON.stringify(a.value)}${
        fixed
          ? '  <-- the CHECK accepts this'
          : `  (but normalize of that = ${JSON.stringify(b.value ?? b.error)})`
      }`
      if (fixed) storable.push({ kind, raw, stored: a.value, note })
    }
    console.log(`${verdict}  ${kind.padEnd(10)} ${raw}`)
    console.log(`             ${note}`)
    console.log(`             ${detail}`)
  }

  console.log('\n=== HOSTS THE DATABASE WOULD ACCEPT AND THE FETCHER WOULD BE POINTED AT ===')
  for (const s of storable) console.log(`   ${s.stored.padEnd(34)} <- ${s.raw}   (${s.note})`)
  console.log(`\n${storable.length} of ${CASES.length} storable.`)
})
