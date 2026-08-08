# packages/mesh

Tasks table + tiers per the **sahoda-mesh** skill. Every model call logs an `ai_provider_logs`
row. `max_tokens` explicit on every task. No provider calls anywhere outside this package.

- Implements `runTask`/`MeshTaskDef` from `@sahoda/shared`; outputs are zod-parsed with exactly
  one repair retry.
- Brand Brain context block is the cache-controlled prefix (refreshed on Brain version bump).
- `brand_guidelines` alone has the demo-fallback payload (served on double JSON failure, flagged
  `fallback: true`, persisted with `source='system'`). No mock-success anywhere else.
