---
name: sahoda-mesh
description: Use when adding or modifying an AI task, prompt, model route, or provider call in packages/mesh (the Model Mesh).
---

Adding a task: 1) row in ai_model_routes {task, tier: nano|economy|standard|premium|research} 2) zod OUTPUT schema in shared — all model output is parsed, one repair retry, then typed error (no silent mocks in prod) 3) prompt = static system contract + cache-controlled Brand-Brain prefix (cache key = brain version hash) + user payload last 4) log every call to ai_provider_logs {task,tier,provider,model,tokens,cached,cost_usd,latency,credits,workspace_id} 5) set max_tokens deliberately.
Tier guide: guardrails/classifiers=nano · captions/variants/replies=economy · plans/site-edits/brand_guidelines=standard · site generation=premium (budgeted) · onboarding research=research. Fallback: OpenRouter → direct SDK → typed error. Never call a provider from apps/web — server actions only.
