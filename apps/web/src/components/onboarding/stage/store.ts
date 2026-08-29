/**
 * SAHODA LABS — BRAND BRAIN ONBOARDING · the store
 *
 * Ported from `docs/ui-package/sahoda-labs/js/onboarding.js`, which states the
 * rule this whole surface is built to keep:
 *
 *   "The AI never claims to have done work it has not done. Every message on
 *    screen is either a restatement of what the user just typed or a statement
 *    of intent about what will happen next."
 *
 * ── THE ONE THING THAT IS NOT A STRAIGHT PORT ────────────────────────────────
 * The source keeps `signals` as a COUNTER it increments, guarded by a `seen`
 * Set that lives only in module scope. `Store.save()` persists the counter;
 * `seen` is not persisted. So on the resume path the counter comes back holding
 * every reference the user added, `restoreInputs()` re-runs `addRef()` for each
 * one, `seen` is empty in the fresh page, and every reference is COUNTED TWICE.
 *
 * That number is not decorative — the source says so itself: it drives the orb's
 * density, the confidence reading and the number on the dashboard. A resume that
 * inflates it is the exact thing this flow refuses to do, so the count is
 * DERIVED here instead: `signalIds(data)` is a pure function of the answers, and
 * `signals` is its length. Resume is then exact by construction, there is no
 * counter to drift, and clearing an answer removes its signal rather than
 * leaving a credit for something no longer held.
 */
import { isCompetitorKind, type CompetitorKind } from '@/lib/radar/types'

/**
 * THE COLOURS, AND WHY THERE IS NO PICKER ANY MORE.
 *
 * Onboarding used to ask for three colours in `<input type="color">` fields.
 * Two of them reached `saveWorkspaceTheme`; the third, `Background`, reached
 * nothing at all — Brand Skin themes seven tokens and the surface is not one of
 * them (Design System §2, "Neutrals and semantics are fixed"), so a
 * customer-chosen page background could not be honoured and would be how a
 * workspace ends up with text nobody can read on it. It still COUNTED as a
 * signal, raising the confidence meter for an answer the product discarded.
 *
 * Rather than delete one field and leave two, the picker went entirely.
 * Founder's ruling, 2026-08-29: a shop owner does not know their hex codes, and
 * asking for them is asking somebody to do our work. They know their logo.
 *
 * `palette` is what `lib/brand/color-extract.ts#extractPalette` reads out of it,
 * most frequent colour first, which is exactly the shape `brandSkinVars` wants:
 * `[0]` becomes the primary and `[1]` the accent. Empty means no logo, or a logo
 * nothing could be read from, and both fall back to the colours the door pulled
 * off the website.
 *
 * The FILE is deliberately not in here. This object is serialised to
 * localStorage on every keystroke and a `File` becomes `{}`, which is the exact
 * shape of the defect this screen already carried once: a logo that persisted as
 * its filename and was never uploaded. The bytes live in the stage's own state
 * for as long as the tab is open, and `logoName` is only what the screen shows
 * after a resume, when the bytes are gone.
 */
/**
 * A competitor, in the vocabulary Radar actually stores.
 *
 * `kind` and the three values it may take are NOT redefined here: they are
 * `CompetitorKind` from `@/lib/radar/types`, the same union `addCompetitor`
 * validates against. A second spelling of that list is how a screen ends up
 * offering a kind the write path rejects.
 *
 * This used to be a bare string. It was collected, kept in localStorage and
 * never sent anywhere, under a card that read "tracked for positioning" — so
 * the shape had no reason to carry an address. It is sent now, and Radar needs
 * a public URL to watch and a kind to know what it is looking at.
 */
export interface Rival {
  name: string
  url: string
  kind: CompetitorKind
}

