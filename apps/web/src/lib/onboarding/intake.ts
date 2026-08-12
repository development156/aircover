import { z } from 'zod'

/**
 * The three picks that shape the whole flow.
 *
 * These are LOCAL to the onboarding lane, not in `packages/shared`. The rule in
 * CLAUDE.md ("types/schemas import from packages/shared only") exists so nobody
 * redefines a contract that already exists — none of these do. They are new
 * vocabulary, shared owns none of it, and this lane may not edit shared. The
 * promotion is filed in `apps/web/REQUESTS.md` for wt-shared to lift verbatim.
 *
 * The distinction that matters and is easy to lose:
 *
 *   · MODEL  is how the business reaches a person — the SHAPE of the encounter.
 *   · REGIME is the rulebook over what it may claim — the LAW of the encounter.
 *   · LOCALE is the jurisdiction — WHOSE law, and which counterparty feels real.
 *
 * Model × regime picks the question. Locale colours the counterparty in it. A
 * bakery and a caterer are the same regime (food) and different models; a bakery
 * and a salon are the same model (local_presence) and different regimes.
 */

/** How the business reaches a person. */
export const BUSINESS_MODELS = [
  'local_presence',
  'service',
  'institution',
  'product',
  'platform',
] as const
export const BusinessModelSchema = z.enum(BUSINESS_MODELS)
export type BusinessModel = z.infer<typeof BusinessModelSchema>

/** The rulebook over what may be claimed. */
export const REGIMES = ['food', 'healthcare', 'finance', 'education', 'beauty', 'consumer'] as const
export const RegimeSchema = z.enum(REGIMES)
export type Regime = z.infer<typeof RegimeSchema>

/** Jurisdiction — whose regulator, and which counterparty reads as real. */
export const LOCALES = ['IN', 'US', 'GB', 'AE', 'SG', 'other'] as const
export const LocaleSchema = z.enum(LOCALES)
export type Locale = z.infer<typeof LocaleSchema>

export const IntakeSchema = z.object({
  model: BusinessModelSchema,
  regime: RegimeSchema,
  locale: LocaleSchema,
})
export type Intake = z.infer<typeof IntakeSchema>

/**
 * `consumer` is the honest default regime: it is the floor every business sits
 * under, so landing here claims nothing extra. `general` is deliberately absent
 * — a regime named "general" would invite a question with no teeth.
 */
export const DEFAULT_INTAKE: Intake = { model: 'service', regime: 'consumer', locale: 'IN' }

/** Short label for a chip. Sentence case (UI_RULES: eyebrows only are uppercase). */
export const MODEL_LABEL: Record<BusinessModel, string> = {
  local_presence: 'A place people come to',
  service: 'Work done for a client',
  institution: 'An institution',
  product: 'A product people buy',
  platform: 'A platform connecting two sides',
}

/** The one-word noun used mid-sentence in the read-back. */
export const MODEL_NOUN: Record<BusinessModel, string> = {
  local_presence: 'local presence',
  service: 'service business',
  institution: 'institution',
  product: 'product business',
  platform: 'platform',
}

export const REGIME_LABEL: Record<Regime, string> = {
  food: 'Food and drink',
  healthcare: 'Health and care',
  finance: 'Money and finance',
  education: 'Teaching and training',
  beauty: 'Beauty and wellness',
  consumer: 'General consumer',
}

export const REGIME_NOUN: Record<Regime, string> = {
  food: 'food',
  healthcare: 'health and care',
  finance: 'money',
  education: 'teaching',
  beauty: 'beauty and wellness',
  consumer: 'everyday consumer goods and services',
}

export const LOCALE_LABEL: Record<Locale, string> = {
  IN: 'India',
  US: 'United States',
  GB: 'United Kingdom',
  AE: 'United Arab Emirates',
  SG: 'Singapore',
  other: 'Somewhere else',
}
