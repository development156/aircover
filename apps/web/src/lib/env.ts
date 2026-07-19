import 'server-only'

import { clerkKeyWarning } from '@/lib/clerk-key-guard'
import { parseEnv, type WebEnv } from '@/lib/env-schema'

// Parsed at FIRST ACCESS, not at import. `next build` loads every server
// module during "Collecting page data" — a module-scope parse turned all four
// vars into BUILD-time requirements and failed env-less Vercel builds before a
// single page rendered (the error prints right under the "checking validity of
// types" line, reading like a type failure). Laziness keeps fail-fast intact:
// the first request that touches `env` still throws, naming every missing var.
//
// NEXT_PUBLIC_* values are inlined into client bundles at build time — client
// code must reference the literal process.env.NEXT_PUBLIC_… form, never this
// module.
let cached: WebEnv | undefined

function loadEnv(): WebEnv {
  if (cached) return cached
  const parsed = parseEnv(process.env)

  // Boot diagnostics ride the first parse — once per process, not per request.
  //
  // Loud, non-fatal warning when the Clerk key's instance type mismatches the
  // runtime (e.g. a pk_live key on localhost — its FAPI 400s on non-prod origins).
  const clerkWarning = clerkKeyWarning({
    publishableKey: parsed.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    nodeEnv: process.env.NODE_ENV,
  })
  if (clerkWarning) console.warn(`[env] ${clerkWarning}`)

  // Surface (don't just silently fix) a NEXT_PUBLIC_SUPABASE_URL that carried a
  // path — the schema normalized it to the origin, but the .env should hold the
  // bare URL.
  try {
    const rawPath = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL as string).pathname
    if (rawPath && rawPath !== '/') {
      console.warn(
        `[env] NEXT_PUBLIC_SUPABASE_URL contained a path ("${rawPath}") — normalized to ` +
          `${parsed.NEXT_PUBLIC_SUPABASE_URL}. Set it to the bare project URL (no /rest/v1).`,
      )
    }
  } catch {
    // parseEnv already validated the URL; a throw here is not worth failing boot over.
  }

  cached = parsed
  return parsed
}

function readOnly(): never {
  throw new Error(
    '@sahoda/web: `env` is read-only — set values via process.env before first access',
  )
}

// Reads proxy to the lazily-parsed env so existing `env.X` call sites keep
// working unchanged; enumeration (spread/keys) also forces the parse.
//
// Every mutating trap throws: without them, a stray write would land on the
// Proxy's `{}` target as a phantom own-property and violate the engine's
// invariant on every LATER read of that key (a process-poisoning TypeError far
// from the cause), and Object.freeze would trip the ownKeys invariant. Failing
// loudly at the misuse site is the only safe shape for a mirror-target proxy.
export const env: WebEnv = new Proxy({} as WebEnv, {
  get: (_target, prop) => loadEnv()[prop as keyof WebEnv],
  has: (_target, prop) => prop in loadEnv(),
  ownKeys: () => Reflect.ownKeys(loadEnv()),
  getOwnPropertyDescriptor: (_target, prop) => Object.getOwnPropertyDescriptor(loadEnv(), prop),
  set: readOnly,
  defineProperty: readOnly,
  deleteProperty: readOnly,
  preventExtensions: readOnly,
  setPrototypeOf: readOnly,
})
