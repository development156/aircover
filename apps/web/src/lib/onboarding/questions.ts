import type { BusinessModel, Locale, Regime } from './intake'

/**
 * The catalogue for screen 3. Data only — `question.ts` owns the lookup.
 *
 * ── The rule every entry obeys ───────────────────────────────────────────────
 *
 * NEVER ASK FOR A POLICY. Not "what are your brand guidelines", not "what tone
 * should we avoid", not "what are your values". Asked that, people write down
 * what they think a brand is supposed to say, and the answer is worth nothing:
 * it is a performance of having a policy.
 *
 * So each entry puts one named counterparty in one specific moment and asks
 * what the owner REFUSES right there. "A regular asks you to call it homemade"
 * gets a true answer, because the person answering can see the moment. The rule
 * we derive is then a rule they have actually held, not one they drafted.
 *
 * A `{small}` / `{large}` token is filled with a sum in the user's own currency.
 * Everything else is fixed text — the counterparty must stay concrete.
 *
 * `question.test.ts` enforces both halves of this: that the three combinations
 * the flow is specified around each have their own entry, and that no entry
 * anywhere contains policy language.
 */

export interface QuestionCopy {
  /** Who is in front of them. Concrete, singular, recognisable. */
  counterparty: string
  /** The moment, in their world. Two sentences at most. */
  moment: string
  /** The ask. Always about refusing something, always about THIS moment. */
  ask: string
  /** A real-sounding answer, shown as placeholder text — never pre-filled. */
  placeholder: string
}

/** Sums in the user's currency, so the moment reads local. */
export const LOCALE_SUMS: Record<Locale, { small: string; large: string }> = {
  IN: { small: '2,000', large: '40,000' },
  US: { small: '50', large: '900' },
  GB: { small: '40', large: '800' },
  AE: { small: '200', large: '3,500' },
  SG: { small: '70', large: '1,200' },
  other: { small: '2,000', large: '40,000' },
}

export const LOCALE_CURRENCY: Record<Locale, string> = {
  IN: 'Rs ',
  US: '$',
  GB: 'GBP ',
  AE: 'AED ',
  SG: 'S$',
  other: 'Rs ',
}

