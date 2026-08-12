import type { BusinessModel, Locale, Regime } from './intake'

/**
 * The classifier's evidence base. Data only — the matching logic lives in
 * `classify.ts`, so a term can be added or reweighted without touching code.
 *
 * Deliberately NOT a model call. Screen 1 must be instant, free, and identical
 * on every run: a user who types "bakery" and gets "local presence in food"
 * must get it again on a retry, and the product must never bill anyone for
 * working out who they are. Every classification is also read back for
 * correction, so a miss costs one tap — which is the ceiling a lexicon has to
 * clear, not the accuracy of a language model.
 *
 * Weights: 3 = the word names the thing outright ("restaurant" → local_presence).
 * 2 = strong signal. 1 = a hint that should only decide a tie.
 *
 * Multi-word terms are matched as phrases; single words match on word boundary,
 * so "bar" never fires inside "barber".
 */
export interface Term {
  readonly term: string
  readonly weight: number
}

const t = (weight: number, ...terms: string[]): Term[] => terms.map((term) => ({ term, weight }))

export const MODEL_TERMS: Record<BusinessModel, readonly Term[]> = {
  local_presence: [
    ...t(
      3,
      'restaurant',
      'cafe',
      'café',
      'bakery',
      'salon',
      'barber',
      // Listed alongside "barber" on purpose: boundary matching means the
      // shorter term does NOT fire inside the longer one, so a "barbershop"
      // would otherwise match nothing at all.
      'barbershop',
      'gym',
      'clinic',
      'shop',
      'store',
      'boutique',
      'studio',
      'hotel',
      'dhaba',
      'kirana',
      'showroom',
      'diner',
      'bistro',
      'pub',
    ),
    ...t(2, 'walk in', 'walk-in', 'storefront', 'our branch', 'outlet', 'footfall', 'dine in'),
    ...t(1, 'shelf', 'counter', 'table', 'neighbourhood', 'neighborhood', 'locality'),
  ],
  service: [
    ...t(
      3,
      'agency',
      'consultancy',
      'consultant',
      'freelance',
      'freelancer',
      'contractor',
      'studio practice',
      'firm',
      'plumber',
      'electrician',
      'photographer',
      'accountant',
      'law practice',
      'architect',
    ),
    ...t(2, 'we do it for', 'done for you', 'retainer', 'billable', 'client work', 'per project'),
    ...t(1, 'client', 'clients', 'brief', 'scope', 'proposal'),
  ],
  institution: [
    ...t(
      3,
      'hospital',
      'school',
      'college',
      'university',
      'bank',
      'ngo',
      'trust',
      'foundation',
      'municipal',
      'government',
      'council',
      'institute',
      'academy',
      'nonprofit',
      'non-profit',
      'charity',
    ),
    ...t(2, 'accredited', 'regulator', 'board approved', 'public body', 'affiliated to'),
    ...t(1, 'admissions', 'faculty', 'patients', 'trustees', 'governing'),
  ],
  product: [
    ...t(
      3,
      'd2c',
      'dtc',
      'ecommerce',
      'e-commerce',
      'manufacturer',
      'brand of',
      'we make',
      'we manufacture',
      'label',
      'skincare brand',
      'apparel',
    ),
    ...t(2, 'sku', 'inventory', 'ship', 'shipping', 'packaging', 'catalogue', 'catalog', 'unit'),
    ...t(1, 'product', 'products', 'stock', 'order'),
  ],
  platform: [
    ...t(
      3,
      'marketplace',
      'saas',
      'platform',
      'app',
      'software',
      'two sided',
      'two-sided',
      'aggregator',
      'listing site',
    ),
    ...t(2, 'sellers and buyers', 'users', 'subscription', 'api', 'onboard vendors'),
    ...t(1, 'signup', 'sign up', 'dashboard', 'account'),
  ],
}

