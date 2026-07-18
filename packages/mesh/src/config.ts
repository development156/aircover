import type { ModelTier } from '@sahoda/shared'

/**
 * Server-only guard. The Mesh reads provider keys and the Supabase service-role
 * key — none of which may ever reach a browser bundle. Importing this module in a
 * client context throws immediately rather than shipping a secret.
 */
export function assertServerOnly(): void {
  if ('window' in globalThis) {
    throw new Error('@sahoda/mesh is server-only and must not be imported in the browser')
  }
}

/** OpenRouter keys are cost-isolated by workload class (TSD §4). */
export type KeyClass = 'research' | 'text' | 'image'

/** Fully-resolved Mesh configuration. Never logged. */
export interface MeshConfig {
  openRouterKeys: Record<KeyClass, string>
  openaiKey: string
  supabaseUrl: string
  supabaseServiceKey: string
}

interface EnvVar {
  name: string
  read: (cfg: Partial<MeshConfig>, value: string) => void
}

const ENV_VARS: readonly EnvVar[] = [
  {
    name: 'OPENROUTER_API_KEY_RESEARCH',
    read: (c, v) => ((c.openRouterKeys ??= {} as Record<KeyClass, string>).research = v),
  },
  {
    name: 'OPENROUTER_API_KEY_TEXT',
    read: (c, v) => ((c.openRouterKeys ??= {} as Record<KeyClass, string>).text = v),
  },
  {
    name: 'OPENROUTER_API_KEY_IMAGE',
    read: (c, v) => ((c.openRouterKeys ??= {} as Record<KeyClass, string>).image = v),
  },
  { name: 'OPENAI_API_KEY', read: (c, v) => (c.openaiKey = v) },
  { name: 'NEXT_PUBLIC_SUPABASE_URL', read: (c, v) => (c.supabaseUrl = toOrigin(v)) },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', read: (c, v) => (c.supabaseServiceKey = v) },
] as const

/**
 * Reduce a Supabase URL to its origin so PostgREST paths (`${url}/rest/v1/...`)
 * never double up. A pasted dashboard value sometimes carries `/rest/v1/`, which
 * would otherwise 404 every telemetry write and brand-context fetch (PGRST125).
 */
function toOrigin(value: string): string {
  try {
    return new URL(value).origin
  } catch {
    return value
  }
}

/**
 * Read + validate the Mesh environment. Fails fast, naming every missing variable
 * at once — and NEVER echoes a secret value, only variable names.
 */
export function loadMeshConfig(env: Record<string, string | undefined> = process.env): MeshConfig {
  const cfg: Partial<MeshConfig> = {}
  const missing: string[] = []

  for (const { name, read } of ENV_VARS) {
    const value = env[name]?.trim()
    if (!value) {
      missing.push(name)
      continue
    }
    read(cfg, value)
  }

  if (missing.length > 0) {
    throw new Error(`@sahoda/mesh: missing required env var(s): ${missing.join(', ')}`)
  }

  return cfg as MeshConfig
}

/**
 * Which cost-isolated OpenRouter key a tier draws from. Alpha text tasks
 * (nano→premium) share the TEXT budget; onboarding research uses RESEARCH. IMAGE
 * is reserved for backlog image generation — no Alpha tier routes to it yet.
 */
export function keyClassForTier(tier: ModelTier): KeyClass {
  return tier === 'research' ? 'research' : 'text'
}
