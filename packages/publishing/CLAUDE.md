# packages/publishing

The Constraint Engine is the single source for per-platform limits and formatting — consumed by
the editor (validation) AND the adapters (payload formatting). Adapter recipe = the
**sahoda-adapter** skill; one platform per file. Fixtures in `./fixtures`.

- Every adapter satisfies one `PublishAdapter` interface (`@sahoda/shared`); `publish()` throws
  a classified `AdapterError` (transient → retry, permanent → reconnect CTA).
- OAuth tokens are AES-256-GCM vault-encrypted; decrypt only in job/server memory, never log or
  return them. `EncryptedToken` never leaves this package.
- Fixture adapter returns `mode:'fixture'` + `fixture://` permalink — surfaced as "simulated",
  never as real success (honesty rule). Used only behind the fixture-mode flag.
