/**
 * THE DASH RULE, APPLIED TO WHAT THE MODEL WRITES.
 *
 * ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────
 * The founder's 2026-08-23 ruling took the em dash and the en dash out of
 * user-facing PROSE, and 650 dashes were rewritten across 290 files to do it.
 * That sweep covered copy people wrote. It never reached copy the MODEL writes:
 * MEASURED, no prompt in `packages/mesh/src/tasks` said anything about a dash,
 * so every caption this product has ever generated was free to open with one.
 *
 * A customer does not care which half of the codebase produced the sentence. The
 * em dash is the tell either way, and the caption is the half that goes out in
 * public under their name.
 *
 * ── WHY THE HYPHEN IS UNTOUCHED, AND THIS IS NOT A DETAIL ────────────────────
 * `CLAUDE.md` is explicit, and it is a standing ruling rather than a preference:
 *
 *   "The HYPHEN STAYS. `per-channel`, `read-only`, `sign-in`, `coming-soon`.
 *    Removing hyphens breaks English and makes copy ambiguous."
 *
 * So a rule reading "never emit `-`" cannot be written. It would forbid
 * `same-day delivery`, `family-run`, `20-minute`, and `pre-order` — ordinary
 * English a bakery needs — and it would do it in the one place the product
 * cannot proofread, which is a caption already published. What is banned is the
 * DASH USED AS PUNCTUATION: `—` and `–`, plus the `--` a model reaches for when
 * it has been told not to use the glyph.
 *
 * This is the same line `.agents/skills/humanizer` §14 already draws for human
 * copy: "no em dashes (—) or en dashes (–)… treat this as a hard constraint",
 * while its compound-adjective section keeps attributive hyphens. One rule, now
 * pointed at both halves of the product.
 *
 * ── WHY A MODULE AND NOT A SENTENCE IN EACH PROMPT ───────────────────────────
 * Two prompts carrying their own wording is two prompts that drift, and a rule
 * nothing can test is a rule that quietly stops being true. `PROSE_RULES` is the
 * sentence; `findBannedDashes` is the same rule as a function, so a test can
 * assert the instruction is present AND that the detector agrees with it.
 */

/**
 * The instruction, appended to every task that writes copy a customer publishes.
 *
 * Phrased as a replacement rather than a prohibition. A model told only "do not
 * use X" tends to produce the same sentence with the dash deleted and nothing in
 * its place, which reads worse than the dash did. Naming the replacements is what
 * makes the output better rather than merely compliant.
 */
export const PROSE_RULES =
  'Never use an em dash (—), an en dash (–) or a double hyphen (--) as punctuation. ' +
  'Write a full stop, a comma, a colon or brackets instead, whichever the sentence needs. ' +
  'Ordinary hyphens inside words are correct and must be kept: same-day, family-run, 20-minute.'

/**
 * THE MODEL MUST NOT GIVE ITSELF AWAY.
 *
 * ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────
 * MEASURED: on some briefs the generated caption arrived wearing the model
 * rather than the business — a "Sure! Here's your post:" preamble, an "As an AI
 * I can't…" hedge, a sign-off, or a sentence explaining the choices it made. The
 * output of these tasks is published verbatim under the customer's own name, so
 * any of those is the tell, and there is no proofreading step between the model
 * and the platform.
 *
 * `content_variants`'s "no commentary" and `caption_rewrite`'s "no markdown, no
 * commentary" were too thin: "commentary" did not, to the model, cover a cheery
 * preamble or a refusal. This names the failures directly.
 *
 * ── PHRASED AS A REPLACEMENT WHERE IT CAN BE ─────────────────────────────────
 * "Never refuse" alone leaves a model that judged a brief thin with nowhere to
 * go, so it is paired with what to do instead: write the most plausible post in
 * the brand voice. A prohibition with no alternative is how an empty or hedged
 * caption gets returned as finished work.
 *
 * Obeys PROSE_RULES itself (no dash punctuation), asserted by its own test.
 */
export const VOICE_INTEGRITY =
  'Write only the words that get published, in the voice of the business. ' +
  'Never mention yourself, an assistant, an AI, a model, a prompt, or Sahoda, and never describe what you are doing. ' +
  'No preamble, no sign-off, no apology, no note explaining your choices, and no quotation marks wrapped around the whole post. ' +
  'Never refuse and never state what you cannot do: when a brief is thin, write the most plausible post in the brand voice. ' +
  'Whatever you return is published exactly as written.'

/**
 * Every banned dash in a piece of generated text, with where it sits.
 *
 * ── WHAT IT DELIBERATELY DOES NOT MATCH ──────────────────────────────────────
 * The hyphen-minus, on its own, between word characters or anywhere else. A
 * detector that flagged `family-run` would fail every honest caption about a
 * bakery, and the first person to hit that would delete the guard rather than the
 * hyphen.
 *
 * `--` IS matched, because two hyphens in a row is never a word; it is the
 * fallback a model reaches for when the glyph is refused.
 */
export function findBannedDashes(text: string): { index: number; found: string }[] {
  const hits: { index: number; found: string }[] = []
  for (const match of text.matchAll(/—|–|--+/g)) {
    hits.push({ index: match.index ?? 0, found: match[0] })
  }
  return hits
}

/** True when the text carries no dash used as punctuation. */
export function obeysProseRules(text: string): boolean {
  return findBannedDashes(text).length === 0
}