export interface OnboardingData {
  name: string
  site: string
  what: string
  category: string
  audience: string
  age: string
  loc: string
  role: string
  interests: string
  /** Colours read out of the logo, most frequent first. Empty when there is none. */
  palette: string[]
  /** What the uploaded file was called, so a resumed tab can say what it had. */
  logoName: string
  /**
   * What Sahoda must never say about them, in their words.
   *
   * This feeds `taboo.avoid_topics`, which was empty on EVERY resolve until
   * now: `use-build.ts` hardcoded `refusal: ''`, so every Red line on /brain was
   * invented by the model with nothing from the user behind it.
   *
   * The field was removed once, deliberately, and the reason is worth keeping:
   * "a guess here would become a red line the model treats as binding". That
   * argument is about GUESSING on the user's behalf, and it still holds — this
   * asks instead, and a blank stays blank rather than becoming an inferred rule.
   */
  neverSay: string
  sources: string[]
  /**
   * The address given for each picked source, keyed by its `SOURCES` key.
   *
   * A separate map rather than a shape change to `sources`, deliberately: this
   * lane already migrated `competitors` in the same commit range, and a second
   * simultaneous migration doubles the ways a resumed session can come back
   * wrong for no gain. A key with no entry, or an empty one, is a source that
   * was picked and never addressed — it is not sent.
   */
  sourceUrls: Record<string, string>
  competitors: Rival[]
}

export const DEFAULT_DATA: OnboardingData = {
  name: '',
  site: '',
  what: '',
  category: '',
  audience: '',
  age: '',
  loc: '',
  role: '',
  interests: '',
  palette: [],
  logoName: '',
  sources: [],
  neverSay: '',
  sourceUrls: {},
  competitors: [],
}

/**
 * The step ids, in order. `comp` is optional; `result` is the end.
 *
 * ── FIVE, NOT SIX. THE REFERENCES SCREEN WAS REMOVED ─────────────────────────
 * It asked for pages whose style the customer admires, plus a note on what they
 * liked, and sent neither anywhere: `use-build.ts` posts model, regime, locale,
 * doorText, name, refusal, positioning and the audience answers, and no request
 * has ever carried a reference. The card under each link said "queued for
 * analysis" and the result screen said "plus N references to study". Nothing was
 * queued and nothing studied them.
 *
 * They could not simply be pointed at `addUrlDocument` either, which is what the
 * Knowledge screen does with an address. The library grounds captions as FACTS
 * ABOUT THIS BUSINESS, and a reference is explicitly somebody else's page — the
 * screen's own words were "competitors: anything you admire". Indexing those
 * would let a caption state a rival's prices as the customer's own.
 *
 * So the ask is removed rather than made vaguer, which is the same call already
 * made for the Notion, Google Drive and Shopify tiles.
 *
 * Knowledge KEEPS ITS SCREEN and takes the number 5. `loadState` maps both
 * retired positions onto it, so nobody mid-flow is thrown back to the intro.
 */
export const ORDER = ['intro', '1', '2', '3', '4', '5', 'comp', 'result'] as const
export type StepId = (typeof ORDER)[number]

/** The five that carry a number in the progress rail. */
export const NUMBERED: readonly StepId[] = ['1', '2', '3', '4', '5']

export interface OnboardingState {
  step: StepId
  data: OnboardingData
}

/**
 * Every signal the answers actually contain, as stable ids.
 *
 * The thresholds are the source's, verbatim — two characters for a name, more
 * than four for a site, more than twelve for the positioning sentence, three for
 * the audience. They exist so a half-typed word does not read as an answer.
 */
export function signalIds(data: OnboardingData): string[] {
  const ids: string[] = []
  if (data.name.trim().length >= 2) ids.push('name')
  if (data.site.trim().length > 4) ids.push('site')
  if (data.what.trim().length > 12) ids.push('what')
  if (data.category) ids.push('cat')
  if (data.audience.trim().length >= 3) ids.push('aud')
  if (data.age.trim()) ids.push('age')
  if (data.loc.trim()) ids.push('loc')
  if (data.role.trim()) ids.push('role')
  if (data.interests.trim()) ids.push('int')
  // A LOGO, A GUIDELINES FILE, A REFERENCE AND A TASTE NOTE ARE NOT SIGNALS.
  //
  // They were, and each one raised the confidence reading and the orb's density
  // for an input that reached nothing: the logo persisted as a FILE NAME, an
  // uploaded document as `{name, size}` with no bytes, and a reference as a URL
  // no request ever carried. The number on the result screen is a claim about
  // how much Sahoda was told, so counting them overstated it by up to four.
  /**
   * ONE signal for a logo, and only when colours actually came out of it.
   *
   * Not "a logo was chosen": a file nothing could be read from reaches the theme
   * with nothing, and counting the choosing would be the same overstatement this
   * comment block was written about. `palette` is non-empty only when
   * `extractPalette` returned colours, so it is the honest test.
   */
  if (data.palette.length > 0) ids.push('logo')
  if (data.neverSay.trim()) ids.push('neversay')
  for (const source of data.sources) ids.push(`src:${source}`)
  for (const rival of data.competitors) ids.push(`comp:${rival.name}`)
  return ids
}

