'use client'

import { Lock, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CostLabel } from '@/components/ui/cost-label'
import { Textarea } from '@/components/ui/textarea'
import { ReferenceUpload } from '@/components/studio/reference-upload'
import { GenerationControls } from '@/components/studio/generation-controls'
import type { GenerationMode } from '@sahoda/shared'
import type { StudioFormat } from '@/lib/studio/formats'
import type { LibraryPicture } from '@/lib/studio/read'
import { PROMPT_STARTERS } from '@/lib/studio/prompt'
import { promptHintFor, ruleFor } from '@/lib/studio/modes'

/**
 * THE COMPOSER: THE ONE OBJECT ON THE PAGE, AND THE ONE ACTION ON IT.
 *
 * ── IT IS LIGHT NOW, AND THAT REVERSES A RULING RATHER THAN DRIFTING FROM IT ─
 * This was a dark panel under `data-surface="inverse"` — "one dark object on a
 * light page" — chosen so the thing you compose in could not be missed. Founder's
 * ruling, 2026-09-05, against a reference: the workspace is white and neutral,
 * and the accent appears only on the action that spends. So the composer is a
 * card like every other card, and what makes it the hero is size, position and
 * the one orange button, not a black rectangle.
 *
 * The inverse scope has NOT been replaced with a hand-written fill anywhere —
 * that was the actual danger the old ruling guarded against, and the guard for
 * it moved rather than went.
 *
 * ── THE PRICE IS ON THE BUTTON, NOT BESIDE IT ───────────────────────────────
 * `CostLabel` under the CTA carries the TOTAL for this press, from the chosen
 * model and the chosen count. Somebody who asked for four and was shown the
 * price of one has not been told what the press costs.
 */
