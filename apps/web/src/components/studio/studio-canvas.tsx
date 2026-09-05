'use client'

import Link from 'next/link'
import { Sparkles } from 'lucide-react'

import { PictureActions } from '@/components/studio/picture-actions'
import type { CanvasPicture } from '@/lib/studio/canvas'
import type { StudioFormat } from '@/lib/studio/formats'
import type { StampNote } from '@/lib/studio/stamp-copy'

/**
 * THE CANVAS: WHERE THE THING SOMEBODY PAID FOR IS JUDGED.
 *
 * ── IT IS NEVER EMPTY, IT IS ALWAYS SAYING SOMETHING ────────────────────────
 * Before the first press it says what will appear and how to start. While a
 * generation runs it says so, UNDER the previous picture rather than instead of
 * it, so a second press does not blank the one being looked at. An empty
 * rectangle reads as something that failed to load.
 *
 * ── THE SHAPE IS THE JUDGEMENT ──────────────────────────────────────────────
 * A story is 1080x1920 and a link card is 1200x628, and the same picture is a
 * different picture in each. The canvas takes the CHOSEN format's ratio, so a
 * result is never previewed against a shape it is not.
 *
 * ── THE GLOW IS ONE RADIAL AND IT IS DECORATION ─────────────────────────────
 * `aria-hidden`, behind the text, at low alpha, and it carries no meaning: the
 * heading and the sentence say everything. It is drawn with the brand tint
 * tokens rather than a hex, so a workspace that rethemes takes it with them.
 */
