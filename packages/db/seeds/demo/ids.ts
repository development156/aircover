import { createHash } from 'node:crypto'

/**
 * Fixed namespace for every id this seed mints. Generated once and frozen here on
 * purpose: changing it orphans a previously-seeded demo workspace (the destroy
 * command would no longer resolve its id), so it must never be regenerated.
 */
const DEMO_NAMESPACE = 'bcb26207-1ba2-487a-8a0b-37f3a63b368e'

/**
 * RFC 4122 §4.3 name-based UUIDv5. Node ships no uuidv5, and the seed needs one:
 * every row id is derived from a stable label, which is what makes the seed
 * idempotent (`on conflict (id) do update`) and the teardown targeted (it deletes a
 * computed id, never a pattern match).
 */
export function uuidv5(name: string, namespace: string = DEMO_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  if (ns.length !== 16) throw new Error(`namespace is not a UUID: ${namespace}`)

  const digest = createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest()
  const bytes = Buffer.from(digest.subarray(0, 16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x50 // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // RFC 4122 variant

  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

/**
 * Build the id minter for one seed run. Every label is prefixed with the run's
 * namespace, so a `--namespace` override (used by the test suite) yields a wholly
 * disjoint id space and cannot collide with — or delete — the real demo workspace.
 */
export function idFactory(namespace: string): (label: string) => string {
  return (label: string) => uuidv5(`${namespace}:${label}`)
}
