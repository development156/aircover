/**
 * The Brand Brain field registry — one entry per leaf of `BrandMemoryPayload`.
 *
 * This is the single source for /brain's layout, the ring's denominator, and the
 * "most valuable unanswered question". Keeping them in one list is deliberate:
 * a field that appears on the page but not in the denominator would make the
 * ring quietly unreachable, and a field in the denominator with no editor would
 * make it permanently so.
 *
 * ORDER IS PRIORITY. The list runs from the field that most shapes what Sahoda
 * writes to the one that shapes it least, and `nextUnconfirmed` simply takes the
 * first unconfirmed entry. Reordering this array reorders the question.
 */
export type BrainFieldKind = 'text' | 'longtext' | 'list'

/**
 * The provenance kind stamped onto this field's `FieldMeta` (packages/shared,
 * brand/audiences.ts). NOT the same axis as `kind` above, which picks an editor.
 *
 * Only `asked` and `negotiated` appear here, and that is a statement about v1
 * rather than a shortening of the taxonomy: `mandated` needs a regime pack that
 * nothing selects yet, and the one genuinely DERIVED field in v1 —
 * `alignment.signal_lock` — is not in this list at all. It lives in
 * `DERIVED_FIELDS`, outside the ring, precisely because a conclusion is not
 * something a person can confirm.
 *
 * KNOWN DIVERGENCE, deliberately not resolved here. wt-brain's v2 taxonomy
 * classes `brand_persona.*` and `hook.primary_emotion` / `hook.sample_hooks` as
 * `derived` — unconfirmable by definition — while this page offers an editor for
 * all five and counts them in the ring. Honouring v2 would drop the denominator
 * from 15 to 10 and remove three cards from /brain, which is a product decision
 * and not a merge decision. Reported rather than taken.
 */
export type BrainFieldMetaKind = 'asked' | 'negotiated'

export interface BrainField {
  /** Dotted path into `BrandMemoryPayload`, e.g. `hook.core_promise`. */
  path: string
  section: BrainSectionKey
  label: string
  kind: BrainFieldKind
  /** Provenance kind written into `FieldMeta.kind` when this field is stamped. */
  metaKind: BrainFieldMetaKind
  /** Shown when the field is still a guess — the one line the ring's hover asks. */
  question: string
  /** Fixed at exactly 3 by the payload contract; the editor may not add or remove. */
  fixedLength?: boolean
}

export type BrainSectionKey =
  'hook' | 'customer_persona' | 'voice' | 'taboo' | 'brand_persona' | 'alignment'

export interface BrainSection {
  key: BrainSectionKey
  title: string
  blurb: string
}

/** Display order of the cards on /brain — independent of question priority. */
export const BRAIN_SECTIONS: readonly BrainSection[] = [
  {
    key: 'voice',
    title: 'How you sound',
    blurb: 'How every caption sounds.',
  },
  {
    key: 'brand_persona',
    title: 'Your brand',
    blurb: 'Who your brand is.',
  },
  {
    key: 'customer_persona',
    title: 'Your customer',
    blurb: 'Who you are talking to.',
  },
  {
    key: 'hook',
    title: 'Your promise',
    blurb: 'What every post promises.',
  },
  {
    key: 'taboo',
    title: 'Never do this',
    blurb: 'What Sahoda must never say or do for you.',
  },
] as const

/**
 * Every EDITABLE leaf, in priority order. `alignment.*` is deliberately absent —
 * see `DERIVED_FIELDS`.
 */