export function StudioCanvas({
  active,
  shown,
  bothVersions,
  showing,
  onShowing,
  chosen,
  busy,
  made,
  note,
  pictures,
  onPick,
  onOpen,
  onReuse,
  onDraw,
}: {
  active: CanvasPicture | null
  /** The URL actually on screen: the stamped copy when there is one and it is chosen. */
  shown: string | null
  bothVersions: boolean
  showing: 'stamped' | 'original'
  onShowing: (which: 'stamped' | 'original') => void
  chosen: StudioFormat | null
  busy: boolean
  made: boolean
  /** `stamp-copy.ts`'s answer for this picture's logo, or null when never attempted. */
  note: StampNote | null
  pictures: CanvasPicture[]
  onPick: (imageId: string) => void
  onOpen: () => void
  onReuse: () => void
  onDraw: () => void
}) {
  return (
    <section aria-labelledby="studio-canvas-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="studio-canvas-title" className="type-eyebrow text-muted">
          The canvas
        </h2>
        {active === null ? null : (
          <PictureActions picture={active} onOpen={onOpen} onReuse={onReuse} onDraw={onDraw} />
        )}
      </div>

      <div
        className="surface-ring-lift relative flex items-center justify-center overflow-hidden rounded-card bg-surface"
        style={{
          aspectRatio: chosen === null ? '1 / 1' : `${chosen.width} / ${chosen.height}`,
        }}
        data-guide="studio-canvas"
      >
        {active === null ? (
          // The glow, only where there is nothing else. Over a real picture it
          // would tint what somebody is trying to judge.
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 42%, var(--brand-tint) 0%, transparent 58%)',
            }}
          />
        ) : null}

        {active === null ? null : (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open "${active.prompt}" large`}
            className="absolute inset-0 block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a
                short-lived signed URL from a private bucket cannot be optimised
                by next/image without proxying the credential. */}
            <img
              src={shown ?? active.url}
              alt={
                bothVersions && showing === 'stamped'
                  ? `${active.prompt}, with your logo`
                  : active.prompt
              }
              width={active.width ?? undefined}
              height={active.height ?? undefined}
              className={`size-full object-contain transition-micro ${busy ? 'opacity-40' : ''}`}
            />
          </button>
        )}

        {busy || active === null ? (
          <div className="pointer-events-none relative flex max-w-[46ch] flex-col items-center gap-2 px-6 text-center">
            {busy ? (
              <p className="type-sm text-muted">
                Sahoda is drawing this now. It usually takes a few seconds, and you can leave this
                screen without losing it.
              </p>
            ) : made ? (
              <p className="type-sm text-muted">
                Made. It is saved to your library, and it appears here in a moment.
              </p>
            ) : (
              <>
                <span
                  aria-hidden
                  className="surface-ring mb-1 grid size-[44px] place-items-center rounded-pill bg-brand-wash text-accent dark:bg-s2"
                >
                  <Sparkles className="size-[18px]" strokeWidth={1.75} />
                </span>
                <p className="type-h3 text-ink">Nothing made yet.</p>
                <p className="type-sm text-muted">
                  Use an idea from the box above, or write your own, then press Make this picture.
                  Your picture appears here at the size you picked, so you can judge it before you
                  use it.
                </p>
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* ── WHICH VERSION, AND WHY THERE IS SOMETIMES ONLY ONE ──────────────
          The toggle exists only when there are genuinely two pictures. Every
          other case gets the sentence for ITS answer and no control, and the
          sentence is asked of `stamp-copy.ts` rather than written here, so the
          five answers cannot quietly collapse into "no logo". */}
      {active === null || note === null ? null : (
        <div
          data-guide="studio-logo-bar"
          className="surface-ring-lift flex flex-wrap items-center gap-3 rounded-card bg-surface p-3 pl-4"
        >
          {bothVersions ? (
            <div
              role="group"
              aria-label="Which version of this picture to show"
              className="surface-ring flex gap-1 rounded-pill bg-s2 p-1"
            >
              {(['stamped', 'original'] as const).map((which) => (
                <button
                  key={which}
                  type="button"
                  onClick={() => onShowing(which)}
                  aria-pressed={showing === which}
                  className={`rounded-pill px-3 py-1 type-sm font-[550] transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    showing === which
                      ? 'surface-ring bg-surface text-ink'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {which === 'stamped' ? 'With your logo' : 'Without it'}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex min-w-[24ch] flex-1 flex-col gap-0.5">
            <span className="type-sm font-[550] text-ink">{note.title}</span>
            <span className="type-meta text-muted">{note.body}</span>
          </div>

          {/* A remedy ONLY when one exists. `remedy: null` is the assertion that
              no action of theirs would change this — see `no-impossible-remedy`. */}
          {note.remedy === null ? null : (
            <Link
              href={note.remedy.href}
              className="surface-ring rounded-pill px-3 py-1.5 type-sm font-[550] text-ink transition-micro hover:bg-s2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {note.remedy.label}
            </Link>
          )}
        </div>
      )}

      {bothVersions ? (
        <p className="type-meta text-muted">
          Both versions are saved. Picking one here does not delete the other.
        </p>
      ) : null}

      {/* ── MADE EARLIER ────────────────────────────────────────────────────
          Judging one picture against the last one is the work, and it cannot be
          done by scrolling to a grid and back. The age is rendered on the SERVER
          and passed down: a relative time computed in the browser is computed
          against a clock the server never saw. */}
      {pictures.length === 0 ? null : (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="type-eyebrow text-muted">Made earlier</span>
            <div className="h-px flex-1 bg-line-soft" />
          </div>

          <ul
            className="grid grid-cols-3 gap-3 narrow:grid-cols-6 wide:grid-cols-8"
            data-guide="studio-strip"
          >
            {pictures.map((picture) => {
              const on = picture.imageId === (active?.imageId ?? null)
              const meta = [picture.formatId, picture.madeAgo].filter(Boolean).join(' · ')
              return (
                <li key={picture.imageId} className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => onPick(picture.imageId)}
                    aria-pressed={on}
                    aria-label={picture.prompt}
                    className={`surface-ring relative block aspect-square w-full overflow-hidden rounded-input transition-micro hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      on ? 'ring-2 ring-accent' : ''
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- as above. */}
                    <img
                      src={picture.stampedUrl ?? picture.url}
                      // Empty on purpose: the BUTTON carries the prompt, and a
                      // screen reader announcing it twice makes a strip of
                      // twelve read as twenty-four things.
                      alt=""
                      // Top-anchored: a square crop of a portrait photograph
                      // cuts a face off at the chin, and this product's
                      // pictures are food, shopfronts and people.
                      className="size-full object-cover object-top"
                    />
                  </button>
                  {meta === '' ? null : <span className="num type-meta text-muted">{meta}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <p className="type-meta text-muted">
        Every picture is saved to your library the moment it is made, so nothing is lost if you
        leave.
      </p>
    </section>
  )
}
