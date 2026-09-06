/**
 * Which Brand Brain fields a setup answer seeds.
 *
 * `to-resolve-input.ts` is the authority on where each typed answer goes INTO
 * the model's input: the refusal becomes `taboo.avoid_topics`, the audience
 * sentence becomes `customer.description`, the positioning line becomes
 * `source.one_liner`. `brand_guidelines` then writes the whole payload in its
 * own words, so nothing here is the person's sentence verbatim — which is why
 * these fields are stamped `source: 'intake'` and never `confirmed`.
 *
 * MEASURED 2026-09-06 on the wt-core preview: the red line typed on screen 02
 * came back on /brain paraphrased, chipped "Guess", and listed under "Only you
 * know these", as if the person had never answered. The model's rewording is
 * real and the guess label was wrong; this is the third state between them.
 *
 * Conservative on purpose: one field per answer, only where the mapping is one
 * to one, and a blank answer seeds nothing. Age, location, role and interests
 * fold into the audience sentence and are covered by it.
 */
export interface IntakeAnswers {
  /** Screen 02: what Sahoda must never say. */
  neverSay: string
  /** Screen 03: the ideal customer. */
  audience: string
  /** Screen 02: what the business actually does. */
  what: string
}

export function intakeDerivedPaths(answers: IntakeAnswers): string[] {
  const paths: string[] = []
  if (answers.what.trim()) paths.push('brand_persona.one_liner')
  if (answers.audience.trim()) paths.push('customer_persona.one_liner')
  if (answers.neverSay.trim()) paths.push('taboo.red_lines')
  return paths
}