export const BRAIN_FIELDS: readonly BrainField[] = [
  {
    path: 'hook.core_promise',
    section: 'hook',
    metaKind: 'asked',
    label: 'Your main promise',
    kind: 'longtext',
    question: 'What does a customer get from you that they cannot get anywhere else?',
  },
  {
    path: 'customer_persona.primary_pain_point',
    section: 'customer_persona',
    metaKind: 'asked',
    label: 'Their problem',
    kind: 'text',
    question: 'What problem makes someone come looking for you?',
  },
  {
    path: 'voice.descriptor',
    section: 'voice',
    metaKind: 'negotiated',
    label: 'How it sounds',
    kind: 'longtext',
    question: 'How should you sound to someone reading you for the first time?',
  },
  {
    path: 'taboo.red_lines',
    section: 'taboo',
    metaKind: 'asked',
    label: 'Never do this',
    kind: 'list',
    question: 'What must Sahoda never say for you?',
  },
  {
    path: 'brand_persona.archetype',
    section: 'brand_persona',
    metaKind: 'asked',
    label: 'Brand type',
    kind: 'text',
    question: 'If your brand were a person, what kind of person would it be?',
  },
  {
    path: 'customer_persona.one_liner',
    section: 'customer_persona',
    metaKind: 'asked',
    label: 'Who this is for',
    kind: 'longtext',
    question: 'Who is your best customer, in one sentence?',
  },
  {
    path: 'voice.banned_phrases',
    section: 'voice',
    metaKind: 'negotiated',
    label: 'Never say',
    kind: 'list',
    question: 'Which words should never appear in your posts?',
  },
  {
    path: 'hook.primary_emotion',
    section: 'hook',
    metaKind: 'asked',
    label: 'The feeling you give',
    kind: 'text',
    question: 'How should someone feel after reading one of your posts?',
  },
  {
    path: 'brand_persona.one_liner',
    section: 'brand_persona',
    metaKind: 'asked',
    label: 'If your brand were a person',
    kind: 'longtext',
    question: 'How would you describe your brand to a friend, in one line?',
  },
  {
    path: 'customer_persona.primary_fear',
    section: 'customer_persona',
    metaKind: 'asked',
    label: 'What they worry about',
    kind: 'text',
    question: 'What is your customer worried about?',
  },
  {
    path: 'customer_persona.desired_identity',
    section: 'customer_persona',
    metaKind: 'asked',
    label: 'How they want to be seen',
    kind: 'text',
    question: 'How does your customer want other people to see them?',
  },
  {
    path: 'voice.signature_phrases',
    section: 'voice',
    metaKind: 'negotiated',
    label: 'Phrases that sound like you',
    kind: 'list',
    fixedLength: true,
    question: 'Which three phrases sound most like you?',
  },
  {
    path: 'brand_persona.core_values',
    section: 'brand_persona',
    metaKind: 'asked',
    label: 'What you stand for',
    kind: 'list',
    fixedLength: true,
    question: 'Which three things matter most to your brand?',
  },
  {
    path: 'hook.sample_hooks',
    section: 'hook',
    metaKind: 'asked',
    label: 'Example first lines',
    kind: 'list',
    fixedLength: true,
    question: 'Do these three first lines sound like something you would post?',
  },
  {
    path: 'voice.formality_label',
    section: 'voice',
    metaKind: 'negotiated',
    label: 'How formal',
    kind: 'text',
    question: 'How formal should you sound: like a shop owner, or like a consultant?',
  },
] as const

/**
 * Fields Sahoda COMPUTES rather than asks for. They render with their evidence
 * instead of a confirmation state, and they sit outside the ring's denominator:
 * a user cannot confirm a conclusion, only the inputs it was drawn from, so
 * counting them would make the ring permanently unreachable.
 */
export interface DerivedField {
  path: string
  label: string
  /** Plain-English account of what this value was computed from. */
  derivedFrom: readonly string[]
}

export const DERIVED_FIELDS: readonly DerivedField[] = [
  {
    path: 'alignment.signal_lock',
    label: 'How sure Sahoda is',
    derivedFrom: ['Voice', 'Brand persona', 'Customer persona', 'Hook', 'Red lines'],
  },
] as const

/** Fields counted by the ring — every editable leaf, derived ones excluded. */
export const RING_DENOMINATOR = BRAIN_FIELDS.length

export function fieldsInSection(section: BrainSectionKey): readonly BrainField[] {
  return BRAIN_FIELDS.filter((field) => field.section === section)
}
