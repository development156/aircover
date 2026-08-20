/**
 * Which generated section kinds are allowed to reach a customer's site, and which are a
 * claim the generator has no standing to make.
 *
 * ## The rule
 *
 * Every other section kind is a claim the business makes ABOUT ITSELF. A headline, an
 * offer, an FAQ answer, an address — the founder is the author, the model is a drafting
 * assistant, and a founder reading a draft they dislike simply rewrites it.
 *
 * A testimonial is not that. It is a claim about what a NAMED THIRD PARTY said, published
 * under a real business's name. `site_generate`'s only grounding instruction is "ground
 * every line in the brand and the goal" — and a brand has a voice, not customers. Asked
 * for a testimonials section, a model writes five-star quotes and attributes them to
 * people who do not exist. docs/22 finding F3.
 *
 * That is a fabricated record, not a rough draft. It is the one class of output where the
 * founder cannot fix it by editing, because the defect is not the wording: there is no
 * such customer. It is also the only defect in the backlog that produces a legal problem
 * rather than a support ticket, since the business — not Sahoda — is the publisher.
 *
 * ## Why the refusal lives here and not in the prompt
 *
 * The prompt no longer offers `testimonials` among the permitted kinds
 * (`packages/mesh/src/tasks/site-generate.ts`). That is a saving, not a guard: it stops us
 * paying premium-tier tokens for a section that would be thrown away. A model that emits
 * one anyway still parses, because `SectionKind` is a frozen enum in `@sahoda/shared` and
 * `testimonials` is a member of it — so the prompt cannot be the thing that holds.
 *
 * This module is the thing that holds. It sits on the one path model output takes into the
 * database, it is deterministic, and it is proven by test against output that DOES carry
 * fabricated quotes.
 *
 * ## What would re-admit the kind
 *
 * A real source of quotes: a store of testimonials a human entered or a platform review
 * this workspace actually received, with the attribution coming from that row rather than
 * from a model. No such store exists today — there is no table for it — so the honest set
 * of model-authored testimonials a workspace can prove is empty, and the refusal is total.
 *
 * When that store lands, the change is to admit the kind from THAT source, not to loosen
 * this one: this set governs what the GENERATOR may author. `renderTestimonials` is
 * deliberately untouched and still renders the kind, so a section built from real rows —
 * or one already stored before this rule existed — displays exactly as it always did.
 */
import type { SectionKind } from '@sahoda/shared'

/**
 * Section kinds a generation may not author, because their content is a claim about a
 * person the generator cannot source.
 *
 * A Set, not an array, so the check is a membership test rather than a scan, and so adding
 * a second kind later cannot accidentally depend on order.
 */
export const UNATTESTABLE_KINDS: ReadonlySet<SectionKind> = new Set<SectionKind>(['testimonials'])

/**
 * True when a generated section of this kind must be refused.
 *
 * Takes the raw `kind` as `unknown`-adjacent `SectionKind` for the same reason
 * `normalizeSections` runs `labelToken` over it: the value is typed as the union but
 * arrives from model output, so an out-of-union string can reach here. `Set.has` answers
 * `false` for those, which is correct — an unrecognised kind is refused a step later by
 * `normalizeSection` returning null, and reporting it as a fabrication would be the wrong
 * reason for the right outcome.
 */
export const isUnattestable = (kind: SectionKind): boolean => UNATTESTABLE_KINDS.has(kind)

/**
 * Stands in for a section refused because the generator cannot source its claims.
 *
 * A label of its own, distinct from `dropped-section:`, because the two say different
 * things: `dropped-section:` means the normalizer found nothing renderable, which is a
 * quality problem, and this means we declined to publish invented quotes, which is not.
 * Collapsing them would file the refusal as a generation failure and make it invisible to
 * anyone auditing what the product refuses to do.
 */
export const fabricatedSection = (path: string, index: number, kind: string): string =>
  `refused-fabricated:${path}[${index}]:${kind}`
