'use client'

import { ArrowRight, Brain, Check, Sparkles } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { websiteCell, type DoorOutcome } from '../door-outcome'
import { sendableSources } from '@/lib/onboarding/sources'
import { confidenceOf, type OnboardingData } from '../store'

export interface ResultStepProps {
  data: OnboardingData
  door: DoorOutcome
  /** True when the resolve that produced this brain was served free. */
  wasFree: boolean
  /** Set when the model could not be reached and a sample was shown instead. */
  fallbackMessage: string | null
  /** What did not save after the build — a competitor, a source, or both. `null` when all of it did. */
  afterBuildNote: string | null
  saving: boolean
  /** The BRAIN failed to save. This blocks entry. */
  saveError: string | null
  /** The THEME failed to save. The brain is fine; this does not block entry. */
  themeError: string | null
  onEnter: () => void
  onReview: () => void
}

/**
 * The result.
 *
 * Every cell is something the flow actually collected. Voice and Style used to
 * sit here; with those two steps gone they would read "—" on every workspace,
 * and a card of dashes is worse than a shorter card. They are set on the Brand
 * Brain page instead, against real output — which is what "Review Brand Brain"
 * goes to.
 */
export function ResultStep({
  data,
  door,
  wasFree,
  fallbackMessage,
  afterBuildNote,
  saving,
  saveError,
  themeError,
  onEnter,
  onReview,
}: ResultStepProps) {
  const c = confidenceOf(data)
  /**
   * Sources THAT WILL BE SENT, not sources picked.
   *
   * `docs` used to be added here, and an uploaded file was `{ name, size }` with
   * no bytes, so a person who dropped in three PDFs was told Sahoda had three
   * more sources to draw on than it had. Removing `docs` fixed that instance and
   * not the class: this then counted `data.sources.length`, the ticked tiles,
   * while `sendSources` skips any tile whose address was left blank. Three ticks
   * and no addresses read as "3 sources" over a library that received nothing.
   *
   * `sendableSources` is the sender's own rule, imported rather than restated,
   * because a copy of a rule is how this came back the first time.
   */
  const knowledge = sendableSources(data.sources, data.sourceUrls).length

  // Animated from 0 so the bar reads as a measurement being taken. The VALUE is
  // computed above and never moves; only its rendering is deferred a frame.
  const [fill, setFill] = useState(0)
  useEffect(() => {
    const id = setTimeout(() => setFill(c.pct), 420)
    return () => clearTimeout(id)
  }, [c.pct])

  const cells: [string, ReactNode][] = [
    ['Brand', data.name || '—'],
    ['Category', data.category || '—'],
    ['Audience', data.audience || '—'],
    ['Website', websiteCell(door, data.site)],
    [
      /* The colour Brand Skin will actually use, which is the FIRST extracted
         one — `brandSkinVars` reads `colors[0]` as the primary. An empty palette
         means no logo, or one nothing could be read from, and the dash is this
         product's absence mark rather than a guess at a colour. */
      'Brand colour',
      data.palette[0] ? (
        <>
          <span className="bb__sw" style={{ background: data.palette[0] }} />
          {data.logoName || data.palette[0]}
        </>
      ) : (
        '—'
      ),
    ],
    ['Knowledge', knowledge ? `${knowledge} source${knowledge === 1 ? '' : 's'}` : 'None yet'],
    [
      'Confidence',
      <div className="conf">
        <div className="conf__track">
          <div className="conf__fill" id="conf-fill" style={{ width: `${fill}%` }} />
        </div>
        <span className="conf__v">{c.label}</span>
      </div>,
    ],
  ]

  /*  The summary composes only from what was given. Sentences whose ingredients
      are missing are DROPPED rather than filled with guesses. */
  const bits: ReactNode[] = []
  if (data.what) bits.push(<>What you do: {data.what.trim().replace(/\.$/, '')}.</>)
  if (data.audience) {
    bits.push(
      <>
        You speak to <em>{data.audience}</em>
        {data.loc ? ` in ${data.loc}` : ''}.
      </>,
    )
  }
  if (data.category) {
    bits.push(
      <>
        I&rsquo;ll plan for a <em>{data.category.toLowerCase()}</em> business.
      </>,
    )
  }
  if (door.kind === 'read') {
    bits.push(<>I read {door.label} and kept what it says about you, in its own words.</>)
  }
  if (knowledge) {
    bits.push(
      <>
        I have {knowledge} knowledge source{knowledge === 1 ? '' : 's'} to draw on.
      </>,
    )
  }
  /*  Tone is the one thing onboarding no longer asks, so the summary says so and
      points at where it gets set. Silence would read as "I already know", which
      is exactly the false confidence the rest of this flow is built to avoid. */
  bits.push(
    <>
      I have not settled on a tone of voice yet. Set that in Brand Brain and everything I write
      follows it.
    </>,
  )

  const join = (list: ReactNode[]): ReactNode =>
    list.map((b, i) => (
      <span key={i}>
        {b}
        {i < list.length - 1 ? ' ' : ''}
      </span>
    ))

  return (
    <div className="rise">
      <p className="micro step__eyebrow" style={{ color: 'var(--onb-confirm)' }}>
        Complete
      </p>
      <h2 className="display">Your Brand Brain is ready.</h2>
      <p className="lead step__lead" style={{ maxWidth: '44ch' }}>
        Sahoda now understands your brand, what you do, who you sell to and how you look.
      </p>

      {/* Three notices that must each keep their own sentence, because they are
          three different situations. None of them is a claim about the page. */}
      {door.kind === 'unread' ? <p className="hint">{door.message}</p> : null}
      {door.kind === 'blocked' ? <p className="hint">{door.message}</p> : null}
      {fallbackMessage ? <p className="hint">{fallbackMessage}</p> : null}
      {/* Shown beside the fallback note and not folded into it: a model that
          could not be reached and a competitor that did not save are different
          failures, and one sentence covering both would be true of neither. */}
      {afterBuildNote ? <p className="hint">{afterBuildNote}</p> : null}
      {wasFree ? (
        <p className="hint">Your first Brand Brain was free. Nothing was charged.</p>
      ) : null}

      <div className="bb" id="bb-card" style={{ marginTop: 30 }}>
        <div className="bb__head">
          <Brain className="bb__mark" size={20} strokeWidth={1.4} aria-hidden />
          <span className="bb__ttl">Sahoda Brand Brain</span>
          <span className="bb__ready">
            <Check size={12} strokeWidth={2.4} aria-hidden />
            Ready
          </span>
        </div>
        <div className="bb__grid" id="bb-grid">
          {cells.map(([k, v]) => (
            <div className="bb__cell" key={k}>
              <div className="bb__k">{k}</div>
              <div className="bb__v">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="summary">
        <div className="summary__t">
          <Sparkles size={16} strokeWidth={1.6} aria-hidden />
          What Sahoda learned
        </div>
        <div id="summary-body">
          <p>{join(bits.slice(0, 3))}</p>
          {bits.length > 3 ? <p>{join(bits.slice(3))}</p> : null}
        </div>
      </div>

      {saveError ? <p className="hint">{saveError}</p> : null}
      {themeError ? (
        <p className="hint">
          {themeError} Your Brand Brain is unaffected. Only the workspace colours were not saved.
        </p>
      ) : null}

      <div className="cta-row">
        <button
          type="button"
          className="btn btn--primary"
          id="enter"
          onClick={onEnter}
          disabled={saving}
        >
          <span className="btn__t">{saving ? 'Saving your Brand Brain' : 'Enter Sahoda'}</span>
          <ArrowRight className="arw" size={18} strokeWidth={1.9} aria-hidden />
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          id="review"
          onClick={onReview}
          disabled={saving}
        >
          Review Brand Brain
        </button>
      </div>
    </div>
  )
}