export const REGIME_TERMS: Record<Regime, readonly Term[]> = {
  food: [
    ...t(
      3,
      'restaurant',
      'cafe',
      'café',
      'bakery',
      'catering',
      'caterer',
      'food',
      'kitchen',
      'menu',
      'dhaba',
      'brewery',
      'confectionery',
      'sweets',
      'tiffin',
      'cloud kitchen',
    ),
    ...t(2, 'fssai', 'ingredient', 'allergen', 'organic', 'vegan', 'gluten', 'shelf life'),
    ...t(1, 'recipe', 'chef', 'taste', 'fresh'),
  ],
  healthcare: [
    ...t(
      3,
      'clinic',
      'hospital',
      'doctor',
      'dentist',
      'dental',
      'physio',
      'physiotherapy',
      'therapist',
      'diagnostic',
      'pharmacy',
      'medical',
      'ayurveda',
      'homeopathy',
      'nursing',
    ),
    ...t(2, 'patient', 'patients', 'treatment', 'diagnosis', 'prescription', 'clinical', 'cure'),
    ...t(1, 'health', 'care', 'recovery'),
  ],
  finance: [
    ...t(
      3,
      'bank',
      'lending',
      'loan',
      'loans',
      'insurance',
      'mutual fund',
      'wealth',
      'broker',
      'brokerage',
      'fintech',
      'investment',
      'trading',
      'nbfc',
    ),
    ...t(2, 'sebi', 'rbi', 'returns', 'portfolio', 'interest rate', 'credit score', 'advisory'),
    ...t(1, 'money', 'savings', 'capital'),
  ],
  education: [
    ...t(
      3,
      'school',
      'college',
      'university',
      'tuition',
      'tutor',
      'tutoring',
      'coaching',
      'edtech',
      'course',
      'courses',
      'training institute',
      'bootcamp',
      'academy',
    ),
    ...t(2, 'placement', 'syllabus', 'curriculum', 'exam', 'admission', 'certification', 'batch'),
    ...t(1, 'student', 'students', 'learn', 'teach'),
  ],
  beauty: [
    ...t(
      3,
      'salon',
      'spa',
      'beauty',
      'cosmetics',
      'skincare',
      'haircare',
      'wellness',
      'nail',
      'makeup',
      'aesthetic clinic',
      'grooming',
      'barber',
      'barbershop',
    ),
    ...t(2, 'glow', 'anti ageing', 'anti-aging', 'facial', 'serum', 'dermat', 'keratin'),
    ...t(1, 'skin', 'hair', 'shine'),
  ],
  // No terms: `consumer` is the floor everything falls back to, never a match.
  // Giving it keywords would let it outscore a specific regime on a stray word.
  consumer: [],
}

export const LOCALE_TERMS: Record<Locale, readonly Term[]> = {
  IN: [
    ...t(
      3,
      'india',
      'indian',
      'mumbai',
      'delhi',
      'bengaluru',
      'bangalore',
      'pune',
      'chennai',
      'hyderabad',
      'kolkata',
      'ahmedabad',
      'jaipur',
      'kochi',
      'gurgaon',
      'noida',
    ),
    ...t(2, 'rupees', 'inr', '₹', 'gst', 'fssai', 'sebi', 'rbi', 'crore', 'lakh'),
  ],
  US: [
    ...t(3, 'usa', 'united states', 'america', 'new york', 'california', 'texas', 'chicago'),
    ...t(2, 'dollars', 'usd', '$', 'fda', 'ftc', 'zip code'),
  ],
  GB: [
    ...t(3, 'uk', 'united kingdom', 'britain', 'england', 'london', 'manchester', 'scotland'),
    ...t(2, 'pounds', 'gbp', '£', 'vat', 'asa', 'high street'),
  ],
  AE: [...t(3, 'uae', 'dubai', 'abu dhabi', 'sharjah', 'emirates'), ...t(2, 'dirham', 'aed')],
  SG: [...t(3, 'singapore', 'singaporean'), ...t(2, 'sgd')],
  // `other` is a fallback, never matched — same reasoning as `consumer`.
  other: [],
}
