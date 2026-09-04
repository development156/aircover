# Rotating the production database password

**Status: NOT DONE. The live password is public.** MEASURED 2026-09-04: the value
in `apps/web/.env` and the value committed to the public repository have the same
SHA-256. Anyone who read the repository before the purge has it.

This is the only step that makes the leak worthless. Everything else that has been
done, the history purge, the deleted branches, secret scanning, the commit guard,
reduces who finds it next. **None of it takes the credential back.** GitHub keeps
unreachable objects, forks and clones are outside our control, and mirrors exist.

About ten minutes. Steps 1 to 3 must be consecutive: paid actions fail in between.

---

## Before you start

Open both tabs first, so the window where the app is broken is seconds not minutes.

- Supabase: **Project `rloztdhzfliyvpvxsgjl` → Settings → Database**
- Vercel: **`development-4417s-projects` → `sahodalabs` → Settings → Environment Variables**

## 1 · Reset it in Supabase

Settings → Database → **Reset database password** → generate a strong one → copy it.

Use the dashboard, not `ALTER USER ... WITH PASSWORD` over SQL. The dashboard also
updates the pooler's credentials; raw SQL changes the role only, and this project
connects through the **pooler** host (`aws-1-ap-south-1.pooler.supabase.com`), so a
SQL-only rotation can leave the two out of step.

## 2 · Update Vercel, before anything redeploys

Edit `SUPABASE_DB_URL`. Keep the pooler host exactly as it is and replace only the
password. **Percent-encode it** if it contains `@ : / ? # [ ] %` — an unencoded `@`
silently splits the URL and the failure reads as a wrong host, not a bad password.

Then **redeploy**. A Vercel environment variable does not reach a running
deployment; the change only takes effect on the next build.

## 3 · Update every local copy

Thirteen worktrees hold a copy. This rewrites all of them, and prints the file it
changed rather than the value it wrote:

```bash
NEWPW='<the new password>' node - <<'EOF'
const fs=require('fs'), path=require('path');
const root='/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees';
const pw=process.env.NEWPW;
if(!pw){ console.error('NEWPW is empty — refusing'); process.exit(1); }
let n=0;
for (const d of fs.readdirSync(root)) {
  for (const f of ['apps/web/.env','apps/web/.env.local']) {
    const p=path.join(root,d,f);
    if(!fs.existsSync(p)) continue;
    const before=fs.readFileSync(p,'utf8');
    const after=before.replace(/^(SUPABASE_DB_URL\s*=\s*["']?)([a-z]+:\/\/[^:]+:)([^@]*)(@)/m,
      (_,a,b,__,d2)=>a+b+encodeURIComponent(pw)+d2);
    if(after!==before){ fs.writeFileSync(p,after); fs.chmodSync(p,0o600); console.log('  updated',d+'/'+f); n++; }
  }
}
console.log(n+' file(s) updated');
EOF
```

Then confirm one lane can still reach the database, without printing anything secret:

```bash
cd .claude/worktrees/wt-core
node -e "
const fs=require('fs');const t=fs.readFileSync('apps/web/.env','utf8');
const u=t.match(/^SUPABASE_DB_URL\s*=\s*[\"']?(\S+?)[\"']?\s*\$/m)[1];
const pg=require('./node_modules/.pnpm/pg@8.22.0/node_modules/pg/lib/index.js');
const c=new pg.Client({connectionString:u,ssl:{rejectUnauthorized:false}});
c.connect().then(()=>c.query('select 1 ok')).then(r=>{console.log('  DB OK');return c.end()})
 .catch(e=>{console.log('  DB FAILED:',e.message.split('\n')[0]);process.exit(1)});"
```

## 4 · Confirm the product works

`https://app.sahodalabs.com` — sign in, open **/wallet**. A balance that reads a
number means the pooler credential is right. "Could not read balance" means step 2
or 3 is wrong, most often percent-encoding.

## 5 · Then tell GitHub the old objects are gone

The purge rewrote history, but GitHub still serves unreachable commits by SHA for a
period. Ask them to garbage-collect:

**<https://support.github.com/contact>** — say the repository is
`development156/aircover`, that a credential was force-pushed out of history, and
ask for the stale objects to be purged from the cache. Do this AFTER the rotation,
never instead of it.

---

## What else holds this credential

Anything below still holding the OLD password keeps failing until it is updated.

| | |
| --- | --- |
| Vercel env `SUPABASE_DB_URL` | step 2 |
| 13 local `apps/web/.env*` | step 3 |
| GitHub Actions secrets | **none are configured** — the smoke workflow has never had any |
| Trigger.dev / apps/jobs | check if it holds its own copy |
| Any teammate's laptop | tell them; their clone has the old value in `.env` |

## Why not an IP allowlist instead

Supabase network restrictions would make a stolen password useless without any
rotation. It does not work here: Vercel's functions egress from dynamic addresses,
so an allowlist tight enough to matter also locks out the product.
