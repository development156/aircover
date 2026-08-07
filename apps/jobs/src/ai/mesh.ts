import { createMesh, type Mesh } from '@sahoda/mesh'

let cached: Mesh | undefined

/**
 * The process-wide Model Mesh, constructed once from env (provider keys + the
 * Supabase service key). Server-only — jobs run on the server; never import this
 * from client code. Provider/telemetry/brand calls all flow through this instance.
 */
export function getMesh(): Mesh {
  return (cached ??= createMesh())
}
