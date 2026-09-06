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
export type { MeshResult, MeshTaskSpec, Attempt, RepairEvent } from './engine'

// Wired Alpha tasks — pass `.def` to runTask.
export { brandGuidelinesTask } from './tasks/brand-guidelines'
export { brandExtractTask, BrandExtractInputSchema } from './tasks/brand-extract'
export type { BrandExtractInput } from './tasks/brand-extract'
export { captionRewriteTask } from './tasks/caption-rewrite'
// The refusal gate's classifier (doc 18 §8, layer 3). Never charged — it is a
// condition of publishing, not a user-invoked action.
export { gateClassifyTask } from './tasks/gate-classify'
export { contentVariantsTask, ContentVariantsInputSchema } from './tasks/content-variants'
export type { ContentVariantsInput } from './tasks/content-variants'
export { planWeekTask, PlanWeekInputSchema } from './tasks/plan-week'
export type { PlanWeekInput } from './tasks/plan-week'
export { siteGenerateTask, SiteGenerateInputSchema } from './tasks/site-generate'
export type { SiteGenerateInput } from './tasks/site-generate'
// Studio prompt refine. Not in MeshTaskName (packages/shared is frozen for this
// task) — see the file header for why its I/O contract lives here instead.
export {
  promptRefineTask,
  PromptRefineInputSchema,
  PromptRefineOutputSchema,
  stripSettingsLanguage,
  NO_INVENTION_RULE,
  NO_SETTINGS_RULE,
} from './tasks/prompt-refine'
export type { PromptRefineInput, PromptRefineOutput } from './tasks/prompt-refine'
// Studio brand starters. Free (folded into a Brand Brain resolve's own cost),
// written once per brand version by the resolve write path, never charged and
// never called from a read. See the task's own file header.
export {
  brandStartersTask,
  BrandStartersInputSchema,
  BrandStartersOutputSchema,
  NO_INVENTION_RULE as BRAND_STARTERS_NO_INVENTION_RULE,
  SERVICE_BUSINESS_RULE,
} from './tasks/brand-starters'
export type { BrandStartersInput, BrandStartersOutput } from './tasks/brand-starters'

// Brand grounding (server-only) — the cache-controlled Brand Brain prefix.
export { createPostgrestBrandContext, buildBrandMessage } from './brand-context'
export {
  createPostgrestKnowledgeContext,
  buildKnowledgeMessage,
  buildKnowledgeQuery,
  KnowledgeContextError,
  KNOWLEDGE_PASSAGE_LIMIT,
  MAX_QUERY_TERMS,
} from './knowledge-context'
export type { KnowledgeContextProvider } from './knowledge-context'
export type { MarketContextProvider, ObservationLine } from './market-context'
export {
  buildMarketMessage,
  createPostgrestMarketContext,
  MarketContextError,
  MARKET_OBSERVATION_LIMIT,
} from './market-context'
export type { BrandContext, BrandContextProvider } from './brand-context'

// Routing tables (typed Alpha stand-in for ai_model_routes).
export {
  ALLOWED_IMAGE_MODELS,
  TASK_TIER,
  TIER_ROUTES,
  isAllowedImageModel,
  routeForTier,
} from './routing'
export type { TierRoute } from './routing'

// Server-only guard for callers that want to assert context explicitly.
export { assertServerOnly } from './config'
