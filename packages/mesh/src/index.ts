// @sahoda/mesh — the Model Mesh. Provider clients (OpenRouter x3 keys + OpenAI
// fallback), the tier router, prompt/cache management, telemetry into
// ai_provider_logs, and the tasks (brand_guidelines, caption_rewrite,
// content_variants, plan_week, site_generate). Server-side only. Owned by wt-mesh.
//
// Implements the MeshTaskDef / runTask contract from @sahoda/shared. No model
// provider is called from anywhere but this package.
export const MESH_PACKAGE = '@sahoda/mesh' as const