export function signalCount(data: OnboardingData): number {
  return signalIds(data).length
}

/**
 * Confidence — DERIVED, and the derivation is the whole point.
 *
 * Ported unchanged from the source, including both denominators, which are
 * different on purpose: `signals / 24` drives the ORB's energy (how dense the
 * object looks) and `signals / 16` drives this READING (how much we were told).
 * They measure different things and collapsing them would be a tidy-looking
 * change that quietly alters one of the two.
 *
 * The `Math.min(96, …)` ceiling is also deliberate. A brand this product has
 * been told about for three minutes is not 100% understood, and a bar that
 * reaches the end says it is.
 *
 * `core` counts the load-bearing answers. Voice is NOT among them: the flow no
 * longer asks for it (it is set on /brain against real output), and scoring
 * against a field nobody is asked for would peg every workspace at the same
 * number — which is the definition of a value with nothing behind it.
 */
export interface Confidence {
  pct: number
  label: 'High' | 'Medium' | 'Getting started'
}

export function confidenceOf(data: OnboardingData): Confidence {
  const core = [data.name, data.audience, data.what, data.category].filter(Boolean).length
  const pct = Math.min(96, Math.round((signalCount(data) / 16) * 70 + core * 7))
  return { pct, label: pct >= 78 ? 'High' : pct >= 52 ? 'Medium' : 'Getting started' }
}

/** The orb's energy: 0 → 1 over the first 24 signals. The source's ratio. */
export function energyOf(data: OnboardingData): number {
  return Math.min(1, signalCount(data) / 24)
}

/** The orb's receipt names what was just absorbed. */
export const CAP_LABELS: Record<string, string> = {
  name: 'Brand name',
  site: 'Website',
  what: 'Positioning',
  cat: 'Category',
  aud: 'Audience',
  age: 'Audience',
  loc: 'Audience',
  role: 'Audience',
  int: 'Audience',
  logo: 'Brand colours',
  src: 'Knowledge',
  comp: 'Competitor',
}

export function capLabel(signalId: string): string {
  return CAP_LABELS[signalId.split(':')[0] ?? ''] ?? 'Learned'
}

/**
 * Continue is gated only where an answer is genuinely required.
 *
 * The source's comment is the rule and it is kept verbatim: steps 4, 5 and 6 are
 * optional and stay OPEN, because "a wall in front of an optional question is a
 * lie" about what actually matters.
 */
export function canAdvance(step: StepId, data: OnboardingData): boolean {
  if (step === '1') return data.name.trim().length > 0
  if (step === '2') return data.what.trim().length > 0 || Boolean(data.category)
  if (step === '3') return data.audience.trim().length > 0
  return true
}

/* ────────────────────────────────────────────────────────── persistence ── */

/**
 * Keyed per WORKSPACE, unlike the source's single `sahoda.brandbrain`.
 *
 * One browser signs into more than one workspace here, and a shared key would
 * resume workspace B at workspace A's step holding workspace A's answers — then
 * write them onto B. The step and the answers are workspace-scoped facts, so the
 * key is too.
 */
export function storageKey(workspaceId: string): string {
  return `sahoda.brandbrain.${workspaceId}`
}

interface Persisted {
  step?: unknown
  data?: unknown
}

