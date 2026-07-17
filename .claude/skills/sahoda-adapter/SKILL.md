---
name: sahoda-adapter
description: Use when writing or editing a social publishing adapter (X, GBP, LinkedIn, Meta, WhatsApp, etc.) or the Constraint Engine in packages/publishing.
---
One adapter per file implementing: `publish(payload) -> {platform_post_id, permalink}` and `fetchMetrics(connection, since)`. Format payloads ONLY via the Constraint Engine spec (char limits, media rules, link policy, credit surcharges) — the editor uses the same spec, one source of truth.
Errors: classify transient (retry, expo backoff ×3) vs permanent (revoked token, policy reject → status=failed + reconnect CTA). Tokens come from the vault helper decrypted in-memory only — never log, never return, never store plaintext. Every publish writes post_publish_logs. Add a fixture test per adapter (recorded response) before wiring UI. If a platform capability needs approval we don't have: feature-flag with an honest "pending" state — never mock success.