/** Key format is `${model}x${regime}` — see `questionKey()`. */
export const QUESTIONS: Readonly<Record<string, QuestionCopy>> = Object.freeze({
  // ── the three the spec names ───────────────────────────────────────────────
  local_presencexfood: {
    counterparty: 'A regular who comes in every Saturday',
    moment:
      'She points at the new cake board and asks you to write "homemade" on it. It is made in your kitchen by your baker, from a base you buy in.',
    ask: 'What do you refuse to call it?',
    placeholder: 'We will not say homemade when we did not make the base.',
  },
  servicexconsumer: {
    counterparty: 'A client three weeks into a retainer',
    moment:
      'They forward a competitor\'s ad and say "just do this one, it is working for them." It would take you an afternoon and they are paying.',
    ask: 'What do you refuse to do, even though they are paying?',
    placeholder: "We will not run another brand's campaign line for line.",
  },
  institutionxhealthcare: {
    counterparty: 'A family in the third-floor waiting room',
    moment:
      'They want their father\'s recovery on your Instagram — "it will give other people hope." He is asleep down the corridor and nobody has asked him.',
    ask: 'What do you refuse to post?',
    placeholder: "We do not post a patient's story on their family's consent.",
  },

  // ── local presence ────────────────────────────────────────────────────────
  local_presencexbeauty: {
    counterparty: 'A bride-to-be at the front desk',
    moment:
      'She asks you to promise her skin will be clear for the wedding in three weeks, and offers to pay for the whole package today.',
    ask: 'What do you refuse to promise her?',
    placeholder: 'We will not promise clear skin by a date.',
  },
  local_presencexhealthcare: {
    counterparty: 'A patient who found you on Google',
    moment:
      'He asks you to put "{currency}{large}, guaranteed results" on your clinic listing, because the clinic down the road does.',
    ask: 'What do you refuse to put on the listing?',
    placeholder: 'We do not guarantee an outcome for any treatment.',
  },
  local_presencexconsumer: {
    counterparty: 'A customer at the counter on a Sunday',
    moment:
      'He asks whether the sale price is really a discount. It is the price you have charged all year with a "was" number added above it.',
    ask: 'What do you refuse to print on the tag?',
    placeholder: 'We will not show a "was" price we never charged.',
  },
  local_presencexeducation: {
    counterparty: 'A parent at the enquiry desk',
    moment:
      'She asks you to confirm her son will clear the entrance exam if he joins the {currency}{large} batch. Two of your students cleared it last year.',
    ask: 'What do you refuse to tell her?',
    placeholder: 'We do not tell a parent their child will clear an exam.',
  },

  // ── service ───────────────────────────────────────────────────────────────
  servicexfinance: {
    counterparty: 'A first-time investor on a call',
    moment:
      'She asks what her {currency}{large} will be worth in a year, and says the last advisor gave her a number.',
    ask: 'What do you refuse to give her?',
    placeholder: 'We do not give a number for a future return.',
  },
  servicexhealthcare: {
    counterparty: 'A clinic owner who hired you last month',
    moment:
      'He sends you five patient before-and-after photos for the campaign and says the front desk "will sort out the consent forms later".',
    ask: 'What do you refuse to publish?',
    placeholder: 'Nothing goes out before written consent is in hand.',
  },
  servicexeducation: {
    counterparty: 'A coaching centre paying you monthly',
    moment:
      'They ask for a campaign built on a 98% placement figure. When you ask, it counts only the students who sat the final test.',
    ask: 'What do you refuse to put in the ad?',
    placeholder: 'We do not run a number whose denominator we cannot show.',
  },

  // ── institution ───────────────────────────────────────────────────────────
  institutionxeducation: {
    counterparty: 'A journalist with a deadline at six',
    moment:
      'She asks why your placement figures rose this year. The honest answer includes a change in how you count them.',
    ask: 'What do you refuse to leave out?',
    placeholder: 'We do not quote a figure without saying how it is counted.',
  },
  institutionxfinance: {
    counterparty: 'A depositor in the branch on a Tuesday morning',
    moment:
      'He asks whether the new scheme is safe. Your marketing team has sent through a post calling it "risk-free".',
    ask: 'What do you refuse to call it?',
    placeholder: 'We never describe a product as risk-free.',
  },

  // ── product ───────────────────────────────────────────────────────────────
  productxfood: {
    counterparty: 'A reseller who moves your whole stock',
    moment:
      'He wants "chemical-free" on the front of the pack because it sells. Your preservative is on the back of it.',
    ask: 'What do you refuse to print on the pack?',
    placeholder: 'We do not say chemical-free on a product with preservatives.',
  },
  productxbeauty: {
    counterparty: 'A creator with 90,000 followers',
    moment:
      'She will post about the serum for {currency}{small} and asks you to write the caption. The draft she likes says it removes scars in a week.',
    ask: 'What do you refuse to let her say?',
    placeholder: 'We do not claim a timeline for a cosmetic result.',
  },
  productxconsumer: {
    counterparty: 'A customer who left a two-star review',
    moment:
      'Your team wants to reply publicly with what her order history shows. She has not mentioned it.',
    ask: 'What do you refuse to put in the reply?',
    placeholder: "We never bring a customer's account details into a public reply.",
  },

  // ── platform ──────────────────────────────────────────────────────────────
  platformxconsumer: {
    counterparty: 'A seller who has been on the platform two years',
    moment:
      'He asks you to leave his one-star reviews off the category page for a week while he "sorts it out". He is in your top ten by volume.',
    ask: 'What do you refuse to hide?',
    placeholder: 'We do not hide genuine reviews for anyone.',
  },
  platformxfinance: {
    counterparty: 'A user who has just been declined',
    moment:
      "She asks why. The model that declined her is a vendor's, and nobody on your side can read it.",
    ask: 'What do you refuse to tell her?',
    placeholder: 'We do not invent a reason we cannot stand behind.',
  },
})

/**
 * Per-model fallbacks. Reached when a model x regime pair has no entry — still
 * a concrete moment, just one that holds across sectors.
 */
export const MODEL_FALLBACKS: Readonly<Record<BusinessModel, QuestionCopy>> = Object.freeze({
  local_presence: {
    counterparty: 'A customer standing at your counter',
    moment:
      'She asks you to confirm something about what you sell that is very nearly true, and would close the sale today.',
    ask: 'What do you refuse to confirm?',
    placeholder: 'We do not say it is ours if we did not make it.',
  },
  service: {
    counterparty: 'Your largest client, on a Friday evening',
    moment:
      'They ask for something that would work, that they are paying for, and that you would not want your name on.',
    ask: 'What do you refuse to do for them?',
    placeholder: 'We do not put our name on work we would not sign.',
  },
  institution: {
    counterparty: 'Someone who trusts you because of what you are',
    moment:
      'They ask a question where the complete answer is worse for you than the partial one, and nobody would know the difference.',
    ask: 'What do you refuse to leave out?',
    placeholder: 'We do not let a number stand without saying how it is counted.',
  },
  product: {
    counterparty: 'A buyer holding your product in their hand',
    moment:
      'They repeat back a claim from your packaging that is stronger than what it actually does.',
    ask: 'What do you refuse to let them believe?',
    placeholder: 'We do not let a claim on the front outrun the label on the back.',
  },
  platform: {
    counterparty: 'A user on one side of your marketplace',
    moment:
      'They ask you to do something that would help them and quietly cost the people on the other side.',
    ask: 'What do you refuse to do?',
    placeholder: 'We do not tilt the listing for whoever pays us most.',
  },
})