/**
 * Exported for `use-step-history`, which reads a step id back out of
 * `history.state` — an object this app does not solely own (Next keeps its
 * router keys there) and that a previous version of the site may have written.
 * Anything unrecognised must be ignored rather than rendered.
 */
export function isStepId(value: unknown): value is StepId {
  return typeof value === 'string' && (ORDER as readonly string[]).includes(value)
}

/**
 * Where a saved position resumes, including the two that no longer exist.
 *
 * `'5'` WAS References and `'6'` WAS Knowledge. Falling through to `isStepId`
 * would send anybody holding either of those back to the intro, on a flow they
 * are part-way through — their typed answers would survive and their PLACE
 * would not, which reads as the product having lost the session.
 *
 * Both resume on Knowledge, which is the screen that followed References and is
 * now `'5'` itself. Nobody is shown a screen they already finished, and nobody
 * skips one they have not.
 */
export function resumeStep(value: unknown): StepId {
  if (value === '6') return '5'
  return isStepId(value) ? value : 'intro'
}

/**
 * Read a saved position. Every field is checked rather than trusted: this is
 * localStorage, which any script on the origin can write and which survives a
 * deploy that changed the shape. A bad value resumes at `intro` with nothing,
 * which is the same place a first-time user starts — never a crash on boot.
 */
export function loadState(workspaceId: string): OnboardingState | null {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(storageKey(workspaceId))
  } catch {
    // Private mode. The flow still works; it just will not resume.
    return null
  }
  if (!raw) return null

  let parsed: Persisted
  try {
    parsed = JSON.parse(raw) as Persisted
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const saved = (parsed.data ?? {}) as Partial<OnboardingData>
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

  return {
    step: resumeStep(parsed.step),
    data: {
      name: str(saved.name),
      site: str(saved.site),
      what: str(saved.what),
      category: str(saved.category),
      audience: str(saved.audience),
      age: str(saved.age),
      loc: str(saved.loc),
      role: str(saved.role),
      interests: str(saved.interests),
      /* Strings, so they survive a resume. The logo's BYTES do not, which is
         why `logoName` is carried beside them: the screen can then say what it
         read the colours from without implying it still holds the file. */
      palette: arr<string>(saved.palette).filter((c) => typeof c === 'string'),
      logoName: str(saved.logoName),
      neverSay: str(saved.neverSay),
      sources: arr<string>(saved.sources).filter((s) => typeof s === 'string'),
      // Values only; the keys are whatever was picked and are checked against
      // SOURCES at the point of use, not here.
      sourceUrls: Object.fromEntries(
        Object.entries(
          (saved.sourceUrls && typeof saved.sourceUrls === 'object'
            ? saved.sourceUrls
            : {}) as Record<string, unknown>,
        ).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      ),
      /**
       * Reads BOTH shapes. A session saved before competitors carried an
       * address comes back as `string[]`, and dropping those rows would lose
       * answers somebody already gave us — a resume that silently forgets is
       * worse than one that comes back incomplete. An old row keeps its name,
       * gets an empty url and defaults to `website`, which is the kind the
       * Radar form itself opens on. It cannot be sent until the url is filled,
       * and the step shows it needing one.
       */
      competitors: arr<unknown>(saved.competitors)
        .map((row): Rival | null => {
          if (typeof row === 'string') {
            return row.trim() ? { name: row, url: '', kind: 'website' } : null
          }
          if (!row || typeof row !== 'object') return null
          const r = row as Partial<Rival>
          if (typeof r.name !== 'string' || !r.name.trim()) return null
          return {
            name: r.name,
            url: typeof r.url === 'string' ? r.url : '',
            kind: isCompetitorKind(r.kind) ? r.kind : 'website',
          }
        })
        .filter((r): r is Rival => r !== null),
    },
  }
}

export function saveState(workspaceId: string, state: OnboardingState): void {
  try {
    window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(state))
  } catch {
    // Private mode, or the quota is full. Losing the resume point is survivable;
    // throwing on every keystroke is not.
  }
}

export function clearState(workspaceId: string): void {
  try {
    window.localStorage.removeItem(storageKey(workspaceId))
  } catch {
    // Nothing to do — there is no state to lose.
  }
}
