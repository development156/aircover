# The capture harness

These are the exact scripts that produced `docs/deck/*.png`, kept so the next capture is an hour
rather than a day. They ran from a session scratchpad, so **every absolute path near the top of each
file points at a directory that no longer exists** and must be repointed before they run again. That
is the only change they need; nothing else about them is stale.

They contain no secrets. Each reads the repository's `.env` at runtime. `postgrest.conf` carries the
password of a throwaway local Postgres (`postgres`), which is created and destroyed by `pgbox`.

## What each one does

| File                  | Role                                                                                                                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mint-user.mjs`       | Creates a Clerk test user on the **development** instance. Refuses a non-`sk_test_` key.                                                                                                                                                                                   |
| `seed.mjs`            | Writes the whole Sujata Bake House demo workspace. **Refuses any host that is not loopback.**                                                                                                                                                                              |
| `grants.sql`          | The privileges a real Supabase project grants at creation. `pgbox` creates the roles but not these, so without it `authenticated` can select nothing and every read looks like an RLS denial.                                                                              |
| `backdate.sql`        | Spreads `credit_ledger.created_at`. `apply_ledger_entry` stamps `now()`, so a seeded history otherwise lands on one day and the spend trend has a single point. Disables the append-only trigger and puts it back.                                                         |
| `get-postgrest.mjs`   | Downloads the PostgREST static linux binary.                                                                                                                                                                                                                               |
| `postgrest.conf`      | PostgREST in front of the box, verifying **Clerk's** session tokens against Clerk's JWKS — the same arrangement as the real Supabase third-party-auth integration.                                                                                                         |
| `proxy.mjs`           | The local stand-in for the Supabase edge: `/rest/v1/*` to PostgREST with the prefix stripped, `/storage/v1/*` to generated demo tiles.                                                                                                                                     |
| `rewrite-env.mjs`     | Repoints the worktree at the stand-in and **removes** 20 live credentials so a screenshot run cannot reach a real service. Removal, not blanking: several are `min(1).optional()` or carry a regex, so an empty string is a present-and-invalid value that fails the boot. |
| `prove-isolation.mjs` | Reads `/proc/<pid>/` of the dev server to prove it is this worktree's and that no database variable names a remote host.                                                                                                                                                   |
| `capture.mjs`         | The frames. One screen at a time, each stat'd before the next; rebuilds the browser on a renderer crash; flags byte-identical frames.                                                                                                                                      |
| `teardown.mjs`        | Deletes the Clerk user and kills only processes proved to be ours.                                                                                                                                                                                                         |

## Order

```
node packages/db/scripts/pgbox.mjs up      # SAHODA_PGBOX_HOME + SAHODA_PGBOX_PORT set
psql … -f grants.sql
node get-postgrest.mjs && tar -xJf postgrest.tar.xz
node mint-user.mjs
node seed.mjs
psql … -f backdate.sql
./postgrest postgrest.conf &
node proxy.mjs &
node rewrite-env.mjs
pnpm --filter @sahoda/web dev --port <yours>
node prove-isolation.mjs                   # before believing anything on screen
node capture.mjs                            # ONLY_VP=mobile to re-shoot one size
node teardown.mjs && node packages/db/scripts/pgbox.mjs down
```

## Two traps worth keeping

**`pgbox` defaults to port 54329 for every lane.** Two were already running on this machine, and the
collision surfaces as `could not create any TCP/IP sockets` rather than as anything about a port. Set
`SAHODA_PGBOX_PORT` explicitly.

**A frame larger than 3 KB is not a frame that worked.** The mobile Instagram and LinkedIn variants
came out byte-identical on the first run: on mobile the variants stack below the fold, so scrolling to
the top produced the same image whichever tab was selected. `capture.mjs` now hashes every frame and
says so. Size alone will not catch a capture that silently did nothing.