export function StudioComposer({
  wanted,
  onWanted,
  mode,
  onMode,
  modelId,
  modelLabel,
  modeWhat,
  formats,
  formatId,
  chosen,
  onFormat,
  count,
  onCount,
  stampEnabled,
  onStamp,
  moreOpen,
  onMore,
  picked,
  libraryPictures,
  libraryUnreadable,
  onTogglePicked,
  onAddReference,
  blocked,
  ready,
  busy,
  cost,
  onGenerate,
}: {
  wanted: string
  onWanted: (next: string) => void
  mode: GenerationMode
  onMode: (next: GenerationMode) => void
  modelId: string
  modelLabel: string
  /** What the chosen look does, in `modes.ts`'s own words. */
  modeWhat: string
  formats: StudioFormat[]
  formatId: string
  /** The chosen format itself, so the composer can state what a size IS. */
  chosen: StudioFormat | null
  onFormat: (id: string) => void
  count: number
  onCount: (n: number) => void
  stampEnabled: boolean
  onStamp: (on: boolean) => void
  moreOpen: boolean
  onMore: () => void
  picked: string[]
  libraryPictures: LibraryPicture[]
  /** The read FAILED, which is not the same claim as an empty library. */
  libraryUnreadable: boolean
  onTogglePicked: (assetId: string) => void
  onAddReference: (assetId: string) => void
  /** The sentence `modes.ts` would refuse this press with, or null. */
  blocked: string | null
  ready: boolean
  busy: boolean
  cost: number
  onGenerate: () => void
}) {
  const rule = ruleFor(mode, modelId)

  return (
    <section
      aria-labelledby="studio-make"
      /* `focus-within` OUTLINE, never a second box-shadow: the lift utility
         already owns `box-shadow`, and a focus class setting it too would
         silently drop one of the two layers — the collision `card-rest-lift`
         exists to document. An outline is a different property. */
      className="surface-ring-lift rounded-card bg-surface p-5 transition-micro focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent max-narrow:p-4"
      data-guide="studio-composer"
    >
      <h2 id="studio-make" className="sr-only">
        Make a picture
      </h2>

      <div className="flex items-start gap-3 max-narrow:flex-col">
        <Sparkles
          className="mt-1 size-[18px] shrink-0 text-accent max-narrow:hidden"
          strokeWidth={1.75}
          aria-hidden
        />

        <label className="flex min-w-0 flex-1 flex-col">
          <span className="sr-only">What should the picture show?</span>
          <Textarea
            value={wanted}
            autoGrow
            rows={2}
            maxLength={1000}
            placeholder={promptHintFor(mode)}
            onChange={(event) => onWanted(event.target.value)}
            data-guide="studio-prompt"
            /* No box round it. It sits on the card's own surface and is the
               loudest thing there; a second border would draw an input inside
               a panel that is already the input. */
            className="border-0 bg-transparent px-0 py-0 type-h3 font-[400] shadow-none focus-visible:outline-none"
          />
        </label>

        <div className="flex shrink-0 flex-col items-end gap-1 max-narrow:w-full max-narrow:items-stretch">
          <Button
            onClick={onGenerate}
            loading={busy}
            disabled={!ready}
            data-guide="studio-generate"
            className="max-narrow:w-full"
          >
            Make this picture
          </Button>
          <span className="type-meta text-muted">
            <CostLabel
              action={count === 1 ? 'Make a picture' : `Make ${count} pictures`}
              cost={cost * count}
            />
          </span>
        </div>
      </div>

      {/* ── SOMETHING TO TRY, FOR A BOX NOBODY KNOWS WHAT TO PUT IN ─────────
          Each chip says the idea and writes the whole sentence, which then sits
          in the box where it can be edited. Nothing is spent by trying one.
          Gone once there is something to edit, because then they are in the way. */}
      {wanted.trim() === '' ? (
        <ul className="mt-4 flex flex-wrap gap-2" data-guide="studio-starters">
          {PROMPT_STARTERS.map((starter) => (
            <li key={starter.label}>
              <button
                type="button"
                onClick={() => onWanted(starter.text)}
                className="surface-ring flex items-center gap-1.5 rounded-pill bg-s2 px-3 py-1.5 text-left type-sm text-muted transition-micro hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Sparkles className="size-[12px] text-accent" strokeWidth={1.75} aria-hidden />
                {starter.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* ── REWRITING THE WORDS FOR THE MODEL, WHICH IS NOT BUILT ───────────
          The reference puts a "Rewrite for the model · 1 credit" action here.
          Sahoda does not have one: nothing in `packages/mesh` rewrites a Studio
          prompt and no price for it exists in `pricing.config.json`. A button
          that took a credit and returned the same words would be the mock
          success this product forbids, so it is named as unbuilt, in the place
          it will live, and it takes no press.

          A SPAN, not a disabled button — `design-lint.mjs` rule 3 refuses that
          pairing, because a screen reader announces a disabled button as an
          action the reader could take. */}
      <p className="mt-4 flex w-fit items-center gap-2 rounded-pill px-1 type-meta text-muted">
        <Lock className="size-[12px]" strokeWidth={1.75} aria-hidden />
        Rewrite for the model, coming soon
      </p>

      <div className="my-4 h-px bg-line-soft" />

      <GenerationControls
        mode={mode}
        onMode={onMode}
        modelId={modelId}
        modelLabel={modelLabel}
        formats={formats}
        formatId={formatId}
        onFormat={onFormat}
        count={count}
        onCount={onCount}
        stampEnabled={stampEnabled}
        onStamp={onStamp}
        moreOpen={moreOpen}
        onMore={onMore}
      />

      {/* ── WHAT THE ROW'S FIVE WORDS LEAVE OUT ────────────────────────────
          Three sentences the pills cannot carry, and each is a claim a person
          acts on rather than decoration.

          THE SIZE ONE WENT MISSING ONCE AND WAS FOUND IN AUDIT, NOT BY A TEST.
          The old screen printed the pixel dimensions and how many of this
          workspace's channels a size covers, under the size select. The select
          became a pill and the sentence was not carried across, so `Square post`
          stopped saying 1080 by 1080 and stopped saying what it is for. Nothing
          went red, because nothing had ever asserted it. `says what a size
          actually is` now does. */}
      <p className="mt-3 type-meta text-muted">
        {modeWhat}
        {chosen === null ? null : (
          <>
            {' '}
            <span className="num">{chosen.label}</span> is{' '}
            <span className="num">{chosen.width}</span> by{' '}
            <span className="num">{chosen.height}</span> pixels, for{' '}
            <span className="num">{chosen.channels.length}</span> of your channels.
          </>
        )}
        {count === 1 ? null : (
          <>
            {' '}
            <span className="num">{count}</span> different pictures from the same description, so
            you can pick. They will not match each other.
          </>
        )}
      </p>

      {/* ── WHAT IT IS MATCHING, IN THE ORDER IT WILL BE SENT ───────────────
          The numeral is the POSITION and not a tick: `signReferences` sends them
          in pick order and the first weighs most. A count alone states a fact
          nobody can check. */}
      <ul className="mt-3 flex flex-wrap items-center gap-2" data-guide="studio-picked">
        {picked.map((assetId, at) => {
          const picture = libraryPictures.find((one) => one.assetId === assetId) ?? null
          return (
            <li key={assetId}>
              <button
                type="button"
                onClick={() => onTogglePicked(assetId)}
                aria-label={`Stop matching ${picture?.title ?? 'this picture'}, picked ${at + 1} of ${picked.length}`}
                className="surface-ring relative block size-[44px] overflow-hidden rounded-input transition-micro hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {picture?.url == null ? (
                  <span className="flex size-full items-center justify-center bg-s2" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- a
                  // short-lived signed URL from a private bucket cannot be
                  // optimised without proxying the credential.
                  <img src={picture.url} alt="" className="size-full object-cover object-top" />
                )}
                <span className="absolute bottom-0 left-0 flex size-[16px] items-center justify-center rounded-pill bg-primary type-meta text-primary-foreground">
                  <span className="num">{at + 1}</span>
                </span>
              </button>
            </li>
          )
        })}
        <li>
          <ReferenceUpload
            compact
            disabled={rule.maxReferences > 0 && picked.length >= rule.maxReferences}
            onAdded={onAddReference}
          />
        </li>
        <li className="type-meta text-muted">
          {picked.length === 0 ? (
            'Add a picture to match, if you have one'
          ) : (
            <>
              <span className="num">{picked.length}</span> to match, in order
            </>
          )}
        </li>
      </ul>

      {/* ── A FAILED LIBRARY READ IS SAID HERE, NOT ONLY IN THE TRAY ───────
          The three answers for "why are there no pictures to match" live in the
          tray beside the grid, and the tray is shut on arrival. Two of them are
          fine there: an EMPTY library and a missing workspace are states you
          discover when you go looking. A read that FAILED is not — it means
          somebody with thirty pictures is being shown none of them, and they
          would never open the tray to find out why.

          Only the failure. An empty library announced on arrival would be a
          screen telling every new account about a feature they have not reached
          yet.

          And only while the tray is SHUT. The tray states the same thing beside
          the grid it is about, and two elements carrying one claim is a screen
          saying the same sentence twice — which is how one of them later drifts
          into a second wording for the same fact. Exactly one is on screen at
          any moment, and one always is. */}
      {libraryUnreadable && !moreOpen ? (
        <p
          role="status"
          className="surface-ring mt-3 rounded-input bg-s2 px-3 py-2 type-sm text-muted"
        >
          Sahoda could not read your pictures just now, so there are none here to match. You can
          still add one from this device, or make one.
        </p>
      ) : null}

      {/* Inside the composer, because it is about THIS press. */}
      {blocked === null ? null : (
        <p
          role="status"
          className="surface-ring mt-3 rounded-input bg-s2 px-3 py-2 type-sm text-muted"
        >
          {blocked}
        </p>
      )}
    </section>
  )
}
