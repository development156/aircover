/**
 * SEARCH TERMS IN A CAPTION, AND THE THREE THINGS THIS IS NOT.
 *
 * ── WHAT THIS PRODUCT CAN AND CANNOT HONESTLY DO ─────────────────────────────
 * `docs/50` established, and nothing since has changed it: Sahoda has no
 * keyword-volume source, no trend feed and no competitor data. There is no
 * table anywhere in this codebase that could answer "how many people search for
 * this", and inventing one is not on the table. So this file is emphatically
 * NOT keyword RESEARCH, and the copy that ships beside it must never imply it
 * is. Naming a monthly search volume nobody measured is the same defect as
 * printing a figure no query produced, on the one surface that goes out in
 * public under a customer's name.
 *
 * What it IS: keyword PLACEMENT. Given a caption the writer already wrote about
 * a business the Brand Brain already knows, put the words a customer would
 * actually type where a search index will read them. That is real work, it is
 * most of what caption SEO consists of in practice, and every word of it comes
 * from the author's own post rather than from a source we do not have.
 *
 * ── THE THREE FACTS THAT MAKE THIS WORTH DOING ───────────────────────────────
 * 1 · A Google Business Profile post IS indexed by Google. `CONSTRAINTS.gbp`
 *     already carries `maxHashtags: 0` and the composer says outright that
 *     "hashtags do nothing on a Google Business post" — so for that channel the
 *     ONLY discovery lever is the words in the body. This is the channel where
 *     the difference is largest and the risk is zero.
 * 2 · Instagram and LinkedIn index caption TEXT in their own search, not only
 *     hashtags. A caption that never names the thing it is about is invisible
 *     to both, however many hashtags trail it.
 * 3 · Front-loading matters, because every one of these surfaces truncates.
 *     A search term after the fold is a search term inside a "… more".
 *
 * ── AND THE RULE THAT OUTRANKS ALL OF IT ─────────────────────────────────────
 * It may not invent. "Best bakery in Pune" is a claim about a real business,
 * and a model that adds it because it reads well has put a sentence nobody said
 * in front of that business's customers, under their name, on their account.
 * Optimising is rearranging and choosing among the author's OWN words. The
 * moment it adds a service, a place, a superlative or a number the author did
 * not write, it has stopped optimising and started fabricating.
 *
 * That clause is asserted directly by `seo-rules.test.ts`, so softening it is
 * visible in a diff rather than only in a caption six weeks from now.
 */
export const SEO_RULES =
  'SEARCH TERMS. Work the words a customer would actually type into the caption, ' +
  'taken from what the author already wrote and from the brand context. ' +
  'Put the most important one in the first sentence, before any platform truncates it. ' +
  'Prefer the plain words a customer uses over industry or internal jargon. ' +
  'Name the thing, the place and the occasion when the author has already named them. ' +
  'NEVER invent a service, a location, a superlative, a price or a claim the author did not write: ' +
  'choosing among their own words is optimising, adding new ones is making things up about a real business.'

/**
 * The extra sentence for a channel whose ONLY discovery lever is the body text.
 *
 * Kept separate from `SEO_RULES` rather than folded in, because it is a claim
 * about ONE channel and a rule that said it everywhere would be wrong on three
 * of four. `CONSTRAINTS.gbp.maxHashtags` is 0, which is the same fact stated in
 * the Constraint Engine — this is that fact turned into an instruction.
 */
export const SEARCH_SURFACE_RULE =
  'A Google Business Profile post is indexed by Google search and takes no hashtags at all, ' +
  'so for that channel the words in the body are the only thing a customer can find it by. ' +
  'Name the service and the neighbourhood there if the author has named them.'

/**
 * WHAT THIS FILE CANNOT SEE.
 *
 * It is a prompt. It changes what the model is ASKED for and proves nothing
 * about what comes back: no test here can assert that a returned caption
 * actually front-loads a search term, or that it did not quietly add a claim.
 * The output schema does not model keywords at all, so there is no field to
 * check and no post-hoc validator that could tell an author's own word from an
 * invented one without the original beside it.
 *
 * The guards that exist are on the PROMPT: that every caption task carries these
 * rules, and that the do-not-invent clause is present and unsoftened. Anything
 * about the model's actual behaviour needs eyes on real output, and `docs/50`
 * says so rather than letting a green suite imply otherwise.
 */
