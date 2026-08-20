// Mint a Clerk test user on the DEVELOPMENT instance (pk_test_…), exactly the path
// apps/web/e2e/fixtures/seeded-user.ts uses. Writes the identity to scratchpad.
//
// This writes to Clerk's dev instance ONLY. It touches no Supabase project.
import { readFileSync, writeFileSync } from 'node:fs'

const WT = '/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-shots'
const SCRATCH =
  '/tmp/claude-1000/-home-divas-Documents-GitHub-sahodalabs/bba3e938-0904-498b-b8eb-82ebf7aa416b/scratchpad'

function parse(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}
const env = parse(`${WT}/apps/web/.env`)
const SECRET = env.CLERK_SECRET_KEY
if (!SECRET.startsWith('sk_test_')) throw new Error('refusing: CLERK_SECRET_KEY is not a dev key')

const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const email = `sahoda.deck.${stamp}+clerk_test@example.com`
const password = `Deck!${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}Aa1`

const res = await fetch('https://api.clerk.com/v1/users', {
  method: 'POST',
  headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email_address: [email],
    password,
    skip_password_checks: true,
    first_name: 'Sujata',
    last_name: 'Rao',
  }),
})
if (!res.ok) throw new Error(`Clerk user create failed ${res.status}: ${await res.text()}`)
const body = await res.json()

writeFileSync(
  `${SCRATCH}/deck-user.json`,
  JSON.stringify({ clerkUserId: body.id, email, password }, null, 2),
)
console.log('clerk user id:', body.id)
console.log('email:', email)
console.log('saved ->', `${SCRATCH}/deck-user.json`)
