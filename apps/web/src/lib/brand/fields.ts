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

export interface BrainField {
  /** Dotted path into `BrandMemoryPayload`, e.g. `hook.core_promise`. */
  path: string
  section: BrainSectionKey
  label: string
  kind: BrainFieldKind
  /** Shown when the field is still a guess — the one line the ring's hover asks. */
  question: string
  /** Fixed at exactly 3 by the payload contract; the editor may not add or remove. */
  fixedLength?: boolean
}

export type BrainSectionKey =
  | 'hook'
  | 'customer_persona'
  | 'voice'
  | 'taboo'
  | 'brand_persona'
  | 'alignment'

export interface BrainSection {
  key: BrainSectionKey
  title: string
  blurb: string
}

/** Display order of the cards on /brain — independent of question priority. */
export const BRAIN_SECTIONS: readonly BrainSection[] = [
  {
    key: 'voice',
    title: 'Voice',
    blurb: 'How every caption sounds before it says anything.',
  },
  {
    key: 'brand_persona',
    title: 'Brand persona',
    blurb: 'Who the brand is when it speaks.',
  },
  {
    key: 'customer_persona',
    title: 'Customer persona',
    blurb: 'Who it is speaking to.',
  },
  {
    key: 'hook',
    title: 'Hook',
    blurb: 'The promise each post leans on.',
  },
  {
    key: 'taboo',
    title: 'Red lines',
    blurb: 'What Sahoda steers away from.',
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
    label: 'Core promise',
    kind: 'longtext',
    question: 'What does a customer get from you that they cannot get next door?',
  },
  {
    path: 'customer_persona.primary_pain_point',
    section: 'customer_persona',
    label: 'Pain point',
    kind: 'text',
    question: 'What problem sends someone looking for you in the first place?',
  },
  {
    path: 'voice.descriptor',
    section: 'voice',
    label: 'How it sounds',
    kind: 'longtext',
    question: 'How should you sound to someone reading you for the first time?',
  },
  {
    path: 'taboo.red_lines',
    section: 'taboo',
    label: 'Red lines',
    kind: 'list',
    question: 'What must Sahoda never say on your behalf?',
  },
  {
    path: 'brand_persona.archetype',
    section: 'brand_persona',
    label: 'Archetype',
    kind: 'text',
    question: 'If your brand were a person, what kind of person would it be?',
  },
  {
    path: 'customer_persona.one_liner',
    section: 'customer_persona',
    label: 'Who this is for',
    kind: 'longtext',
    question: 'Who is your best customer, in one sentence?',
  },
  {
    path: 'voice.banned_phrases',
    section: 'voice',
    label: 'Never say',
    kind: 'list',
    question: 'Which words or phrases should never appear in your posts?',
  },
  {
    path: 'hook.primary_emotion',
    section: 'hook',
    label: 'Primary emotion',
    kind: 'text',
    question: 'What should someone feel after reading one of your posts?',
  },
  {
    path: 'brand_persona.one_liner',
    section: 'brand_persona',
    label: 'As a person',
    kind: 'longtext',
    question: 'How would you describe your brand to a friend in one line?',
  },
  {
    path: 'customer_persona.primary_fear',
    section: 'customer_persona',
    label: 'Fear',
    kind: 'text',
    question: 'What is your customer afraid of getting wrong?',
  },
  {
    path: 'customer_persona.desired_identity',
    section: 'customer_persona',
    label: 'Wants to become',
    kind: 'text',
    question: 'Who does your customer want to be seen as?',
  },
  {
    path: 'voice.signature_phrases',
    section: 'voice',
    label: 'Signature phrases',
    kind: 'list',
    fixedLength: true,
    question: 'Which three phrases sound unmistakably like you?',
  },
  {
    path: 'brand_persona.core_values',
    section: 'brand_persona',
    label: 'Core values',
    kind: 'list',
    fixedLength: true,
    question: 'Which three values would you refuse to trade away?',
  },
  {
    path: 'hook.sample_hooks',
    section: 'hook',
    label: 'Sample hooks',
    kind: 'list',
    fixedLength: true,
    question: 'Do these three openers sound like something you would post?',
  },
  {
    path: 'voice.formality_label',
    section: 'voice',
    label: 'Register',
    kind: 'text',
    question: 'How formal should you be — a shopkeeper, or a consultant?',
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
    label: 'Signal lock',
    derivedFrom: ['Voice', 'Brand persona', 'Customer persona', 'Hook', 'Red lines'],
  },
] as const

/** Fields counted by the ring — every editable leaf, derived ones excluded. */
export const RING_DENOMINATOR = BRAIN_FIELDS.length

export function fieldsInSection(section: BrainSectionKey): readonly BrainField[] {
  return BRAIN_FIELDS.filter((field) => field.section === section)
}
