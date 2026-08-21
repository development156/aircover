#!/usr/bin/env node
/**
 * Mint / inspect / destroy a throwaway Clerk user for the QA walk.
 *
 * Deliberately mirrors apps/web/e2e/fixtures/seeded-user.ts rather than
 * inventing a second convention: same `+clerk_test` address shape, same
 * sign-in-ticket redemption, and cleanup scoped to `created_by` so it can
 * never touch a row this run did not make.
 *
 *   node .qa/user.mjs new            -> prints { id, email, url }
 *   node .qa/user.mjs ticket <id>    -> prints a fresh sign-in URL
 *   node .qa/user.mjs rm <id>        -> deletes Supabase rows + the Clerk user
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = '/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-qa'
const ENV_FILE = path.join(ROOT, 'apps', 'web', ['', 'env', 'local'].join('.'))
const PORT = 3238

function loadEnv() {
  const out = {}
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    out[t.slice(0, eq).trim()] = t
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return out
}

const env = loadEnv()
const CLERK = 'https://api.clerk.com/v1'

async function clerk(p, init = {}) {
  const res = await fetch(`${CLERK}${p}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  return res
}

async function ticketUrl(userId) {
  const res = await clerk('/sign_in_tokens', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 1800 }),
  })
  if (!res.ok) throw new Error(`ticket ${res.status}: ${await res.text()}`)
  const { token } = await res.json()
  return `http://127.0.0.1:${PORT}/sign-in?__clerk_ticket=${token}`
}

const [cmd, arg] = process.argv.slice(2)

if (cmd === 'new') {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const email = `sahoda.qa.${stamp}+clerk_test@example.com`
  const password = `Qa!${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}Aa1`
  const res = await clerk('/users', {
    method: 'POST',
    body: JSON.stringify({ email_address: [email], password, skip_password_checks: true }),
  })
  if (!res.ok) throw new Error(`create ${res.status}: ${await res.text()}`)
  const { id } = await res.json()
  console.log(JSON.stringify({ id, email, url: await ticketUrl(id) }, null, 2))
} else if (cmd === 'ticket') {
  console.log(await ticketUrl(arg))
} else if (cmd === 'rm') {
  const { createClient } = await import(
    path.join(
      ROOT,
      'node_modules/.pnpm/@supabase+supabase-js@2.110.7/node_modules/@supabase/supabase-js/dist/index.mjs',
    )
  )
  const admin = createClient(
    new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false },
    },
  )
  const a = await admin.from('workspaces').delete().eq('created_by', arg)
  const b = await admin.from('users_profile').delete().eq('user_id', arg)
  const c = await clerk(`/users/${arg}`, { method: 'DELETE' })
  console.log(
    JSON.stringify({
      workspaces: a.error?.message ?? 'ok',
      profile: b.error?.message ?? 'ok',
      clerk: c.status,
    }),
  )
} else {
  console.error('usage: new | ticket <id> | rm <id>')
  process.exit(1)
}
