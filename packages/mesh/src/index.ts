// @sahoda/mesh — the Model Mesh. Provider clients (OpenRouter x3 keys + OpenAI
// fallback), the tier router, prompt/cache management, telemetry into
// ai_provider_logs, and the tasks (brand_guidelines, caption_rewrite,
// content_variants, plan_week, site_generate). Server-side only. Owned by wt-mesh.
//
// Implements the MeshTaskDef / runTask contract from @sahoda/shared. No model
// provider is called from anywhere but this package.
export const MESH_PACKAGE = '@sahoda/mesh' as const

// Composition root — the single entry point (call once, reuse the returned runTask).
export { createMesh } from './mesh'
export type { Mesh, CreateMeshOptions } from './mesh'

// Result shape (a superset of the frozen Result<O> & { usage? } — adds fallback:true).
export type { MeshResult, MeshTaskSpec, Attempt } from './engine'

// Wired Alpha tasks — pass `.def` to runTask.
export { brandGuidelinesTask } from './tasks/brand-guidelines'
export { captionRewriteTask } from './tasks/caption-rewrite'
export { contentVariantsTask, ContentVariantsInputSchema } from './tasks/content-variants'
export type { ContentVariantsInput } from './tasks/content-variants'

// Brand grounding (server-only) — the cache-controlled Brand Brain prefix.
export { createPostgrestBrandContext, buildBrandMessage } from './brand-context'
export type { BrandContext, BrandContextProvider } from './brand-context'

// Routing tables (typed Alpha stand-in for ai_model_routes).
export { TASK_TIER, TIER_ROUTES, routeForTier } from './routing'
export type { TierRoute } from './routing'

// Server-only guard for callers that want to assert context explicitly.
export { assertServerOnly } from './config'
